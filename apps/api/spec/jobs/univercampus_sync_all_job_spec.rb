require "rails_helper"

RSpec.describe UnivercampusSyncAllJob, type: :job do
  it "enfileira sync só para workspaces ativos com conexão ativa" do
    ativo    = create(:workspace).tap { |w| create(:univercampus_connection, workspace: w) }
    invalido = create(:workspace).tap { |w| create(:univercampus_connection, :invalid, workspace: w) }
    suspenso = create(:workspace, :suspended).tap { |w| create(:univercampus_connection, workspace: w) }
    sem      = create(:workspace)

    described_class.new.perform

    ids = ActiveJob::Base.queue_adapter.enqueued_jobs
                         .select { |j| j[:job] == UnivercampusSyncJob }
                         .map { |j| j[:args].first }
    expect(ids).to include(ativo.id)
    expect(ids).not_to include(invalido.id, suspenso.id, sem.id)
  end

  it "está agendado diariamente no sidekiq.yml" do
    yaml = YAML.safe_load(
      ERB.new(File.read(Rails.root.join("config/sidekiq.yml"))).result,
      permitted_classes: [Symbol], aliases: true
    )
    expect(yaml[:schedule]["sync_univercampus_courses"])
      .to include("class" => "UnivercampusSyncAllJob", "queue" => "imports", "cron" => "30 6 * * *")
  end
end
