require "rails_helper"

RSpec.describe Integrations::Univercampus::CourseSyncer, type: :service do
  let!(:workspace)  { create(:workspace) }
  let!(:connection) { create(:univercampus_connection, workspace: workspace, base_url: "https://campus.example.com") }
  let(:client) do
    Integrations::Univercampus::Client.new(base_url: connection.base_url, token: connection.api_token, retry_interval: 0)
  end
  let(:cursos_url)  { "https://campus.example.com/api/univerreview/cursos" }
  let(:escolas_url) { "https://campus.example.com/api/univerreview/escolas" }
  let(:json)        { { "Content-Type" => "application/json" } }

  before { stub_escolas([]) }

  def escola(id, nome:, descricao: nil, logo: nil)
    slug = nome.parameterize
    { id: id, slug: slug, nome: nome, url: "https://campus.example.com/s/#{slug}", descricao: descricao, logoUrl: logo }
  end

  def stub_escolas(escolas)
    stub_request(:get, escolas_url).to_return(
      status: 200, headers: json,
      body: { usuario: { id: "u1", nome: "Dona", email: "dona@example.com" }, escolas: escolas }.to_json
    )
  end

  def curso(id, titulo:, preco: 19_700)
    slug = titulo.parameterize
    {
      id: id, escola: { id: "esc_1", slug: "escola-um", nome: "Escola Um" },
      titulo: titulo, slug: slug, descricao: "Descrição de #{titulo}",
      capaUrl: "https://cdn.example.com/#{id}.jpg", precoCentavos: preco, status: "published",
      url: "https://campus.example.com/s/escola-um/curso/#{slug}", atualizadoEm: "2026-10-20T12:00:00Z"
    }
  end

  def stub_cursos(cursos)
    stub_request(:get, cursos_url).to_return(status: 200, headers: json, body: { cursos: cursos }.to_json)
  end

  def run
    described_class.run(connection: connection, client: client)
  end

  it "cria um produto univercampus por curso com título, descrição, capa, preço e metadata" do
    stub_cursos([curso("cur_1", titulo: "Mechas Perfeitas")])

    result = run

    expect(result).to include(ok: true, synced: 1, failed: 0, total_fetched: 1)
    product = workspace.products.find_by!(platform: "univercampus", platform_product_id: "cur_1")
    expect(product.title).to eq("Mechas Perfeitas")
    expect(product.handle).to eq("mechas-perfeitas")
    expect(product.description).to eq("Descrição de Mechas Perfeitas")
    expect(product.image_url).to eq("https://cdn.example.com/cur_1.jpg")
    expect(product.price).to eq(BigDecimal("197.00"))
    expect(product.currency).to eq("BRL")
    expect(product.active).to be(true)
    expect(product.metadata.dig("univercampus", "escola", "slug")).to eq("escola-um")
    expect(product.metadata.dig("univercampus", "url")).to end_with("/curso/mechas-perfeitas")
    expect(connection.reload.last_synced_at).to be_present
  end

  it "é idempotente e preserva ai_brief/digest já gravados no metadata" do
    product = create(:product, :univercampus, workspace: workspace, platform_product_id: "cur_1", title: "Antigo",
                     metadata: { "ai_brief" => "Resumo", "ai_brief_digest" => "d1", "univercampus" => { "digest" => "d1" } })
    stub_cursos([curso("cur_1", titulo: "Novo título")])

    expect { run }.not_to change { workspace.products.count }

    product.reload
    expect(product.title).to eq("Novo título")
    expect(product.metadata["ai_brief"]).to eq("Resumo")
    expect(product.metadata.dig("univercampus", "digest")).to eq("d1")
  end

  it "desativa cursos que sumiram da API sem tocar em produtos de outra plataforma" do
    gone = create(:product, :univercampus, workspace: workspace, platform_product_id: "cur_gone")
    woo  = create(:product, workspace: workspace, platform: "woocommerce", platform_product_id: "1")
    stub_cursos([curso("cur_1", titulo: "Fica")])

    expect(run[:deactivated]).to eq(1)
    expect(gone.reload.active).to be(false)
    expect(woo.reload.active).to be(true)
  end

  it "reativa um curso que voltou" do
    back = create(:product, :univercampus, workspace: workspace, platform_product_id: "cur_1", active: false)
    stub_cursos([curso("cur_1", titulo: "Voltou")])
    run
    expect(back.reload.active).to be(true)
  end

  it "um curso inválido não derruba os outros" do
    stub_cursos([curso("cur_ok", titulo: "Ok"), curso("cur_bad", titulo: "x").merge(titulo: nil)])
    result = run
    expect(result).to include(ok: false, synced: 1, failed: 1)
    expect(workspace.products.find_by(platform_product_id: "cur_ok")).to be_present
    expect(connection.reload.last_error).to include("1 item(ns) com erro")
  end

  it "401 marca a conexão como inválida e devolve stage auth" do
    stub_request(:get, cursos_url).to_return(status: 401, headers: json, body: { erro: "token revogado" }.to_json)

    expect(run).to include(ok: false, stage: "auth")
    expect(connection.reload.status).to eq("invalid")
    expect(connection.last_error).to include("token revogado")
  end

  it "5xx grava last_error e relança para o Sidekiq tentar de novo" do
    stub_request(:get, cursos_url).to_return(status: 503, body: "")

    expect { run }.to raise_error(Integrations::Univercampus::Client::Error, /HTTP 503/)
    expect(connection.reload.last_error).to include("HTTP 503")
  end

  context "escolas" do
    it "cria um produto avaliável por escola, com descrição, logo e tipo escola" do
      stub_escolas([escola("esc_1", nome: "Escola Um", descricao: "Formação em mechas", logo: "https://cdn.example.com/logo.png")])
      stub_cursos([curso("cur_1", titulo: "Mechas Perfeitas")])

      result = run

      expect(result).to include(ok: true, schools: 1, synced: 1)
      school = workspace.products.find_by!(platform: "univercampus", platform_product_id: "escola:esc_1")
      expect(school.title).to eq("Escola Um")
      expect(school.description).to eq("Formação em mechas")
      expect(school.image_url).to eq("https://cdn.example.com/logo.png")
      expect(school.price).to be_nil
      expect(school.metadata.dig("univercampus", "tipo")).to eq("escola")
      expect(school.metadata.dig("univercampus", "escola", "id")).to eq("esc_1")
      expect(Integrations::Univercampus::School.school?(school)).to be(true)

      course = workspace.products.find_by!(platform_product_id: "cur_1")
      expect(course.metadata.dig("univercampus", "tipo")).to eq("curso")
      expect(Integrations::Univercampus::School.school?(course)).to be(false)
      expect(connection.reload.schools.map { |s| s["id"] }).to eq(["esc_1"])
    end

    it "desativa a escola que o dono perdeu, sem desativar os cursos que voltaram" do
      create(:product, :univercampus, workspace: workspace, platform_product_id: "escola:esc_old", title: "Velha")
      stub_escolas([escola("esc_1", nome: "Escola Um")])
      stub_cursos([curso("cur_1", titulo: "Mechas")])

      expect(run).to include(deactivated: 1)
      expect(workspace.products.find_by!(platform_product_id: "escola:esc_old").active).to be(false)
      expect(workspace.products.find_by!(platform_product_id: "escola:esc_1").active).to be(true)
    end
  end
end
