require "rails_helper"

RSpec.describe UnivercampusSyncJob, type: :job do
  let!(:workspace) { create(:workspace) }

  it "roda o CourseSyncer para a conexão ativa" do
    connection = create(:univercampus_connection, workspace: workspace)
    expect(Integrations::Univercampus::CourseSyncer).to receive(:run).with(connection: connection).and_return(ok: true, synced: 2)
    described_class.perform_now(workspace.id)
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
