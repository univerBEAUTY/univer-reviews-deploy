require "rails_helper"

# O layout `showcase` do widget lê do resumo quantas avaliações são
# verificadas, quantas têm mídia e a % que recomenda, e de cada avaliação se
# ela foi escrita por IA (para mostrar o rótulo de exemplo).
RSpec.describe "Public widget data for the showcase layout", type: :request do
  let!(:workspace) { create(:workspace) }
  let(:host)       { "loja-#{SecureRandom.hex(4)}.example.com" }
  let!(:domain)    { create(:workspace_domain, workspace: workspace, domain: host) }
  let!(:product)   { create(:product, workspace: workspace, title: "Kit Ampolas") }
  let(:headers)    { { "X-Univer-Domain" => host } }

  before do
    allow_any_instance_of(ApplicationController).to receive(:set_rls_workspace)
  end

  def review!(**attrs)
    create(:review, :approved, { workspace: workspace, product: product, ai_is_synthetic: false }.merge(attrs))
  end

  describe "GET /api/v1/public/summary/:product_id" do
    it "conta verificadas, com mídia e a % que recomenda (nota 4 ou 5)" do
      with_photo = review!(rating: 5, is_verified_purchase: true)
      ReviewMedium.create!(review: with_photo, workspace: workspace, type: "image",
                           storage_key: "k/1.jpg", url: "https://cdn.example.com/1.jpg")
      review!(rating: 4, is_verified_purchase: true)
      review!(rating: 2, is_verified_purchase: false)
      create(:review, workspace: workspace, product: product, rating: 1) # pendente: fora da conta

      get "/api/v1/public/summary/#{product.id}", headers: headers

      expect(response).to have_http_status(:ok)
      data = JSON.parse(response.body)["data"]
      expect(data["total_reviews"]).to eq(3)
      expect(data["verified_count"]).to eq(2)
      expect(data["media_count"]).to eq(1)
      expect(data["recommend_percentage"]).to eq(66.7)
    end

    it "devolve 0% de recomendação sem avaliações" do
      get "/api/v1/public/summary/#{product.id}", headers: headers

      data = JSON.parse(response.body)["data"]
      expect(data["recommend_percentage"]).to eq(0.0)
      expect(data["verified_count"]).to eq(0)
      expect(data["media_count"]).to eq(0)
    end
  end

  describe "GET /api/v1/public/reviews/:product_id" do
    it "marca is_synthetic pelos dois marcadores de IA" do
      real      = review!(body: "Real, comprei e gostei bastante do kit.")
      flagged   = review!(ai_is_synthetic: true, body: "Gerada no painel com a IA do produto.")
      by_origin = review!(ai_is_synthetic: false, metadata: { "ai_generated" => true },
                          body: "Gerada, mas o moderador zerou a flag depois.")

      get "/api/v1/public/reviews/#{product.id}", headers: headers

      by_id = JSON.parse(response.body)["data"].index_by { |r| r["id"] }
      expect(by_id[real.id]["is_synthetic"]).to be(false)
      expect(by_id[flagged.id]["is_synthetic"]).to be(true)
      expect(by_id[by_origin.id]["is_synthetic"]).to be(true)
    end

    it "filtra só avaliações com foto ou vídeo via with_media" do
      with_video = review!
      ReviewMedium.create!(review: with_video, workspace: workspace, type: "video",
                           storage_key: "k/v.mp4", url: "https://cdn.example.com/v.mp4")
      review!

      get "/api/v1/public/reviews/#{product.id}", params: { with_media: "true" }, headers: headers

      ids = JSON.parse(response.body)["data"].map { |r| r["id"] }
      expect(ids).to eq([with_video.id])
    end
  end

  describe "Workspace widget layout" do
    it "aceita o layout showcase" do
      workspace.update!(widget_default_layout: "showcase")
      expect(workspace.reload.widget_config[:layout]).to eq("showcase")
    end
  end
end
