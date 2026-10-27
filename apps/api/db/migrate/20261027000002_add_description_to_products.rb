# Descrição do produto (aditiva, nullable). Hoje só o sync do UniverCampus
# preenche (`cursos[].descricao`); o Ai::GenerateService usa como contexto
# quando o produto não tem `metadata.ai_brief`.
class AddDescriptionToProducts < ActiveRecord::Migration[8.0]
  def change
    add_column :products, :description, :text
  end
end
