module Ai
  # Resumo curto (≤ 600 caracteres) de um curso do UniverCampus, gravado em
  # `products.metadata.ai_brief` para servir de contexto ao GenerateService.
  #
  # Uma chamada Haiku por digest: GET /cursos/:id/conteudo devolve o texto do
  # curso e `digest` (SHA-256 desse texto). Se o digest é o mesmo do último
  # resumo (`metadata.ai_brief_digest`), nada é chamado. A capa vai como bloco
  # de imagem por URL (só https).
  #
  # Nunca levanta para quem chama (o sync segue): devolve
  # :updated | :unchanged | :skipped_cap | :not_found | :failed.
  class CourseBriefService < BaseService
    include ::Integrations::Univercampus::WorkspaceScope

    JOB_TYPE   = "course_brief".freeze
    MAX_CHARS  = 600
    MAX_TOKENS = 400

    SYSTEM_PROMPT = <<~PROMPT.freeze
      Você resume cursos online para quem vai escrever avaliações de alunos.
      Escreva em português do Brasil, em texto corrido, sem markdown e sem listas,
      com no máximo #{MAX_CHARS} caracteres, cobrindo: para quem é o curso, o que
      ele ensina, os módulos principais, a promessa (o resultado esperado) e o tom
      do professor. Use só o que estiver no conteúdo e na capa — não invente.
      Responda apenas com o resumo.
    PROMPT

    def initialize(workspace, client:)
      super(workspace)
      @client = client
    end

    def call(product)
      content  = @client.course_content(product.platform_product_id)
      digest   = content["digest"].to_s
      metadata = product.metadata.is_a?(Hash) ? product.metadata : {}
      return :unchanged if digest.present? && metadata["ai_brief_digest"] == digest

      # AiJob (log de custo) e AiCostCap leem/gravam ai_jobs, que tem RLS.
      with_rls(@workspace.id) do
        next :skipped_cap if AiCostCap.exceeded?(@workspace)

        text = call_claude(
          model:      HAIKU,
          system:     SYSTEM_PROMPT,
          max_tokens: MAX_TOKENS,
          messages:   [{ role: "user", content: content_blocks(product, metadata, content) }]
        )
        brief = clean(text)
        next :failed if brief.blank?

        updated = metadata.deep_dup
        updated["ai_brief"]        = brief
        updated["ai_brief_digest"] = digest
        uc = updated["univercampus"].is_a?(Hash) ? updated["univercampus"] : {}
        updated["univercampus"] = uc.merge("digest" => digest)
        product.update!(metadata: updated)
        :updated
      end
    rescue ::Integrations::Univercampus::Client::NotFound
      with_rls(@workspace.id) { product.update!(active: false) }
      :not_found
    rescue ::Integrations::Univercampus::Client::Error, Faraday::Error => e
      Rails.logger.warn("[UC-BRIEF] product=#{product.id} falhou: #{e.class}: #{e.message}")
      :failed
    end

    private

    def content_blocks(product, metadata, content)
      blocks = []
      if product.image_url.to_s.start_with?("https://")
        blocks << { type: "image", source: { type: "url", url: product.image_url } }
      end

      escola = metadata.dig("univercampus", "escola")
      escola_nome = escola["nome"] if escola.is_a?(Hash)
      text = [
        "Curso: #{product.title}",
        ("Escola: #{escola_nome}" if escola_nome.present?),
        "",
        "Conteúdo do curso#{' (cortado)' if content['cortado']}:",
        content["texto"].to_s
      ].compact.join("\n")
      blocks << { type: "text", text: text }
      blocks
    end

    def clean(text)
      text.to_s.strip
          .gsub(/\A["“]+|["”]+\z/, "")
          .gsub(/\s+/, " ")
          .strip
          .truncate(MAX_CHARS, separator: " ", omission: "…")
    end
  end
end
