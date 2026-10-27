module Integrations
  module Univercampus
    # A escola do UniverCampus como item avaliável: um produto
    # `platform: "univercampus"` com platform_product_id "escola:<id>" e
    # `metadata.univercampus.tipo = "escola"`. Assim a geração IA, a moderação
    # e o push tratam escola e curso pelo mesmo caminho; só o payload muda
    # (escolaId em vez de cursoId).
    module School
      PREFIX = "escola:".freeze
      TIPO   = "escola".freeze

      module_function

      def platform_product_id(school_id)
        "#{PREFIX}#{school_id}"
      end

      def school?(product)
        product.present? && product.platform == "univercampus" &&
          product.platform_product_id.to_s.start_with?(PREFIX)
      end

      # Restringe uma relation de produtos a escolas (ou, com except, a cursos).
      def filter(relation, except: false)
        condition = ["products.platform_product_id LIKE ?", "#{PREFIX}%"]
        except ? relation.where.not(*condition) : relation.where(*condition)
      end

      def school_id(product)
        product.platform_product_id.to_s.delete_prefix(PREFIX)
      end
    end
  end
end
