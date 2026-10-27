module Integrations
  module Univercampus
    # Abre uma transação com `SET LOCAL app.workspace_id` — mesmo contrato do
    # WooCommerceProductSyncer e de ApplicationJob#with_workspace_rls — para as
    # políticas RLS enxergarem o tenant certo. Dentro de uma request (que já
    # está numa transação com o tenant), apenas aninha.
    module WorkspaceScope
      private

      def with_rls(workspace_id)
        ActiveRecord::Base.transaction do
          ActiveRecord::Base.connection.execute(
            ActiveRecord::Base.sanitize_sql(["SET LOCAL app.workspace_id = ?", workspace_id.to_s])
          )
          yield
        end
      end
    end
  end
end
