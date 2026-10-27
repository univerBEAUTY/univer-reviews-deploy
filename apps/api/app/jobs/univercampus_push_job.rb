# Publica/remove reviews no UniverCampus.
#
# Dois modos:
#   • product_id: (debounce) — drena o PushBuffer do curso e enfileira um job
#     concreto com os ids. Assim um retry do envio nunca perde ids já drenados.
#   • review_ids/deleted_ids ou all_approved: true — chama o ReviewPublisher.
#     429/5xx/timeout sobem e o retry_on do ApplicationJob tenta de novo.
class UnivercampusPushJob < ApplicationJob
  queue_as :imports

  DEBOUNCE = ::Integrations::Univercampus::PushBuffer::WINDOW.seconds

  # Chamado pelo after_commit de Review. Sem Redis, envia sem debounce.
  def self.enqueue_debounced(workspace_id:, product_id:, upsert_ids: [], delete_ids: [])
    opened = ::Integrations::Univercampus::PushBuffer.add(
      workspace_id: workspace_id, product_id: product_id, upsert_ids: upsert_ids, delete_ids: delete_ids
    )
    set(wait: DEBOUNCE).perform_later(workspace_id, product_id: product_id) if opened
  rescue RedisClient::Error, Redis::BaseError => e
    Rails.logger.warn("[UC-PUSH] Redis indisponível, push sem debounce: #{e.class}: #{e.message}")
    perform_later(workspace_id, review_ids: upsert_ids, deleted_ids: delete_ids)
  end

  def perform(workspace_id, review_ids: [], deleted_ids: [], product_id: nil, all_approved: false)
    if product_id
      upserts, deletes = ::Integrations::Univercampus::PushBuffer.drain(workspace_id: workspace_id, product_id: product_id)
      self.class.perform_later(workspace_id, review_ids: upserts, deleted_ids: deletes) if upserts.any? || deletes.any?
      return
    end

    return unless Workspace.exists?(id: workspace_id)

    connection = with_workspace_rls(workspace_id) do
      UnivercampusConnection.active.find_by(workspace_id: workspace_id)
    end
    return unless connection

    publisher = ::Integrations::Univercampus::ReviewPublisher.new(connection: connection)
    result = all_approved ? publisher.publish_all : publisher.call(review_ids: review_ids, deleted_ids: deleted_ids)
    Rails.logger.info("[UC-PUSH] workspace=#{workspace_id} #{result.except(:errors).inspect}")
  end
end
