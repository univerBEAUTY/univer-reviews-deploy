require "rails_helper"

RSpec.describe "Integração UniverCampus", type: :request do
  let!(:workspace) { create(:workspace) }
  let!(:raw_key)   { "unvr_#{SecureRandom.hex(32)}" }
  let!(:api_key) do
    create(:workspace_api_key, workspace: workspace, key_hash: Digest::SHA256.hexdigest(raw_key),
                               key_prefix: raw_key[0, 8], scopes: "read,write")
  end
  let(:headers) do
    { "Authorization" => "Bearer #{raw_key}", "Content-Type" => "application/json", "Accept" => "application/json" }
  end
  let(:base_url) { "https://campus.example.com" }
  let(:uc_token) { "ucrev_#{'a' * 43}" }
  let(:json)     { { "Content-Type" => "application/json" } }
  let(:escolas_body) do
    {
      usuario: { id: "usr_1", nome: "Dona", email: "dona@example.com" },
      escolas: [{ id: "esc_1", slug: "escola-um", nome: "Escola Um", url: "https://campus.example.com/s/escola-um" }]
    }
  end

  before { allow_any_instance_of(ApplicationController).to receive(:set_rls_workspace) }

  def stub_escolas(status: 200, body: escolas_body)
    stub_request(:get, "#{base_url}/api/univerreview/escolas")
      .with(headers: { "Authorization" => "Bearer #{uc_token}" })
      .to_return(status: status, headers: json, body: body.to_json)
  end

  def body
    JSON.parse(response.body)
  end

  describe "GET /integrations/univercampus" do
    it "sem conexão devolve connected=false e a URL padrão" do
      get "/api/v1/integrations/univercampus", headers: headers
      expect(response).to have_http_status(:ok)
      expect(body).to eq("connected" => false, "base_url" => "https://univercampus.cloud")
    end

    it "não enxerga a conexão de outro workspace" do
      create(:univercampus_connection, workspace: create(:workspace))
      get "/api/v1/integrations/univercampus", headers: headers
      expect(body["connected"]).to be(false)
    end

    it "com conexão devolve status, escolas com contagem de cursos e nunca o token" do
      conn = create(:univercampus_connection, workspace: workspace, api_token: uc_token)
      create(:product, :univercampus, workspace: workspace,
             metadata: { "univercampus" => { "escola" => { "id" => "esc_1" } } })

      get "/api/v1/integrations/univercampus", headers: headers

      expect(body).to include("connected" => true, "status" => "active", "token_prefix" => conn.token_prefix, "course_count" => 1)
      expect(body["schools"].first).to include("slug" => "escola-um", "course_count" => 1)
      expect(response.body).not_to include(uc_token)
    end
  end

  describe "POST /integrations/univercampus" do
    it "salva o token cifrado, verifica, enfileira o sync e não devolve o token" do
      stub_escolas

      expect {
        post "/api/v1/integrations/univercampus", params: { base_url: base_url, api_token: uc_token }.to_json, headers: headers
      }.to have_enqueued_job(UnivercampusSyncJob).with(workspace.id)

      expect(response).to have_http_status(:created)
      expect(body).to include("connected" => true, "status" => "active", "token_prefix" => uc_token[0, 12])
      expect(body["probe"]).to eq("success" => true)
      expect(body["owner"]).to include("nome" => "Dona")
      expect(response.body).not_to include(uc_token)

      raw = ActiveRecord::Base.connection.select_value(
        ActiveRecord::Base.sanitize_sql(["SELECT api_token FROM univercampus_connections WHERE workspace_id = ?", workspace.id])
      )
      expect(raw).not_to include(uc_token)
      expect(workspace.reload.univercampus_connection.api_token).to eq(uc_token)
    end

    it "token recusado salva como inválido, guarda o erro e não sincroniza" do
      stub_escolas(status: 401, body: { erro: "Token revogado" })

      expect {
        post "/api/v1/integrations/univercampus", params: { base_url: base_url, api_token: uc_token }.to_json, headers: headers
      }.not_to have_enqueued_job(UnivercampusSyncJob)

      expect(body["status"]).to eq("invalid")
      expect(body["probe"]).to include("success" => false)
      expect(body["last_error"]).to include("Token revogado")
    end

    it "atualizar com token em branco mantém o token salvo" do
      create(:univercampus_connection, workspace: workspace, base_url: base_url, api_token: uc_token)
      stub_escolas

      post "/api/v1/integrations/univercampus", params: { base_url: base_url, api_token: "" }.to_json, headers: headers

      expect(response).to have_http_status(:ok)
      expect(workspace.reload.univercampus_connection.api_token).to eq(uc_token)
    end

    it "token em formato errado devolve 422" do
      post "/api/v1/integrations/univercampus", params: { base_url: base_url, api_token: "abc" }.to_json, headers: headers
      expect(response).to have_http_status(:unprocessable_entity)
    end

    it "sem as chaves de criptografia recusa salvar com mensagem clara" do
      allow(ActiveRecord::Encryption.config).to receive(:has_primary_key?).and_return(nil)

      post "/api/v1/integrations/univercampus", params: { base_url: base_url, api_token: uc_token }.to_json, headers: headers

      expect(response).to have_http_status(:unprocessable_entity)
      expect(body["issues"].join).to include("ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY")
      expect(UnivercampusConnection.where(workspace_id: workspace.id).count).to eq(0)
    end

    it "chave só de leitura não pode salvar" do
      ro_key = "unvr_#{SecureRandom.hex(32)}"
      create(:workspace_api_key, :read_only, workspace: workspace, key_hash: Digest::SHA256.hexdigest(ro_key), key_prefix: ro_key[0, 8])

      post "/api/v1/integrations/univercampus",
           params: { base_url: base_url, api_token: uc_token }.to_json,
           headers: headers.merge("Authorization" => "Bearer #{ro_key}")

      expect(response).to have_http_status(:forbidden)
      expect(UnivercampusConnection.where(workspace_id: workspace.id).count).to eq(0)
    end
  end

  describe "POST /integrations/univercampus/test" do
    it "lista as escolas sem salvar nada" do
      stub_escolas

      post "/api/v1/integrations/univercampus/test", params: { base_url: base_url, api_token: uc_token }.to_json, headers: headers

      expect(body["success"]).to be(true)
      expect(body["message"]).to include("Dona")
      expect(body["schools"].first["nome"]).to eq("Escola Um")
      expect(UnivercampusConnection.where(workspace_id: workspace.id).count).to eq(0)
    end

    it "sem token devolve 400" do
      post "/api/v1/integrations/univercampus/test", params: { base_url: base_url }.to_json, headers: headers
      expect(response).to have_http_status(:bad_request)
    end
  end

  describe "POST /integrations/univercampus/sync" do
    let!(:connection) { create(:univercampus_connection, workspace: workspace, base_url: base_url, api_token: uc_token) }

    it "inline roda o sync e devolve a contagem" do
      stub_request(:get, "#{base_url}/api/univerreview/cursos").to_return(status: 200, headers: json, body: {
        cursos: [{ id: "cur_1", escola: { id: "esc_1", slug: "escola-um", nome: "Escola Um" }, titulo: "Mechas",
                   slug: "mechas", descricao: "d", capaUrl: nil, precoCentavos: 9900, status: "published",
                   url: "https://campus.example.com/c/mechas", atualizadoEm: "2026-10-20T12:00:00Z" }]
      }.to_json)

      expect { post "/api/v1/integrations/univercampus/sync?inline=true", headers: headers }
        .to have_enqueued_job(UnivercampusSyncJob).with(workspace.id, briefs_only: true)

      expect(body).to include("ok" => true, "synced" => 1)
      expect(workspace.products.where(platform: "univercampus").count).to eq(1)
    end

    it "sem inline enfileira o job" do
      expect { post "/api/v1/integrations/univercampus/sync", headers: headers }
        .to have_enqueued_job(UnivercampusSyncJob).with(workspace.id)
    end

    it "UniverCampus fora do ar devolve stage connection" do
      stub_request(:get, "#{base_url}/api/univerreview/cursos").to_return(status: 500, body: "")

      post "/api/v1/integrations/univercampus/sync?inline=true", headers: headers

      expect(body).to include("ok" => false, "stage" => "connection")
      expect(connection.reload.last_error).to include("HTTP 500")
    end
  end

  describe "POST /integrations/univercampus/push_all" do
    it "enfileira o reenvio de todas as aprovadas e devolve a contagem" do
      create(:univercampus_connection, workspace: workspace)
      course = create(:product, :univercampus, workspace: workspace)
      allow(UnivercampusPushJob).to receive(:enqueue_debounced)
      create_list(:review, 2, :approved, workspace: workspace, product: course)
      create(:review, workspace: workspace, product: course)

      expect { post "/api/v1/integrations/univercampus/push_all", headers: headers }
        .to have_enqueued_job(UnivercampusPushJob).with(workspace.id, all_approved: true)
      expect(body).to include("count" => 2)
    end

    it "sem conexão ativa devolve 400" do
      create(:univercampus_connection, :invalid, workspace: workspace)
      post "/api/v1/integrations/univercampus/push_all", headers: headers
      expect(response).to have_http_status(:bad_request)
    end
  end

  describe "DELETE /integrations/univercampus" do
    it "remove a conexão" do
      create(:univercampus_connection, workspace: workspace)
      delete "/api/v1/integrations/univercampus", headers: headers
      expect(response).to have_http_status(:no_content)
      expect(UnivercampusConnection.where(workspace_id: workspace.id).count).to eq(0)
    end
  end
end
