require "rails_helper"

# Usa o Redis de verdade (REDIS_URL). Sem Redis acessível, pula.
RSpec.describe Integrations::Univercampus::PushBuffer do
  let(:workspace_id) { SecureRandom.uuid }
  let(:product_id)   { SecureRandom.uuid }

  before do
    reachable = begin
      Sidekiq.redis { |r| r.call("PING") } == "PONG"
    rescue StandardError
      false
    end
    skip "Redis indisponível em #{ENV['REDIS_URL']}" unless reachable
  end

  after do
    base = described_class.key(workspace_id, product_id)
    Sidekiq.redis { |r| r.call("DEL", "#{base}:scheduled", "#{base}:upsert", "#{base}:delete") }
  rescue StandardError
    nil
  end

  def add(**ids)
    described_class.add(workspace_id: workspace_id, product_id: product_id, **ids)
  end

  def drain
    described_class.drain(workspace_id: workspace_id, product_id: product_id)
  end

  it "abre a janela só na primeira mudança e junta os ids" do
    expect(add(upsert_ids: ["r1"])).to be(true)
    expect(add(upsert_ids: ["r2"], delete_ids: ["r3"])).to be(false)
    expect(drain).to eq([%w[r1 r2], ["r3"]])
  end

  it "drain fecha a janela: a próxima mudança abre outra e o buffer começa vazio" do
    add(upsert_ids: ["r1"])
    drain
    expect(add(upsert_ids: ["r4"])).to be(true)
    expect(drain).to eq([["r4"], []])
  end
end
