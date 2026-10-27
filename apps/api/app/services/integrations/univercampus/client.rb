module Integrations
  module Univercampus
    # Cliente HTTP da API `/api/univerreview` do UniverCampus (contrato fixo
    # na seção 3.4 do design 2026-10-27). Autentica com
    # `Authorization: Bearer ucrev_…`.
    #
    # Erros (todos herdam de Error):
    #   AuthError       — 401/403: token inválido/revogado ou dono sem escola. Não adianta repetir.
    #   NotFound        — 404: curso inexistente ou de escola que o dono não controla mais.
    #   RateLimited     — 429; `retry_after` em segundos quando o servidor manda.
    #   InvalidUrlError — base_url malformada ou apontando para rede privada (SSRF).
    #   Error           — 5xx/timeout depois dos retries, ou outra resposta inesperada.
    class Client
      class Error < StandardError; end
      class AuthError < Error; end
      class NotFound < Error; end
      class InvalidUrlError < Error; end

      class RateLimited < Error
        attr_reader :retry_after

        def initialize(message = "limite de requisições do UniverCampus excedido", retry_after: nil)
          super(message)
          @retry_after = retry_after
        end
      end

      API_PREFIX     = "/api/univerreview".freeze
      MAX_BATCH      = 100
      TIMEOUT        = 30
      OPEN_TIMEOUT   = 10
      RETRY_STATUSES = [500, 502, 503, 504].freeze

      attr_reader :base_url

      # Hosts privados (localhost, RFC1918) só são aceitos em development/test,
      # para o E2E local contra o UniverCampus em http://localhost:3000.
      def self.allow_private_hosts?
        Rails.env.development? || Rails.env.test?
      end

      def initialize(base_url:, token:, retry_interval: 0.5)
        normalized = UnivercampusConnection.normalize_base_url(base_url)
        @base_url = ::Integrations::UrlGuard.validate!(
          normalized,
          error_class:   InvalidUrlError,
          field:         "base_url",
          allow_private: self.class.allow_private_hosts?
        )
        @token          = token.to_s
        @retry_interval = retry_interval
      rescue URI::InvalidURIError => e
        raise InvalidUrlError, "base_url inválida: #{e.message}"
      end

      # GET /escolas → { "usuario" => {id, nome, email}, "escolas" => [{id, slug, nome, url}] }
      def schools
        request(:get, "escolas")
      end

      # GET /cursos → [{id, escola: {id, slug, nome}, titulo, slug, descricao, capaUrl,
      #                 precoCentavos, status, url, atualizadoEm}]
      def courses(since: nil, school: nil)
        params = {}
        params[:atualizadoDesde] = since.utc.iso8601 if since
        params[:escola]          = school if school.present?
        Array(request(:get, "cursos", params: params)["cursos"])
      end

      # GET /cursos/:id/conteudo → { "id", "digest", "texto", "caracteres", "cortado" }
      def course_content(course_id)
        request(:get, "cursos/#{escape(course_id)}/conteudo")
      end

      # PUT /avaliacoes (1–100 itens) → { "salvas" => n, "erros" => [{ "idExterno", "erro" }] }
      def upsert_reviews(reviews)
        list = Array(reviews)
        if list.empty? || list.size > MAX_BATCH
          raise ArgumentError, "upsert_reviews aceita de 1 a #{MAX_BATCH} avaliações (recebeu #{list.size})"
        end
        request(:put, "avaliacoes", body: { avaliacoes: list })
      end

      # DELETE /avaliacoes/:idExterno → 204. Idempotente: 404 também conta como removida.
      def delete_review(external_id)
        request(:delete, "avaliacoes/#{escape(external_id)}")
        true
      rescue NotFound
        true
      end

      private

      def escape(value)
        ERB::Util.url_encode(value.to_s)
      end

      def request(method, path, params: nil, body: nil)
        response = connection.run_request(method, "#{API_PREFIX}/#{path}", body, nil) do |req|
          req.params.update(params) if params.present?
        end
        handle(response)
      rescue Faraday::TimeoutError, Faraday::ConnectionFailed => e
        raise Error, "UniverCampus indisponível: #{e.message}"
      end

      def handle(response)
        body    = response.body
        message = body.is_a?(Hash) ? body["erro"].presence : nil

        case response.status
        when 200..299
          body.is_a?(Hash) ? body : {}
        when 401, 403
          raise AuthError, message || "UniverCampus recusou o token (HTTP #{response.status})"
        when 404
          raise NotFound, message || "não encontrado no UniverCampus"
        when 429
          retry_after = response.headers["Retry-After"].presence&.to_i
          raise RateLimited.new(message || "limite de requisições do UniverCampus excedido", retry_after: retry_after)
        else
          raise Error, ["UniverCampus respondeu HTTP #{response.status}", message].compact.join(": ")
        end
      end

      def connection
        @connection ||= Faraday.new(url: @base_url) do |f|
          f.request :json
          f.request :retry, max: 2, interval: @retry_interval, backoff_factor: 2,
                            methods: %i[get put delete],
                            retry_statuses: RETRY_STATUSES,
                            exceptions: [Faraday::TimeoutError, Faraday::ConnectionFailed, Faraday::RetriableResponse]
          f.response :json
          f.options.timeout      = TIMEOUT
          f.options.open_timeout = OPEN_TIMEOUT
          f.headers["Authorization"] = "Bearer #{@token}"
          f.headers["Accept"]        = "application/json"
          f.headers["User-Agent"]    = "UniverReviews/1.0"
        end
      end
    end
  end
end
