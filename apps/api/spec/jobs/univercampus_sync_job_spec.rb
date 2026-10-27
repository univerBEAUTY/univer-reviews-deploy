require "rails_helper"

RSpec.describe UnivercampusSyncJob, type: :job do
  let!(:workspace) { create(:workspace) }
  let(:brief)      { instance_double(Ai::CourseBriefService, call: :updated) }

  before { allow(Ai::CourseBriefService).to receive(:new).and_return(brief) }

  context "com conexão ativa" do
    let!(:connection) { create(:univercampus_connection, workspace: workspace) }
    let!(:course)     { create(:product, :univercampus, workspace: workspace) }

    it "roda o CourseSyncer e depois atualiza os resumos dos cursos ativos" do
      create(:product, :univercampus, workspace: workspace, active: false)
      create(:product, workspace: workspace) # woocommerce — fora

      expect(Integrations::Univercampus::CourseSyncer).to receive(:run).with(connection: connection).and_return(ok: true, synced: 1)
      expect(Ai::CourseBriefService).to receive(:new).with(workspace, client: kind_of(Integrations::Univercampus::Client)).and_return(brief)
      expect(brief).to receive(:call).with(course).once.and_return(:updated)

      described_class.perform_now(workspace.id)
    end

    it "briefs_only pula o sync" do
      expect(Integrations::Univercampus::CourseSyncer).not_to receive(:run)
      expect(brief).to receive(:call).with(course)
      described_class.perform_now(workspace.id, briefs_only: true)
    end

    it "token recusado no sync não gera resumos" do
      allow(Integrations::Univercampus::CourseSyncer).to receive(:run).and_return(ok: false, stage: "auth")
      expect(brief).not_to receive(:call)
      described_class.perform_now(workspace.id)
    end

    it "sem ANTHROPIC_API_KEY o sync acontece e os resumos são pulados" do
      allow(Integrations::Univercampus::CourseSyncer).to receive(:run).and_return(ok: true)
      allow(Ai::CourseBriefService).to receive(:new).and_raise(Ai::BaseService::MissingApiKeyError, "sem chave")
      expect { described_class.perform_now(workspace.id) }.not_to raise_error
    end
  end

  it "não faz nada sem conexão ativa" do
    create(:univercampus_connection, :invalid, workspace: workspace)
    expect(Integrations::Univercampus::CourseSyncer).not_to receive(:run)
    described_class.perform_now(workspace.id)
  end

  it "usa a fila imports" do
    expect(described_class.queue_name).to eq("imports")
  end
end
