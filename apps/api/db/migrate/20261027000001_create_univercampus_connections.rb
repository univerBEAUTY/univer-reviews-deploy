# Conexão de um workspace com o UniverCampus (uma por workspace).
#
# O token `ucrev_…` é gerado pelo dono das escolas no UniverCampus e dá
# acesso a todas as escolas em que ele é dono. A coluna `api_token` guarda o
# envelope cifrado pelo Active Record Encryption (`encrypts :api_token` no
# modelo) — nunca o token puro. `token_prefix` (12 primeiros caracteres)
# existe só para exibição no admin.
#
# Aditiva: tabela nova, nada existente muda. RLS igual a product_groups.
class CreateUnivercampusConnections < ActiveRecord::Migration[8.0]
  def up
    create_table :univercampus_connections, id: :uuid, default: -> { "gen_random_uuid()" } do |t|
      t.column   :workspace_id,   :uuid, null: false
      t.string   :base_url,       null: false
      t.text     :api_token,      null: false
      t.string   :token_prefix
      t.jsonb    :schools,        null: false, default: []
      t.jsonb    :owner_info,     null: false, default: {}
      t.string   :status,         null: false, default: "active"
      t.datetime :verified_at
      t.datetime :last_synced_at
      t.datetime :last_pushed_at
      t.text     :last_error
      t.datetime :created_at,     null: false, default: -> { "NOW()" }
      t.datetime :updated_at,     null: false, default: -> { "NOW()" }
    end

    %w[verified_at last_synced_at last_pushed_at created_at updated_at].each do |col|
      execute "ALTER TABLE univercampus_connections ALTER COLUMN #{col} TYPE TIMESTAMPTZ"
    end

    add_index :univercampus_connections, :workspace_id, unique: true,
              name: "idx_univercampus_connections_workspace_unique"
    add_foreign_key :univercampus_connections, :workspaces, on_delete: :cascade
    execute <<~SQL
      ALTER TABLE univercampus_connections
        ADD CONSTRAINT univercampus_connections_status_check CHECK (status IN ('active','invalid'))
    SQL

    execute "ALTER TABLE univercampus_connections ENABLE ROW LEVEL SECURITY"
    execute <<~SQL
      CREATE POLICY univercampus_connections_workspace_isolation ON univercampus_connections
        USING (workspace_id = current_setting('app.workspace_id', true)::uuid)
    SQL
    execute "ALTER TABLE univercampus_connections FORCE ROW LEVEL SECURITY"
  end

  def down
    execute "DROP POLICY IF EXISTS univercampus_connections_workspace_isolation ON univercampus_connections"
    drop_table :univercampus_connections, if_exists: true
  end
end
