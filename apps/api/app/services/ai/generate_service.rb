module Ai
  class GenerateService < BaseService
    JOB_TYPE = "generate"

    # How many variants Claude is asked to emit per HTTP call. With Sonnet
    # at ~400-500 tokens per review, 8 variants × 500 ≈ 4_000 output tokens
    # — well inside the 4096 cap below, with margin for the JSON envelope.
    # Larger batches truncate mid-array and crash parse_json_response.
    CHUNK_SIZE  = 8
    MAX_RETRIES = 1
    # Limite do contexto "About" (resumo IA do curso ou descrição do produto).
    ABOUT_MAX_CHARS = 600

    # Generates `count` review variants. When count > CHUNK_SIZE, the
    # request is split into multiple Claude calls and the results are
    # concatenated — this is what fixed the "Expected array of variants"
    # crash on count=20/30/50 batches: Claude was truncating the response
    # at max_tokens. Each chunk is independently parsed/retried so one bad
    # batch can't poison the whole job.
    #
    # `on_progress` is an optional Proc invoked with (completed, total)
    # after each chunk lands. Caller can use it for telemetry / SSE / DB
    # progress rows.
    def call(template:, product: nil, count: 3, on_progress: nil)
      total = count.to_i.clamp(1, 100)
      collected = []
      remaining = total

      while remaining.positive?
        chunk = [remaining, CHUNK_SIZE].min
        variants = generate_chunk(template: template, product: product, count: chunk)
        collected.concat(variants)
        remaining -= variants.length

        on_progress&.call(collected.length, total)

        # If Claude returned 0 valid variants in this chunk and we still
        # owe variants, bail rather than spin forever. Caller handles the
        # short-return.
        break if variants.empty?
      end

      collected.first(total)
    end

    private

    def generate_chunk(template:, product:, count:)
      system_prompt = build_system_prompt(product)
      user_content  = build_user_prompt(template, count)

      attempts = 0
      begin
        attempts += 1
        text = call_claude(
          model: SONNET,
          system: system_prompt,
          # 4096 keeps the response inside one network turn while leaving
          # the model enough room for an 8-review chunk including titles,
          # bodies, ratings and the wrapping JSON envelope. Sonnet's hard
          # cap is 8192; we stay below to keep latency predictable.
          max_tokens: 4096,
          messages: [{ role: "user", content: user_content }]
        )

        result = parse_json_response(text)
        variants = result[:variants] || result

        unless variants.is_a?(Array)
          # parse_json_response already logs the raw text on error; here we
          # raise so the retry catches it. Truncate the diagnostic chunk to
          # 200 chars so the exception message stays readable in logs.
          raise "Expected array of variants from AI (chunk size #{count}); got: #{text[0, 200]}"
        end

        variants.map do |v|
          v = v.is_a?(Hash) ? v : {}
          {
            title:  v[:title].to_s,
            body:   v[:body].to_s,
            rating: (v[:rating] || 5).to_i.clamp(1, 5),
          }
        end.reject { |v| v[:body].blank? }
      rescue => e
        if attempts <= MAX_RETRIES
          Rails.logger.warn("[GenerateService] retry ##{attempts}: #{e.message}")
          retry
        end
        Rails.logger.error("[GenerateService] giving up after #{attempts} attempts: #{e.message}")
        []
      end
    end

    public

    # Generate plausible Q&A pairs for a product (questions a buyer might ask,
    # paired with helpful answers a merchant would write). Persisted by the
    # bulk_create_questions endpoint as Question rows.
    #
    # `enriched` is an optional hash of additional product context fetched
    # from the merchant's commerce platform (WooCommerce description,
    # short_description, attributes, categories). With it Claude grounds
    # answers in real product details instead of guessing from the title.
    def generate_qa_pairs(product:, count: 5, language: "pt-BR", enriched: nil)
      enriched_block = build_enriched_context(enriched)

      system_prompt = <<~PROMPT
        You write authentic e-commerce product Q&A pairs in #{language}.
        Each question must sound like a real buyer's pre-purchase doubt.
        Each answer must be concise (1-3 sentences), helpful, accurate to the
        product context. NEVER invent specs that aren't in the product context.
        Vary topics: shipping, usage, application, results, compatibility,
        ingredients/composition, durability, side effects, expectations.

        Return ONLY a JSON object:
        { "pairs": [ { "question": "...", "answer": "..." }, ... ] }
        No markdown, no explanation.#{workspace_voice_context}

        Product context:
        - Name: #{product.title}
        #{"- Handle: #{product.handle}" if product.handle.present?}#{enriched_block}
      PROMPT

      user_content = "Generate #{count} unique Q&A pairs in #{language}."

      text = call_claude(
        model: SONNET,
        system: system_prompt,
        max_tokens: 2048,
        messages: [{ role: "user", content: user_content }]
      )

      result = parse_json_response(text)
      pairs  = result[:pairs] || result

      raise "Expected array of pairs, got: #{text[0, 200]}" unless pairs.is_a?(Array)

      pairs.first(count).map do |p|
        {
          question: p[:question].to_s,
          answer:   p[:answer].to_s
        }
      end
    end

    private

    # Compose a tight block of product details for the Claude prompt. We strip
    # HTML, collapse whitespace, and cap each field to keep token usage sane.
    def build_enriched_context(enriched)
      return "" unless enriched.is_a?(Hash) && enriched.any?

      strip = ->(s, max) {
        return nil if s.nil?
        clean = s.to_s.gsub(/<[^>]+>/, " ").gsub(/\s+/, " ").strip
        clean.length > max ? "#{clean[0, max]}…" : clean
      }

      parts = []
      parts << "- Description: #{strip.call(enriched[:description], 800)}" if enriched[:description].present?
      parts << "- Short description: #{strip.call(enriched[:short_description], 300)}" if enriched[:short_description].present?
      parts << "- Categories: #{Array(enriched[:categories]).join(', ')}" if enriched[:categories].present?
      parts << "- Tags: #{Array(enriched[:tags]).join(', ')}" if enriched[:tags].present?
      parts << "- Attributes: #{Array(enriched[:attributes]).join('; ')}" if enriched[:attributes].present?
      parts << "- Price: #{enriched[:price]}" if enriched[:price].present?
      return "" if parts.empty?
      "\n        Real product details from the merchant's store:\n        #{parts.join("\n        ")}"
    end

    def build_system_prompt(product)
      prompt = <<~PROMPT
        You are a creative writing assistant generating diverse, authentic e-commerce review variants.
        Each variant must be unique in tone, structure, and focus — never copy-paste.
        Reviews must sound like different real customers wrote them.
        Return ONLY a JSON object: { "variants": [ { "title": "...", "body": "...", "rating": 4 }, ... ] }
        No markdown, no explanation, just the JSON.#{workspace_voice_context}
      PROMPT

      if product && ::Integrations::Univercampus::School.school?(product)
        # Escola do UniverCampus: a review é sobre a escola como um todo, não
        # sobre um curso específico.
        prompt += "\n\nThe reviews are about an online school as a whole (teaching, support, community, " \
                  "overall experience) — not about one specific course or product."
        prompt += "\n\nSchool context:\n- Name: #{product.title}"
        about = product_about(product)
        prompt += "\n- About: #{about}" if about.present?
      elsif product
        prompt += "\n\nProduct context:\n- Name: #{product.title}"
        prompt += "\n- Handle: #{product.handle}" if product.handle.present?
        about = product_about(product)
        prompt += "\n- About: #{about}" if about.present?
      end

      prompt
    end

    # Contexto além do título: o resumo IA do curso (UniverCampus,
    # `metadata.ai_brief`) quando existe; senão a descrição sem HTML, cortada.
    # Produto sem nenhum dos dois → prompt igual ao de antes.
    def product_about(product)
      metadata = product.metadata.is_a?(Hash) ? product.metadata : {}
      brief = metadata["ai_brief"].to_s.strip
      return brief if brief.present?

      text = product.description.to_s.gsub(/<[^>]+>/, " ").gsub(/\s+/, " ").strip
      text.presence&.truncate(ABOUT_MAX_CHARS, separator: " ", omission: "…")
    end

    def build_user_prompt(template, count)
      <<~PROMPT
        Generate #{count} unique review variants inspired by this template:
        ---
        #{template}
        ---
        Each must have a different perspective, length, and focus area.
        Vary between 1-5 star ratings proportionally (mostly positive).
      PROMPT
    end
  end
end
