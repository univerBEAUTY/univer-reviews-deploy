require "rails_helper"

RSpec.describe Ai::CourseBriefService, type: :service do
  let!(:workspace) { create(:workspace) }
  let(:client)     { instance_double(Integrations::Univercampus::Client) }
  let!(:product) do
    create(:product, :univercampus, workspace: workspace, platform_product_id: "cur_1",
           title: "Mechas Perfeitas", image_url: "https://cdn.example.com/capa.jpg",
           metadata: { "univercampus" => { "escola" => { "nome" => "Escola Um" } } })
  end
  let(:conteudo) do
    { "id" => "cur_1", "digest" => "digest-novo", "texto" => "Módulo 1: Diagnóstico do fio", "caracteres" => 28, "cortado" => false }
  end

  subject(:service) { described_class.new(workspace, client: client) }

  before do
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:[]).with("ANTHROPIC_API_KEY").and_return("test")
    allow(client).to receive(:course_content).with("cur_1").and_return(conteudo)
  end

  def stub_claude(text: "Curso para cabeleireiras que querem dominar mechas.")
    stub_request(:post, Ai::BaseService::API_URL).to_return(
      status: 200, headers: { "Content-Type" => "application/json" },
      body: { content: [{ type: "text", text: text }], usage: { input_tokens: 900, output_tokens: 120 } }.to_json
    )
  end

  def claude_request_blocks
    blocks = nil
    expect(a_request(:post, Ai::BaseService::API_URL).with { |req|
      body = JSON.parse(req.body)
      blocks = body.dig("messages", 0, "content")
      body["model"] == Ai::BaseService::HAIKU
    }).to have_been_made.once
    blocks
  end

  it "gera o resumo com Haiku mandando capa + texto e grava ai_brief + digest" do
    stub_claude

    expect(service.call(product)).to eq(:updated)

    blocks = claude_request_blocks
    expect(blocks).to include("type" => "image", "source" => { "type" => "url", "url" => "https://cdn.example.com/capa.jpg" })
    text = blocks.find { |b| b["type"] == "text" }["text"]
    expect(text).to include("Mechas Perfeitas", "Escola Um", "Módulo 1: Diagnóstico do fio")

    product.reload
    expect(product.metadata["ai_brief"]).to eq("Curso para cabeleireiras que querem dominar mechas.")
    expect(product.metadata["ai_brief_digest"]).to eq("digest-novo")
    expect(product.metadata.dig("univercampus", "digest")).to eq("digest-novo")
    expect(product.metadata.dig("univercampus", "escola", "nome")).to eq("Escola Um")
  end

  it "registra o custo como AiJob course_brief" do
    stub_claude
    expect { service.call(product) }.to change { AiJob.where(workspace: workspace, job_type: "course_brief").count }.by(1)
    job = AiJob.where(workspace: workspace).last
    expect(job.model).to eq(Ai::BaseService::HAIKU)
    expect(job.cost_usd).to be > 0
  end

  it "não chama a IA quando o digest não mudou" do
    product.update!(metadata: product.metadata.merge("ai_brief" => "x", "ai_brief_digest" => "digest-novo"))
    expect(service.call(product)).to eq(:unchanged)
    expect(a_request(:post, Ai::BaseService::API_URL)).not_to have_been_made
  end

  it "corta o resumo em 600 caracteres" do
    stub_claude(text: "palavra " * 200)
    service.call(product)
    expect(product.reload.metadata["ai_brief"].length).to be <= 600
  end

  it "sem capa https manda só o texto" do
    product.update!(image_url: "http://inseguro.example.com/capa.jpg")
    stub_claude
    service.call(product)
    expect(claude_request_blocks.map { |b| b["type"] }).to eq(["text"])
  end

  it "respeita o AiCostCap" do
    allow(AiCostCap).to receive(:exceeded?).and_return(true)
    expect(service.call(product)).to eq(:skipped_cap)
    expect(a_request(:post, Ai::BaseService::API_URL)).not_to have_been_made
  end

  it "falha da IA não levanta e mantém o resumo anterior" do
    product.update!(metadata: product.metadata.merge("ai_brief" => "antigo", "ai_brief_digest" => "velho"))
    stub_request(:post, Ai::BaseService::API_URL).to_return(status: 500, body: "{}")
    expect(service.call(product)).to eq(:failed)
    expect(product.reload.metadata["ai_brief"]).to eq("antigo")
  end

  it "404 do conteúdo desativa o produto" do
    allow(client).to receive(:course_content).and_raise(Integrations::Univercampus::Client::NotFound, "sumiu")
    expect(service.call(product)).to eq(:not_found)
    expect(product.reload.active).to be(false)
  end
end
