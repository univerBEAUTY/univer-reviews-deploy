require "rails_helper"

RSpec.describe UnivercampusConnection, type: :model do
  let(:workspace) { create(:workspace) }
  let(:token)     { "ucrev_#{'b' * 43}" }

  it "criptografa o token no banco e devolve o texto puro pelo modelo" do
    conn = create(:univercampus_connection, workspace: workspace, api_token: token)
    raw = ActiveRecord::Base.connection.select_value(
      ActiveRecord::Base.sanitize_sql(["SELECT api_token FROM univercampus_connections WHERE id = ?", conn.id])
    )
    expect(raw).not_to include(token)
    expect(described_class.find(conn.id).api_token).to eq(token)
  end

  it "grava os 12 primeiros caracteres como token_prefix" do
    conn = create(:univercampus_connection, api_token: token)
    expect(conn.token_prefix).to eq(token[0, 12])
  end

  it "rejeita token fora do formato ucrev_" do
    conn = build(:univercampus_connection, api_token: "sk_live_123")
    expect(conn).not_to be_valid
    expect(conn.errors[:api_token]).to be_present
  end

  it "rejeita base_url que não é URL http(s) (inclusive com lixo depois de uma quebra de linha)" do
    expect(build(:univercampus_connection, base_url: "ftp://campus.example.com")).not_to be_valid
    expect(build(:univercampus_connection, base_url: "https://campus.example.com\njavascript:alert(1) x")).not_to be_valid
    expect(build(:univercampus_connection, base_url: "http://localhost:3000")).to be_valid
  end

  it "permite só uma conexão por workspace" do
    create(:univercampus_connection, workspace: workspace)
    expect(build(:univercampus_connection, workspace: workspace)).not_to be_valid
  end

  it "normaliza base_url removendo barra final e /api/univerreview" do
    conn = build(:univercampus_connection, base_url: " https://campus.example.com/api/univerreview/ ")
    conn.validate
    expect(conn.base_url).to eq("https://campus.example.com")
  end

  it "default_base_url vem de UNIVERCAMPUS_API_URL com fallback" do
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:[]).with("UNIVERCAMPUS_API_URL").and_return(nil)
    expect(described_class.default_base_url).to eq("https://univercampus.cloud")
    allow(ENV).to receive(:[]).with("UNIVERCAMPUS_API_URL").and_return("http://localhost:3000/")
    expect(described_class.default_base_url).to eq("http://localhost:3000")
  end

  it "mark_invalid! muda o status e guarda o erro" do
    conn = create(:univercampus_connection)
    conn.mark_invalid!("401 token revogado")
    expect(conn.reload.status).to eq("invalid")
    expect(conn.last_error).to eq("401 token revogado")
  end

  it "record_verification! reativa e guarda dono + escolas" do
    conn = create(:univercampus_connection, :invalid)
    conn.record_verification!(
      owner:   { "id" => "u1", "nome" => "Ana", "email" => "a@example.com" },
      schools: [{ "id" => "e1", "slug" => "e", "nome" => "E", "url" => "https://x.example.com" }]
    )
    conn.reload
    expect(conn.status).to eq("active")
    expect(conn.last_error).to be_nil
    expect(conn.owner_info["nome"]).to eq("Ana")
    expect(conn.schools.first["slug"]).to eq("e")
  end

  it "as_payload e inspect nunca incluem o token" do
    conn = create(:univercampus_connection, api_token: token)
    expect(conn.as_payload.to_json).not_to include(token)
    expect(conn.as_payload).to include(connected: true, status: "active", token_prefix: token[0, 12])
    expect(conn.inspect).not_to include(token)
  end

  describe ".encryption_configured?" do
    it "é true quando as três chaves existem (test.rb define valores fixos)" do
      expect(described_class.encryption_configured?).to be(true)
    end

    it "é false quando falta alguma chave" do
      allow(ActiveRecord::Encryption.config).to receive(:has_primary_key?).and_return(nil)
      expect(described_class.encryption_configured?).to be(false)
    end
  end
end
