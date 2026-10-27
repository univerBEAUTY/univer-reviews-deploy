module Ai
  # Resumo curto (≤ 600 caracteres) de um curso do UniverCampus, gravado em
  # `products.metadata.ai_brief` para servir de contexto ao GenerateService.
  #
  # Uma chamada Haiku por digest: GET /cursos/:id/conteudo devolve o texto do
  # curso e `digest` (SHA-256 desse texto). Se o digest é o mesmo do último
  # resumo (`metadata.ai_brief_digest`), nada é chamado. A capa vai como bloco
  # de imagem por URL (só https).
  #
  # Escola (produto "escola:<id>") não chama a API: o texto é a descrição dela
  # mais os cursos ativos já sincronizados (título + começo da descrição), e o
  # digest é o SHA-256 desse texto.
  #
  # Nunca levanta para quem chama (o sync segue): devolve
  # :updated | :unchanged | :skipped_cap | :skipped_empty | :not_found | :failed.
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

    SCHOOL_PROMPT = <<~PROMPT.freeze
      Você resume escolas online para quem vai escrever avaliações de alunos sobre
      a escola como um todo. Escreva em português do Brasil, em texto corrido, sem
      markdown e sem listas, com no máximo #{MAX_CHARS} caracteres, cobrindo: o que
      a escola ensina, para quem, os cursos de destaque, a proposta e o tom. Use só
      o que estiver no texto e na logo — não invente.
      Responda apenas com o resumo.
    PROMPT

    SCHOOL_COURSES       = 30
    SCHOOL_COURSE_CHARS  = 200
    SCHOOL_DESCRIPTION   = 2_000

    def initialize(workspace, client:)
      super(workspace)
      @client = client
    end

    def call(product)
      school   = ::Integrations::Univercampus::School.school?(product)
      content  = school ? school_content(product) : @client.course_content(product.platform_product_id)
      return :skipped_empty if school && content["texto"].blank? # só o nome: a IA inventaria
      digest   = content["digest"].to_s
      metadata = product.metadata.is_a?(Hash) ? product.metadata : {}
      return :unchanged if digest.present? && metadata["ai_brief_digest"] == digest

      # AiJob (log de custo) e AiCostCap leem/gravam ai_jobs, que tem RLS.
      with_rls(@workspace.id) do
        next :skipped_cap if AiCostCap.exceeded?(@workspace)

        text = call_claude(
          model:      HAIKU,
          system:     school ? SCHOOL_PROMPT : SYSTEM_PROMPT,
          max_tokens: MAX_TOKENS,
          messages:   [{ role: "user", content: content_blocks(product, metadata, content, school) }]
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

    def school_content(product)
      school_id = ::Integrations::Univercampus::School.school_id(product)
      courses = with_rls(@workspace.id) do
        @workspace.products
                  .where(platform: product.platform, active: true)
                  .where("metadata->'univercampus'->'escola'->>'id' = ?", school_id)
                  .where.not(id: product.id)
                  .order(:title)
                  .limit(SCHOOL_COURSES)
                  .pluck(:title, :description)
      end

      lines = courses.map do |title, description|
        about = plain(description).truncate(SCHOOL_COURSE_CHARS, separator: " ")
        about.present? ? "- #{title}: #{about}" : "- #{title}"
      end
      text = [
        plain(product.description).truncate(SCHOOL_DESCRIPTION, separator: " ").presence,
        ("Cursos:\n#{lines.join("\n")}" if lines.any?)
      ].compact.join("\n\n")

      { "digest" => Digest::SHA256.hexdigest(text), "texto" => text, "cortado" => false }
    end

    def plain(html)
      html.to_s.gsub(/<[^>]+>/, " ").gsub(/\s+/, " ").strip
    end

    def content_blocks(product, metadata, content, school = false)
      blocks = []
      if product.image_url.to_s.start_with?("https://")
        blocks << { type: "image", source: { type: "url", url: product.image_url } }
      end

      if school
        blocks << { type: "text", text: "Escola: #{product.title}\n\n#{content['texto']}" }
        return blocks
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
