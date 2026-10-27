require "rails_helper"

RSpec.describe UnivercampusPushJob, type: :job do
  include ActiveSupport::Testing::TimeHelpers

  let!(:workspace) { create(:workspace) }
  let(:product_id) { SecureRandom.uuid }
  let(:buffer)     { Integrations::Univercampus::PushBuffer }

  describe ".enqueue_debounced" do
    it "quem abre a janela agenda o job daqui a 10s" do
      allow(buffer).to receive(:add).and_return(true)
      freeze_time do
        expect {
          described_class.enqueue_debounced(workspace_id: workspace.id, product_id: product_id, upsert_ids: ["r1"])
        }.to have_enqueued_job(described_class).with(workspace.id, product_id: product_id).at(10.seconds.from_now)
      end
    end

    it "mudanças dentro da janela não agendam outro job" do
      allow(buffer).to receive(:add).and_return(false)
      expect {
        described_class.enqueue_debounced(workspace_id: workspace.id, product_id: product_id, upsert_ids: ["r2"])
      }.not_to have_enqueued_job(described_class)
    end

    it "sem Redis envia direto, sem debounce" do
      allow(buffer).to receive(:add).and_raise(RedisClient::CannotConnectError, "down")
      expect {
        described_class.enqueue_debounced(workspace_id: workspace.id, product_id: product_id, upsert_ids: ["r1"], delete_ids: ["r9"])
      }.to have_enqueued_job(described_class).with(workspace.id, review_ids: ["r1"], deleted_ids: ["r9"])
    end
  end

  describe "#perform" do
    it "no modo debounce drena o buffer e enfileira o envio concreto" do
      allow(buffer).to receive(:drain).with(workspace_id: workspace.id, product_id: product_id).and_return([["r1"], ["r2"]])
      expect {
        described_class.perform_now(workspace.id, product_id: product_id)
      }.to have_enqueued_job(described_class).with(workspace.id, review_ids: ["r1"], deleted_ids: ["r2"])
    end

    it "buffer vazio não enfileira nada" do
      allow(buffer).to receive(:drain).and_return([[], []])
      expect { described_class.perform_now(workspace.id, product_id: product_id) }.not_to have_enqueued_job(described_class)
    end

    context "com conexão ativa" do
      let!(:connection) { create(:univercampus_connection, workspace: workspace) }
      let(:publisher)   { instance_double(Integrations::Univercampus::ReviewPublisher) }

      before { allow(Integrations::Univercampus::ReviewPublisher).to receive(:new).with(connection: connection).and_return(publisher) }

      it "publica os ids recebidos" do
        expect(publisher).to receive(:call).with(review_ids: ["r1"], deleted_ids: ["r2"]).and_return(ok: true, upserted: 1, deleted: 1, errors: [])
        described_class.perform_now(workspace.id, review_ids: ["r1"], deleted_ids: ["r2"])
      end

      it "all_approved reenvia todas" do
        expect(publisher).to receive(:publish_all).and_return(ok: true, upserted: 3, deleted: 0, errors: [])
        described_class.perform_now(workspace.id, all_approved: true)
      end
    end

    it "sem conexão ativa não publica" do
      create(:univercampus_connection, :invalid, workspace: workspace)
      expect(Integrations::Univercampus::ReviewPublisher).not_to receive(:new)
      described_class.perform_now(workspace.id, review_ids: ["r1"])
    end
  end
end
