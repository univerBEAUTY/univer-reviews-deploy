module Integrations
  module Univercampus
    # Debounce do push por produto (curso). Mudanças de reviews do mesmo curso
    # que chegam dentro de WINDOW segundos são juntadas em dois conjuntos no
    # Redis — ids a (re)enviar e ids a remover — e um único job drena tudo.
    #
    # `add` devolve true só para quem abriu a janela (esse agenda o job).
    # `drain` fecha a janela ANTES de ler os conjuntos: uma mudança que chegue
    # no meio abre janela nova e nada se perde.
    module PushBuffer
      WINDOW = 10   # segundos
      TTL    = 3600 # conjuntos órfãos expiram sozinhos

      module_function

      def key(workspace_id, product_id)
        "univercampus:push:#{workspace_id}:#{product_id}"
      end

      def add(workspace_id:, product_id:, upsert_ids: [], delete_ids: [])
        base = key(workspace_id, product_id)
        Sidekiq.redis do |redis|
          redis.call("SADD", "#{base}:upsert", *upsert_ids.map(&:to_s)) if upsert_ids.any?
          redis.call("SADD", "#{base}:delete", *delete_ids.map(&:to_s)) if delete_ids.any?
          redis.call("EXPIRE", "#{base}:upsert", TTL)
          redis.call("EXPIRE", "#{base}:delete", TTL)
          # Expira sozinho se o job nunca rodar (Sidekiq parado), para a
          # próxima mudança conseguir agendar de novo.
          redis.call("SET", "#{base}:scheduled", "1", "NX", "EX", WINDOW * 6) == "OK"
        end
      end

      # Fecha a janela e devolve [upsert_ids, delete_ids].
      def drain(workspace_id:, product_id:)
        base = key(workspace_id, product_id)
        Sidekiq.redis do |redis|
          redis.call("DEL", "#{base}:scheduled")
          upserts, deletes, _deleted = redis.multi do |tx|
            tx.call("SMEMBERS", "#{base}:upsert")
            tx.call("SMEMBERS", "#{base}:delete")
            tx.call("DEL", "#{base}:upsert", "#{base}:delete")
          end
          [Array(upserts).sort, Array(deletes).sort]
        end
      end
    end
  end
end
