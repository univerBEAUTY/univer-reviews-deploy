require "rails_helper"

# O Faker carrega dezenas de locales em dev/test e mascarava a falta de pt-BR
# em produção (onde o Faker não está no bundle): o ActiveJob grava o locale
# da request no job e o Sidekiq recusava todos com I18n::InvalidLocale.
RSpec.describe "Configuração de I18n" do
  it "declara pt-BR como locale disponível sem depender de gem de teste" do
    expect(Rails.application.config.i18n.available_locales).to include(:"pt-BR")
  end

  it "um job serializado com locale pt-BR desserializa" do
    job = I18n.with_locale(:"pt-BR") { UnivercampusSyncJob.new("ws").serialize }
    expect(job["locale"]).to eq("pt-BR")
    expect { ActiveJob::Base.deserialize(job) }.not_to raise_error
  end
end
