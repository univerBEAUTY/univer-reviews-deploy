# O widget ganhou o layout `showcase` (vitrine de e-commerce): resumo em card,
# faixa de mídia dos clientes, chips com contagem e "Carregar mais".
class AllowShowcaseWidgetLayout < ActiveRecord::Migration[8.0]
  def up
    execute "ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_widget_layout_check"
    execute <<~SQL
      ALTER TABLE workspaces
        ADD CONSTRAINT workspaces_widget_layout_check
        CHECK (widget_default_layout IN ('default','compact','grid','carousel','showcase'))
    SQL
  end

  def down
    execute "UPDATE workspaces SET widget_default_layout = 'default' WHERE widget_default_layout = 'showcase'"
    execute "ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_widget_layout_check"
    execute <<~SQL
      ALTER TABLE workspaces
        ADD CONSTRAINT workspaces_widget_layout_check
        CHECK (widget_default_layout IN ('default','compact','grid','carousel'))
    SQL
  end
end
