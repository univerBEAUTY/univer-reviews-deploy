require "rails_helper"

RSpec.describe Integrations::Univercampus::ReviewPublisher, type: :service do
  let!(:workspace)  { create(:workspace) }
  let!(:connection) { create(:univercampus_connection, workspace: workspace, base_url: "https://campus.example.com") }
  let(:client) do
    Integrations::Univercampus::Client.new(base_url: connection.base_url, token: connection.api_token, retry_interval: 0)
  end
  let!(:course) { create(:product, :univercampus, workspace: workspace, platform_product_id: "cur_1") }
  let(:url)     { "https://campus.example.com/api/univerreview/avaliacoes" }
  let(:json)    { { "Content-Type" => "application/json" } }

  subject(:publisher) { described_class.new(connection: connection, client: client) }

  def stub_put(erros: [])
    stub_request(:put, url).to_return do |req|
      n = JSON.parse(req.body)["avaliacoes"].size
      { status: 200, headers: json, body: { salvas: n - erros.size, erros: erros }.to_json }
    end
  end

  def stub_delete(id)
    stub_request(:delete, "#{url}/#{id}").to_return(status: 204, body: "")
  end

  def sent_items
    items = []
    expect(a_request(:put, url).with { |req| items.concat(JSON.parse(req.body)["avaliacoes"]) }).to have_been_made.at_least_once
    items
  end

  it "envia aprovadas no formato do contrato" do
    review = create(:review, :approved, workspace: workspace, product: course, rating: 5, title: "Amei",
                                        body: "Curso excelente", author_name: "Ana", is_featured: true,
                                        author_avatar_url: "https://cdn.example.com/ana.jpg")
    stub_put

    result = publisher.call(review_ids: [review.id])

    expect(result).to include(ok: true, upserted: 1, deleted: 0)
    expect(sent_items).to eq([{
      "idExterno" => review.id, "cursoId" => "cur_1", "nota" => 5, "titulo" => "Amei",
      "texto" => "Curso excelente", "autorNome" => "Ana", "autorFotoUrl" => "https://cdn.example.com/ana.jpg",
      "sintetica" => false, "destaque" => true, "publicadaEm" => review.reload.approved_at.iso8601
    }])
    expect(connection.reload.last_pushed_at).to be_present
    expect(connection.last_error).to be_nil
  end

  it "marca sintética por ai_is_synthetic OU metadata.ai_generated; foto não-https e autor vazio são tratados" do
    a = create(:review, :approved, workspace: workspace, product: course, ai_is_synthetic: true)
    b = create(:review, :approved, workspace: workspace, product: course, metadata: { "ai_generated" => true })
    c = create(:review, :approved, workspace: workspace, product: course, author_name: nil,
                                   author_avatar_url: "http://inseguro.example.com/x.jpg")
    stub_put

    publisher.call(review_ids: [a.id, b.id, c.id])

    by_id = sent_items.index_by { |item| item["idExterno"] }
    expect(by_id[a.id]["sintetica"]).to be(true)
    expect(by_id[b.id]["sintetica"]).to be(true)
    expect(by_id[c.id]).to include("sintetica" => false, "autorNome" => "Aluno", "autorFotoUrl" => nil)
  end

  it "não aprovadas, sem texto, de curso inativo ou apagadas viram DELETE" do
    pending_review = create(:review, workspace: workspace, product: course)
    empty          = create(:review, :approved, workspace: workspace, product: course, body: "  ")
    inactive       = create(:product, :univercampus, workspace: workspace, active: false)
    on_inactive    = create(:review, :approved, workspace: workspace, product: inactive)
    gone_id        = SecureRandom.uuid
    [pending_review.id, empty.id, on_inactive.id, gone_id].each { |id| stub_delete(id) }

    result = publisher.call(review_ids: [pending_review.id, empty.id, on_inactive.id], deleted_ids: [gone_id])

    expect(result).to include(ok: true, upserted: 0, deleted: 4)
    expect(a_request(:put, url)).not_to have_been_made
  end

  it "divide em lotes de 100" do
    reviews = create_list(:review, 101, :approved, workspace: workspace, product: course)
    stub_put

    result = publisher.call(review_ids: reviews.map(&:id))

    expect(result[:upserted]).to eq(101)
    expect(a_request(:put, url)).to have_been_made.twice
  end

  it "erros por item vão para last_error e o resto segue" do
    ok  = create(:review, :approved, workspace: workspace, product: course)
    bad = create(:review, :approved, workspace: workspace, product: course)
    stub_put(erros: [{ idExterno: bad.id, erro: "texto muito longo" }])

    result = publisher.call(review_ids: [ok.id, bad.id])

    expect(result).to include(ok: false, upserted: 1)
    expect(connection.reload.last_error).to include("texto muito longo")
  end

  it "404 do curso desativa o produto e descarta o push daquele curso" do
    review = create(:review, :approved, workspace: workspace, product: course)
    stub_request(:put, url).to_return(status: 404, headers: json, body: { erro: "curso não encontrado" }.to_json)

    result = publisher.call(review_ids: [review.id])

    expect(result[:ok]).to be(false)
    expect(course.reload.active).to be(false)
    expect(connection.reload.last_error).to include("cur_1")
  end

  it "401 marca a conexão como inválida" do
    review = create(:review, :approved, workspace: workspace, product: course)
    stub_request(:put, url).to_return(status: 401, headers: json, body: { erro: "Token revogado" }.to_json)

    expect(publisher.call(review_ids: [review.id])).to include(ok: false, stage: "auth")
    expect(connection.reload.status).to eq("invalid")
  end

  it "5xx grava last_error e relança" do
    review = create(:review, :approved, workspace: workspace, product: course)
    stub_request(:put, url).to_return(status: 503, body: "")

    expect { publisher.call(review_ids: [review.id]) }.to raise_error(Integrations::Univercampus::Client::Error)
    expect(connection.reload.last_error).to include("HTTP 503")
  end

  it "publish_all envia só as aprovadas dos cursos ativos" do
    approved = create(:review, :approved, workspace: workspace, product: course)
    create(:review, workspace: workspace, product: course)                                   # pendente
    create(:review, :approved, workspace: workspace, product: create(:product, workspace: workspace)) # woocommerce
    stub_put

    expect(publisher.publish_all).to include(upserted: 1, deleted: 0)
    expect(sent_items.map { |item| item["idExterno"] }).to eq([approved.id])
  end

  it "review de escola vai com escolaId e sem cursoId" do
    school = create(:product, :univercampus, workspace: workspace, platform_product_id: "escola:esc_1", title: "Escola Um")
    review = create(:review, :approved, workspace: workspace, product: school, body: "Atendimento impecável")
    stub_put

    expect(publisher.call(review_ids: [review.id])).to include(ok: true, upserted: 1)
    item = sent_items.first
    expect(item).to include("idExterno" => review.id, "escolaId" => "esc_1", "texto" => "Atendimento impecável")
    expect(item).not_to have_key("cursoId")
  end
end
