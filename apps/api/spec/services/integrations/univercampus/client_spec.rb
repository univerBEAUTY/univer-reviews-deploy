require "rails_helper"

RSpec.describe Integrations::Univercampus::Client, type: :service do
  let(:base_url) { "https://campus.example.com" }
  let(:token)    { "ucrev_#{'c' * 43}" }
  let(:api)      { "#{base_url}/api/univerreview" }
  let(:json)     { { "Content-Type" => "application/json" } }

  subject(:client) { described_class.new(base_url: base_url, token: token, retry_interval: 0) }

  describe "#schools" do
    it "manda Bearer + Accept e devolve usuário e escolas" do
      stub_request(:get, "#{api}/escolas")
        .with(headers: { "Authorization" => "Bearer #{token}", "Accept" => "application/json" })
        .to_return(status: 200, headers: json, body: {
          usuario: { id: "usr_1", nome: "Dona", email: "dona@example.com" },
          escolas: [{ id: "esc_1", slug: "escola-um", nome: "Escola Um", url: "https://campus.example.com/s/escola-um" }]
        }.to_json)

      result = client.schools
      expect(result.dig("usuario", "nome")).to eq("Dona")
      expect(result["escolas"].first["slug"]).to eq("escola-um")
    end

    it "aceita base_url colada com /api/univerreview/" do
      stub_request(:get, "#{api}/escolas").to_return(status: 200, headers: json, body: { usuario: {}, escolas: [] }.to_json)
      described_class.new(base_url: "#{api}/", token: token).schools
      expect(a_request(:get, "#{api}/escolas")).to have_been_made
    end
  end

  describe "#courses" do
    it "passa escola e atualizadoDesde e devolve a lista" do
      stub_request(:get, "#{api}/cursos")
        .with(query: { "escola" => "escola-um", "atualizadoDesde" => "2026-10-01T00:00:00Z" })
        .to_return(status: 200, headers: json, body: { cursos: [{ id: "cur_1", titulo: "Mechas" }] }.to_json)

      cursos = client.courses(school: "escola-um", since: Time.utc(2026, 10, 1))
      expect(cursos.map { |c| c["id"] }).to eq(["cur_1"])
    end
  end

  describe "#course_content" do
    it "escapa o id e devolve digest + texto" do
      stub_request(:get, "#{api}/cursos/cur%201/conteudo")
        .to_return(status: 200, headers: json, body: { id: "cur 1", digest: "abc", texto: "Aula 1", caracteres: 6, cortado: false }.to_json)
      expect(client.course_content("cur 1")).to include("digest" => "abc", "texto" => "Aula 1")
    end

    it "404 vira NotFound" do
      stub_request(:get, "#{api}/cursos/cur_x/conteudo").to_return(status: 404, headers: json, body: { erro: "não encontrado" }.to_json)
      expect { client.course_content("cur_x") }.to raise_error(described_class::NotFound, /não encontrado/)
    end
  end

  describe "#upsert_reviews" do
    let(:item) { { idExterno: "r1", cursoId: "cur_1", nota: 5, texto: "Ótimo", autorNome: "Ana" } }

    it "faz PUT com { avaliacoes: [...] } e devolve salvas/erros" do
      stub_request(:put, "#{api}/avaliacoes")
        .with { |req| JSON.parse(req.body) == { "avaliacoes" => [item.transform_keys(&:to_s)] } }
        .to_return(status: 200, headers: json, body: { salvas: 1, erros: [] }.to_json)
      expect(client.upsert_reviews([item])).to eq("salvas" => 1, "erros" => [])
    end

    it "recusa lote vazio ou com mais de 100" do
      expect { client.upsert_reviews([]) }.to raise_error(ArgumentError)
      expect { client.upsert_reviews(Array.new(101) { item }) }.to raise_error(ArgumentError)
    end
  end

  describe "#delete_review" do
    it "204 devolve true" do
      stub_request(:delete, "#{api}/avaliacoes/r1").to_return(status: 204, body: "")
      expect(client.delete_review("r1")).to be(true)
    end

    it "é idempotente: 404 também conta como removida" do
      stub_request(:delete, "#{api}/avaliacoes/r1").to_return(status: 404, body: "")
      expect(client.delete_review("r1")).to be(true)
    end
  end

  describe "erros" do
    it "401 e 403 viram AuthError com a mensagem do UniverCampus" do
      stub_request(:get, "#{api}/escolas").to_return(status: 401, headers: json, body: { erro: "Token revogado" }.to_json)
      expect { client.schools }.to raise_error(described_class::AuthError, "Token revogado")

      stub_request(:get, "#{api}/escolas").to_return(status: 403, headers: json, body: { erro: "Sem escolas" }.to_json)
      expect { client.schools }.to raise_error(described_class::AuthError, "Sem escolas")
    end

    it "429 vira RateLimited com retry_after" do
      stub_request(:get, "#{api}/escolas").to_return(status: 429, headers: json.merge("Retry-After" => "30"), body: { erro: "calma" }.to_json)
      expect { client.schools }.to raise_error(described_class::RateLimited) { |e| expect(e.retry_after).to eq(30) }
    end

    it "tenta de novo em 503 e segue quando o servidor volta" do
      stub_request(:get, "#{api}/escolas")
        .to_return({ status: 503, body: "" }, { status: 200, headers: json, body: { usuario: {}, escolas: [] }.to_json })
      expect(client.schools).to eq("usuario" => {}, "escolas" => [])
    end

    it "5xx persistente vira Error depois dos retries" do
      stub_request(:get, "#{api}/escolas").to_return(status: 500, body: "")
      expect { client.schools }.to raise_error(described_class::Error, /HTTP 500/)
      expect(a_request(:get, "#{api}/escolas")).to have_been_made.times(3)
    end

    it "timeout vira Error" do
      stub_request(:get, "#{api}/escolas").to_timeout
      expect { client.schools }.to raise_error(described_class::Error, /indisponível/)
    end
  end

  describe "SSRF" do
    before { allow(described_class).to receive(:allow_private_hosts?).and_return(false) }

    it "bloqueia loopback e metadados da nuvem fora de dev/test" do
      expect { described_class.new(base_url: "http://127.0.0.1:3000", token: token) }
        .to raise_error(described_class::InvalidUrlError, %r{private/loopback})
      expect { described_class.new(base_url: "http://169.254.169.254", token: token) }
        .to raise_error(described_class::InvalidUrlError)
    end

    it "URL malformada vira InvalidUrlError" do
      expect { described_class.new(base_url: "not a url", token: token) }.to raise_error(described_class::InvalidUrlError)
    end
  end

  describe ".allow_private_hosts?" do
    it "libera localhost em dev/test (UniverCampus local em :3000)" do
      expect(described_class.allow_private_hosts?).to be(true)
      stub_request(:get, "http://localhost:3000/api/univerreview/escolas")
        .to_return(status: 200, headers: json, body: { usuario: {}, escolas: [] }.to_json)
      expect(described_class.new(base_url: "http://localhost:3000", token: token).schools).to include("escolas" => [])
    end

    it "é false em produção" do
      allow(Rails).to receive(:env).and_return(ActiveSupport::EnvironmentInquirer.new("production"))
      expect(described_class.allow_private_hosts?).to be(false)
    end
  end
end
