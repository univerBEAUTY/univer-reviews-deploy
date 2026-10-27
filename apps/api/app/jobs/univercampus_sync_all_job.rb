# Cron diário (config/sidekiq.yml): enfileira UnivercampusSyncJob para cada
# workspace ativo com conexão UniverCampus ativa. A busca da conexão roda com
# o tenant setado porque univercampus_connections tem FORCE ROW LEVEL SECURITY.
class UnivercampusSyncAllJob < ApplicationJob
  queue_as :imports

  def perform
    Workspace.active.find_each do |workspace|
      connected = with_workspace_rls(workspace.id) do
        UnivercampusConnection.active.exists?(workspace_id: workspace.id)
      end
      UnivercampusSyncJob.perform_later(workspace.id) if connected
    end
  end
end
