require "rails_helper"

# The "real reviews" endpoints feed third-party pages and Google structured
# data (AggregateRating). The one thing they must never do is serve a review
# that a machine wrote — these specs pin that, marker by marker.
RSpec.describe "Public real reviews", type: :request do
  let!(:workspace) { create(:workspace) }
  # Unique per example: this suite's DB cleaner does not roll workspace rows back.
  let(:host)       { "escola-#{SecureRandom.hex(4)}.example.com" }
  let!(:domain)    { create(:workspace_domain, workspace: workspace, domain: host) }
  let!(:product)   { create(:product, workspace: workspace, title: "Liso Blindado") }
  let(:headers)    { { "X-Univer-Domain" => host } }

  before do
    # Bypass RLS for tests (same as the other request specs).
    allow_any_instance_of(ApplicationController).to receive(:set_rls_workspace)
  end

  def review!(**attrs)
    create(:review, :approved, { workspace: workspace, product: product, ai_is_synthetic: false }.merge(attrs))
  end

  describe "Review.real" do
    it "keeps approved, human reviews" do
      real = review!(rating: 5)
      expect(workspace.reviews.real).to contain_exactly(real)
    end

    it "drops rows flagged ai_is_synthetic" do
      review!(ai_is_synthetic: true)
      expect(workspace.reviews.real).to be_empty
    end

    it "drops rows whose metadata says ai_generated even when the flag was reset to false" do
      # Ai::ModerateService overwrites ai_is_synthetic with the detector's verdict.
      review!(ai_is_synthetic: false, metadata: { "ai_generated" => true })
      expect(workspace.reviews.real).to be_empty
    end

    it "treats a NULL flag as unknown, not as real" do
      r = review!
      r.update_columns(ai_is_synthetic: nil)
      expect(workspace.reviews.real).to be_empty
    end

    it "drops pending, rejected, hidden and spam rows" do
      create(:review, workspace: workspace, product: product, ai_is_synthetic: false)
      create(:review, :rejected, workspace: workspace, product: product, ai_is_synthetic: false)
      create(:review, :spam, workspace: workspace, product: product, ai_is_synthetic: false)
      expect(workspace.reviews.real).to be_empty
    end
  end

  describe "GET /api/v1/public/real-reviews" do
    it "requires the domain header" do
      get "/api/v1/public/real-reviews"
      expect(response).to have_http_status(:bad_request)
    end

    it "404s for an unregistered domain" do
      get "/api/v1/public/real-reviews", headers: { "X-Univer-Domain" => "nope.example.com" }
      expect(response).to have_http_status(:not_found)
    end

    it "returns only real reviews, with source, verification and product" do
      real = review!(rating: 5, source: "email", is_verified_purchase: true, author_name: "Ana")
      review!(rating: 5, source: "manual", ai_is_synthetic: true, metadata: { "ai_generated" => true })
      review!(rating: 5, source: "manual", metadata: { "ai_generated" => true })

      get "/api/v1/public/real-reviews", headers: headers

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["data"].map { |r| r["id"] }).to eq([real.id])
      row = body["data"].first
      expect(row).to include("source" => "email", "is_verified_purchase" => true, "author_name" => "Ana")
      expect(row["product"]).to include("title" => "Liso Blindado")
      expect(row).not_to have_key("author_email")
      expect(body["meta"]).to include("total_count" => 1, "filter" => "approved,non_ai_generated")
    end

    it "never leaks another workspace's reviews" do
      other = create(:review, :approved, ai_is_synthetic: false)
      review!
      get "/api/v1/public/real-reviews", headers: headers
      ids = JSON.parse(response.body)["data"].map { |r| r["id"] }
      expect(ids).not_to include(other.id)
    end

    it "filters by product title (case-insensitive contains) and never widens the real set" do
      other_product = create(:product, workspace: workspace, title: "Glow Express")
      mine   = review!
      review!(product: other_product)
      review!(ai_is_synthetic: true)

      get "/api/v1/public/real-reviews", params: { product_title: ["liso"] }, headers: headers
      expect(JSON.parse(response.body)["data"].map { |r| r["id"] }).to eq([mine.id])
    end

    it "treats % in a product title as a literal" do
      review!
      get "/api/v1/public/real-reviews", params: { product_title: ["%"] }, headers: headers
      expect(JSON.parse(response.body)["data"]).to be_empty
    end

    it "caps per_page at 50" do
      get "/api/v1/public/real-reviews", params: { per_page: 500 }, headers: headers
      expect(JSON.parse(response.body)["meta"]["per_page"]).to eq(50)
    end
  end

  describe "GET /api/v1/public/real-summary" do
    it "counts, averages and distributes real reviews only" do
      review!(rating: 5, is_verified_purchase: true)
      review!(rating: 4)
      review!(rating: 1, ai_is_synthetic: true)
      review!(rating: 5, metadata: { "ai_generated" => true })

      get "/api/v1/public/real-summary", headers: headers

      expect(response).to have_http_status(:ok)
      data = JSON.parse(response.body)["data"]
      expect(data["total_reviews"]).to eq(2)
      expect(data["avg_rating"]).to eq(4.5)
      expect(data["verified_count"]).to eq(1)
      expect(data["rating_distribution"].map { |d| d["count"] }).to eq([0, 0, 0, 1, 1])
      expect(data["products"]).to eq([{ "title" => "Liso Blindado", "count" => 2 }])
    end

    it "returns zeros when there is nothing real" do
      review!(ai_is_synthetic: true)
      get "/api/v1/public/real-summary", headers: headers
      data = JSON.parse(response.body)["data"]
      expect(data).to include("total_reviews" => 0, "avg_rating" => 0.0, "verified_count" => 0)
    end
  end
end
