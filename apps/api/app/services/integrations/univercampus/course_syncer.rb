module Integrations
  module Univercampus
    # Lê todos os cursos que o token enxerga e faz upsert como produtos
    # `platform: "univercampus"` (platform_product_id = id do curso). Cursos
    # que sumiram da API (arquivados ou de escola que o dono perdeu) viram
    # `active: false`; voltam a `true` se reaparecerem.
    #
    # Sempre busca a lista completa (sem `atualizadoDesde`): só assim dá para
    # saber quais cursos sumiram.
    #
    # Erros: 401/403 → conexão marcada inválida e `{ ok: false, stage: "auth" }`.
    # 429/5xx/timeout → grava last_error e relança (o job tenta de novo).
    class CourseSyncer
      include WorkspaceScope

      PLATFORM = "univercampus".freeze

      def self.run(connection:, client: nil)
        new(connection: connection, client: client).run
      end

      def initialize(connection:, client: nil)
        @connection = connection
        @workspace  = connection.workspace
        @client     = client || connection.client
      end

      def run
        courses     = @client.courses
        synced      = 0
        failed      = 0
        deactivated = 0
        errors      = []
        seen_ids    = []

        with_rls(@workspace.id) do
          courses.each do |course|
            seen_ids << course["id"].to_s
            # Savepoint por curso: um erro de banco num curso não envenena a
            # transação dos demais.
            ActiveRecord::Base.transaction(requires_new: true) { upsert(course) }
            synced += 1
          rescue StandardError => e
            failed += 1
            errors << { id: course["id"], titulo: course["titulo"], error: "#{e.class}: #{e.message}" }
            Rails.logger.warn("[UC-SYNC] curso=#{course['id']} falhou: #{e.message}")
          end

          deactivated = @workspace.products
                                  .where(platform: PLATFORM, active: true)
                                  .where.not(platform_product_id: seen_ids)
                                  .update_all(active: false, last_synced_at: Time.current)

          @connection.update!(
            last_synced_at: Time.current,
            last_error:     failed.zero? ? nil : "#{failed} curso(s) com erro: #{errors.first[:error]}".truncate(1000)
          )
        end

        Rails.logger.info(
          "[UC-SYNC] workspace=#{@workspace.id} fetched=#{courses.size} synced=#{synced} failed=#{failed} deactivated=#{deactivated}"
        )

        {
          ok:            failed.zero?,
          total_fetched: courses.size,
          synced:        synced,
          failed:        failed,
          deactivated:   deactivated,
          errors:        errors.first(20)
        }
      rescue Client::AuthError => e
        with_rls(@workspace.id) { @connection.mark_invalid!(e.message) }
        { ok: false, stage: "auth", error: e.message, total_fetched: 0, synced: 0, failed: 0, deactivated: 0 }
      rescue Client::Error => e
        with_rls(@workspace.id) { @connection.record_error!(e.message) }
        raise
      end

      private

      def upsert(course)
        product = @workspace.products.find_or_initialize_by(
          platform:            PLATFORM,
          platform_product_id: course["id"].to_s
        )

        metadata = product.metadata.is_a?(Hash) ? product.metadata.dup : {}
        previous = metadata["univercampus"].is_a?(Hash) ? metadata["univercampus"] : {}
        metadata["univercampus"] = previous.merge(
          "escola"        => course["escola"],
          "slug"          => course["slug"],
          "url"           => course["url"],
          "status"        => course["status"],
          "atualizado_em" => course["atualizadoEm"]
        )

        product.assign_attributes(
          title:          course["titulo"],
          handle:         course["slug"],
          description:    course["descricao"],
          image_url:      course["capaUrl"],
          price:          cents_to_price(course["precoCentavos"]),
          currency:       "BRL",
          active:         true,
          metadata:       metadata,
          last_synced_at: Time.current
        )
        product.save!
      end

      def cents_to_price(cents)
        return nil if cents.nil?
        BigDecimal(cents.to_s) / 100
      end
    end
  end
end
