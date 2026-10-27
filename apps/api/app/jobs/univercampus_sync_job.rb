# Sincroniza os cursos do UniverCampus de um workspace como produtos e depois
# atualiza os resumos IA (Ai::CourseBriefService — 1 chamada Haiku por digest).
#
# Erros transitórios (429/5xx/timeout) do sync sobem e o retry_on do
# ApplicationJob tenta de novo; 401/403 marcam a conexão inválida e param por
# aqui. Falha de IA nunca derruba o job (a geração cai para a descrição).
#
# `briefs_only: true` pula o sync — usado depois do "Sincronizar agora" inline
# do admin, que já sincronizou na própria request.
class UnivercampusSyncJob < ApplicationJob
  queue_as :imports

  def perform(workspace_id, briefs_only: false)
    workspace = Workspace.find_by(id: workspace_id)
    return unless workspace

    connection = with_workspace_rls(workspace_id) do
      UnivercampusConnection.active.find_by(workspace_id: workspace_id)
    end
    unless connection
      Rails.logger.info("[UC-SYNC] workspace=#{workspace_id} sem conexão ativa — nada a fazer")
      return
    end

    unless briefs_only
      result = ::Integrations::Univercampus::CourseSyncer.run(connection: connection)
      Rails.logger.info("[UC-SYNC] job-result workspace=#{workspace_id} #{result.except(:errors).inspect}")
      return if result[:stage] == "auth"
    end

    refresh_briefs(workspace, connection)
  end

  private

  def refresh_briefs(workspace, connection)
    products = with_workspace_rls(workspace.id) do
      workspace.products.where(platform: ::Integrations::Univercampus::CourseSyncer::PLATFORM, active: true).to_a
    end
    return if products.empty?

    service = Ai::CourseBriefService.new(workspace, client: connection.client)
    tally   = products.map { |product| service.call(product) }.tally
    Rails.logger.info("[UC-BRIEF] workspace=#{workspace.id} #{tally.inspect}")
  rescue Ai::BaseService::MissingApiKeyError => e
    Rails.logger.warn("[UC-BRIEF] workspace=#{workspace.id} resumos pulados: #{e.message}")
  end
end
