require "rails_helper"

# CRITICAL: this spec is the only proof we have that workspace A cannot
# read workspace B's data via raw queries. The application layer scopes
# queries with `current_workspace.X` but if RLS ever degrades (missing
# policy, FORCE OFF, session-level SET instead of LOCAL, etc.) every
# query becomes a privilege boundary leak.
#
# We DO NOT stub set_rls_workspace here. We exercise the real PostgreSQL
# row_security policies created in the initial_schema migration + the
# follow-up migrations for ai_summary_topics, question_groups, etc.
#
# When this spec fails, do NOT change the assertions to "fix" it.
# Investigate which table lost its policy.
RSpec.describe "Row-Level Security · cross-tenant isolation", type: :model do
  # The DB user used in CI (`postgres`) is the table owner. PostgreSQL
  # historically lets table owners bypass RLS unless FORCE ROW LEVEL
  # SECURITY is set. Every workspace-scoped table in this app uses FORCE,
  # so this test verifies that contract on the actual schema, not in a
  # mock. If the assertion fails it means a migration forgot the FORCE
  # clause and the SECURITY DEFINER / owner bypass is back.

  let!(:workspace_a) { create(:workspace, slug: "rls-a") }
  let!(:workspace_b) { create(:workspace, slug: "rls-b") }

  let!(:product_a) { create(:product, workspace: workspace_a, title: "Product A") }
  let!(:product_b) { create(:product, workspace: workspace_b, title: "Product B") }

  let!(:review_a) do
    create(:review, :approved, workspace: workspace_a, product: product_a, body: "owned by A").tap do |r|
      # Approval timestamp is irrelevant; we just need a row tied to A.
    end
  end

  let!(:review_b) do
    create(:review, :approved, workspace: workspace_b, product: product_b, body: "owned by B")
  end

  # Detect if the current connection is a superuser. Superusers bypass
  # row_security unless we demote via SET LOCAL ROLE. CI provisions
  # `rls_test_role` (NOSUPERUSER) precisely so the spec can demote here.
  def superuser_connection?
    ActiveRecord::Base.connection
      .select_value("SELECT current_setting('is_superuser')") == "on"
  end

  def with_workspace_rls(workspace_id)
    # Real RLS contract: SET LOCAL inside a transaction + force
    # row_security back on. Same path the controllers take. When the
    # connection is a superuser (CI default) we additionally SET LOCAL
    # ROLE to a NOSUPERUSER role so the policy actually enforces — the
    # production app user is non-superuser by design.
    ActiveRecord::Base.transaction(requires_new: true) do
      conn = ActiveRecord::Base.connection

      if superuser_connection?
        # Skip-and-warn when the test role wasn't provisioned. The CI
        # job creates it; local devs can mirror the SQL block in
        # apps/api/db/development_setup.sql or run rspec against a
        # non-superuser DB user instead.
        role_exists = conn.select_value(
          "SELECT 1 FROM pg_roles WHERE rolname = 'rls_test_role'"
        )
        if role_exists.nil?
          skip "Connection is superuser and `rls_test_role` is missing — provision it in your test DB (see .github/workflows/ci.yml `Provision non-superuser role` step)."
        end
        conn.execute("SET LOCAL ROLE rls_test_role")
      end

      conn.execute(
        ActiveRecord::Base.sanitize_sql(["SET LOCAL app.workspace_id = ?", workspace_id.to_s])
      )
      conn.execute("SET LOCAL row_security = on")
      yield
      raise ActiveRecord::Rollback # discard mutations, keep test isolated
    end
  end

  describe "Review" do
    it "scope A only sees A's review when RLS is set to A" do
      with_workspace_rls(workspace_a.id) do
        ids = Review.pluck(:id)
        expect(ids).to     include(review_a.id)
        expect(ids).not_to include(review_b.id)
      end
    end

    it "scope B only sees B's review when RLS is set to B" do
      with_workspace_rls(workspace_b.id) do
        ids = Review.pluck(:id)
        expect(ids).to     include(review_b.id)
        expect(ids).not_to include(review_a.id)
      end
    end

    it "raw find on the other tenant's id returns nothing (RecordNotFound)" do
      with_workspace_rls(workspace_a.id) do
        expect { Review.find(review_b.id) }.to raise_error(ActiveRecord::RecordNotFound)
      end
    end
  end

  describe "Product" do
    it "is isolated per workspace" do
      with_workspace_rls(workspace_a.id) do
        expect(Product.pluck(:id)).to eq([product_a.id])
      end
      with_workspace_rls(workspace_b.id) do
        expect(Product.pluck(:id)).to eq([product_b.id])
      end
    end
  end

  describe "AiSummaryTopic" do
    let!(:topic_a) { create(:ai_summary_topic, workspace: workspace_a, product: product_a, title: "A topic", position: 0) }
    let!(:topic_b) { create(:ai_summary_topic, workspace: workspace_b, product: product_b, title: "B topic", position: 0) }

    it "is isolated per workspace" do
      with_workspace_rls(workspace_a.id) do
        expect(AiSummaryTopic.pluck(:id)).to eq([topic_a.id])
      end
      with_workspace_rls(workspace_b.id) do
        expect(AiSummaryTopic.pluck(:id)).to eq([topic_b.id])
      end
    end

    it "cannot be updated via the wrong workspace" do
      with_workspace_rls(workspace_a.id) do
        # update_all should affect 0 rows for B's topic, not raise.
        affected = AiSummaryTopic.where(id: topic_b.id).update_all(title: "HIJACKED")
        expect(affected).to eq(0)
      end
      # Confirm topic_b is unchanged.
      expect(topic_b.reload.title).to eq("B topic")
    end
  end

  describe "UnivercampusConnection" do
    let!(:conn_a) { create(:univercampus_connection, workspace: workspace_a) }
    let!(:conn_b) { create(:univercampus_connection, workspace: workspace_b) }

    it "is isolated per workspace" do
      with_workspace_rls(workspace_a.id) do
        expect(UnivercampusConnection.pluck(:id)).to eq([conn_a.id])
      end
      with_workspace_rls(workspace_b.id) do
        expect(UnivercampusConnection.pluck(:id)).to eq([conn_b.id])
      end
    end
  end

  describe "foreign workspace context" do
    # FORCE ROW LEVEL SECURITY means even the table owner can't bypass
    # the policy. We can't reliably test "unset" because the GUC may
    # already carry an empty string from a prior controller spec, and
    # the policy's `::uuid` cast raises on empty values (security-wise
    # this is a "fail closed" outcome — query errors instead of leaking
    # — but it's awkward to assert against). Instead we pin a known-
    # nonexistent workspace UUID and assert ZERO rows are visible.
    # Same security claim, deterministic outcome.
    it "every workspace-scoped table is empty when scoped to a UUID that doesn't exist" do
      foreign_id = "00000000-0000-0000-0000-000000000000"

      ActiveRecord::Base.transaction(requires_new: true) do
        conn = ActiveRecord::Base.connection

        if superuser_connection?
          role_exists = conn.select_value(
            "SELECT 1 FROM pg_roles WHERE rolname = 'rls_test_role'"
          )
          skip "Connection is superuser and `rls_test_role` missing." if role_exists.nil?
          conn.execute("SET LOCAL ROLE rls_test_role")
        end

        conn.execute(
          ActiveRecord::Base.sanitize_sql(["SET LOCAL app.workspace_id = ?", foreign_id])
        )
        conn.execute("SET LOCAL row_security = on")

        expect(Review.count).to  eq(0)
        expect(Product.count).to eq(0)

        raise ActiveRecord::Rollback
      end
    end
  end

  describe "workspace metadata table itself" do
    # The `workspaces` table is intentionally NOT RLS-scoped (it has no
    # workspace_id column — it IS the workspace). This test exists so
    # someone adding RLS to `workspaces` by mistake will see the contract
    # break here instead of in production.
    it "remains globally readable" do
      with_workspace_rls(workspace_a.id) do
        expect(Workspace.where(id: [workspace_a.id, workspace_b.id]).count).to eq(2)
      end
    end
  end
end
