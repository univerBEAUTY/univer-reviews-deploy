require "rails_helper"

RSpec.describe Integrations::UrlGuard do
  let(:error_class) { Class.new(StandardError) }

  it "aceita URL pública https e devolve a própria URL" do
    expect(described_class.validate!("https://campus.example.com", error_class: error_class))
      .to eq("https://campus.example.com")
  end

  it "bloqueia loopback literal" do
    expect { described_class.validate!("http://127.0.0.1:3000", error_class: error_class, field: "base_url") }
      .to raise_error(error_class, %r{base_url .*private/loopback})
  end

  it "bloqueia o endpoint de metadados da nuvem" do
    expect { described_class.validate!("http://169.254.169.254/latest", error_class: error_class) }
      .to raise_error(error_class, %r{private/loopback})
  end

  it "bloqueia esquema que não é http(s)" do
    expect { described_class.validate!("ftp://campus.example.com", error_class: error_class) }
      .to raise_error(error_class, /must use http or https/)
  end

  it "allow_private libera localhost (UniverCampus local em dev/test)" do
    expect(described_class.validate!("http://localhost:3000", error_class: error_class, allow_private: true))
      .to eq("http://localhost:3000")
  end

  it "WooCommerceAdapter continua bloqueando loopback com a mensagem de store_url" do
    expect {
      Integrations::WooCommerceAdapter.new(store_url: "http://127.0.0.1", consumer_key: "ck", consumer_secret: "cs")
    }.to raise_error(Integrations::WooCommerceAdapter::InvalidStoreUrlError, %r{store_url .*private/loopback})
  end
end
