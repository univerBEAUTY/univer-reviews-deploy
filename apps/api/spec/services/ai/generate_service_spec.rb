require "rails_helper"

RSpec.describe Ai::GenerateService, type: :service do
  let(:workspace) { create(:workspace) }
  subject(:service) { described_class.new(workspace) }

  before do
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:[]).with("ANTHROPIC_API_KEY").and_return("test")
  end

  def prompt_for(product)
    service.send(:build_system_prompt, product)
  end

  it "usa metadata.ai_brief como contexto do produto" do
    product = create(:product, workspace: workspace, title: "Mechas Perfeitas", description: "Descrição longa",
                               metadata: { "ai_brief" => "Curso para cabeleireiras iniciantes." })
    prompt = prompt_for(product)
    expect(prompt).to include("- Name: Mechas Perfeitas")
    expect(prompt).to include("- About: Curso para cabeleireiras iniciantes.")
    expect(prompt).not_to include("Descrição longa")
  end

  it "sem resumo usa a descrição sem HTML, cortada em 600 caracteres" do
    product = create(:product, workspace: workspace, description: "<p>#{'Aula prática de coloração. ' * 60}</p>")
    about = prompt_for(product)[/- About: (.+)\z/, 1]
    expect(about).to start_with("Aula prática de coloração.")
    expect(about).not_to include("<p>")
    expect(about.length).to be <= 600
  end

  it "sem resumo e sem descrição mantém o prompt de antes (nome + handle)" do
    product = create(:product, workspace: workspace, title: "Sérum", handle: "serum", description: nil, metadata: {})
    expect(prompt_for(product)).to end_with("Product context:\n- Name: Sérum\n- Handle: serum")
  end

  it "sem produto não adiciona contexto" do
    expect(prompt_for(nil)).not_to include("Product context")
  end
end
