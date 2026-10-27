module Integrations
  module Univercampus
    # Publica reviews no UniverCampus (PUT /avaliacoes) ou remove de lá
    # (DELETE /avaliacoes/:idExterno). idExterno = review.id.
    #
    # Publicável = aprovada, com texto, de produto univercampus ativo. Qualquer
    # outra review recebida (rascunho, rejeitada, sem texto, apagada, movida
    # para outro produto) vira DELETE — idempotente do outro lado.
    #
    # Upserts vão agrupados por curso, em lotes de até 100. 404 de um curso
    # (escola que o dono perdeu) desativa o produto e descarta o push daquele
    # curso. Erros por item (`erros`) vão para last_error e o resto segue.
    # 401/403 marcam a conexão inválida; 429/5xx/timeout gravam last_error e
    # relançam para o job tentar de novo.
    class ReviewPublisher
      include WorkspaceScope

      PLATFORM        = CourseSyncer::PLATFORM
      BATCH_SIZE      = Client::MAX_BATCH
      MAX_TEXT        = 5_000
      MAX_AUTHOR      = 120
      FALLBACK_AUTHOR = "Aluno".freeze

      def initialize(connection:, client: nil)
        @connection = connection
        @workspace  = connection.workspace
        @client     = client || connection.client
      end

      # Reenvia todas as aprovadas dos cursos ativos ("Reenviar avaliações").
      def publish_all
        ids = with_rls(@workspace.id) do
          @workspace.reviews.approved.joins(:product)
                    .where(products: { platform: PLATFORM, active: true })
                    .pluck(:id)
        end
        call(review_ids: ids)
      end

      def call(review_ids: [], deleted_ids: [])
        review_ids = Array(review_ids).map(&:to_s).uniq
        reviews    = with_rls(@workspace.id) { @workspace.reviews.includes(:product).where(id: review_ids).to_a }

        publishable, unpublishable = reviews.partition { |review| publishable?(review) }
        missing_ids = review_ids - reviews.map { |review| review.id.to_s }
        delete_ids  = (Array(deleted_ids).map(&:to_s) + missing_ids + unpublishable.map { |r| r.id.to_s }).uniq

        errors   = []
        upserted = upsert_by_course(publishable, errors)
        delete_ids.each { |id| @client.delete_review(id) }

        with_rls(@workspace.id) do
          @connection.update!(
            last_pushed_at: Time.current,
            last_error:     errors.empty? ? nil : errors.first(5).join("; ").truncate(1000)
          )
        end

        { ok: errors.empty?, upserted: upserted, deleted: delete_ids.size, errors: errors }
      rescue Client::AuthError => e
        with_rls(@workspace.id) { @connection.mark_invalid!(e.message) }
        { ok: false, stage: "auth", error: e.message, upserted: 0, deleted: 0, errors: [e.message] }
      rescue Client::Error => e
        with_rls(@workspace.id) { @connection.record_error!(e.message) }
        raise
      end

      private

      def upsert_by_course(reviews, errors)
        total = 0
        reviews.group_by(&:product).each do |product, list|
          list.each_slice(BATCH_SIZE) do |slice|
            response = @client.upsert_reviews(slice.map { |review| payload(review) })
            total += response["salvas"].to_i
            Array(response["erros"]).each { |item| errors << "#{item['idExterno']}: #{item['erro']}" }
          end
        rescue Client::NotFound
          with_rls(@workspace.id) { product.update!(active: false) }
          errors << "curso #{product.platform_product_id} não encontrado no UniverCampus — produto desativado"
        end
        total
      end

      def publishable?(review)
        product = review.product
        review.status == "approved" &&
          product.present? && product.platform == PLATFORM && product.active? &&
          review.body.to_s.strip.present?
      end

      def payload(review)
        {
          idExterno:    review.id,
          cursoId:      review.product.platform_product_id,
          nota:         review.rating,
          titulo:       review.title.presence,
          texto:        review.body.to_s.strip.first(MAX_TEXT),
          autorNome:    (review.author_name.to_s.strip.presence || FALLBACK_AUTHOR).first(MAX_AUTHOR),
          autorFotoUrl: review.author_avatar_url.to_s.start_with?("https://") ? review.author_avatar_url : nil,
          sintetica:    synthetic?(review),
          destaque:     review.is_featured == true,
          publicadaEm:  (review.approved_at || review.created_at).iso8601
        }
      end

      # Os dois marcadores de review gerada por máquina (ver Review.real).
      def synthetic?(review)
        return true if review.ai_is_synthetic == true
        review.metadata.is_a?(Hash) && review.metadata["ai_generated"].to_s == "true"
      end
    end
  end
end
