# Sincroniza os cursos do UniverCampus de um workspace como produtos.
# Erros transitórios (429/5xx/timeout) sobem e o retry_on do ApplicationJob
# tenta de novo; 401/403 marcam a conexão inválida e param por aqui.
class UnivercampusSyncJob < ApplicationJob
  queue_as :imports

  def perform(workspace_id)
    workspace = Workspace.find_by(id: workspace_id)
    return unless workspace

    connection = with_workspace_rls(workspace_id) do
      UnivercampusConnection.active.find_by(workspace_id: workspace_id)
    end
    unless connection
      Rails.logger.info("[UC-SYNC] workspace=#{workspace_id} sem conexão ativa — nada a fazer")
      return
    end

    result = ::Integrations::Univercampus::CourseSyncer.run(connection: connection)
    Rails.logger.info("[UC-SYNC] job-result workspace=#{workspace_id} #{result.except(:errors).inspect}")
  end
end
