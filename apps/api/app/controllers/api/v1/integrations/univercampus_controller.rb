module Api
  module V1
    module Integrations
      # Conexão do workspace com o UniverCampus (design 2026-10-27, seção 4).
      # Espelha WoocommerceController: leitura para quem está no workspace,
      # escrita exige require_write!. O token nunca sai em nenhuma resposta.
      class UnivercampusController < ApplicationController
        Client   = ::Integrations::Univercampus::Client
        School   = ::Integrations::Univercampus::School
        PLATFORM = ::Integrations::Univercampus::CourseSyncer::PLATFORM

        # Chaves do Active Record Encryption ausentes/trocadas no servidor:
        # resposta clara em vez de 500. O resto do app não é afetado.
        rescue_from ActiveRecord::Encryption::Errors::Base, with: :encryption_unavailable

        # GET /api/v1/integrations/univercampus
        def show
          connection = current_workspace.univercampus_connection
          render json: connection ? payload(connection) : disconnected_payload
        end

        # POST /api/v1/integrations/univercampus — salva, testa e enfileira o sync.
        # Token em branco mantém o já salvo (para trocar só a URL).
        def create
          require_write!

          connection = current_workspace.univercampus_connection || current_workspace.build_univercampus_connection
          was_new = connection.new_record?
          connection.base_url  = conn_params[:base_url].presence || connection.base_url.presence || UnivercampusConnection.default_base_url
          connection.api_token = conn_params[:api_token].presence || connection.api_token
          connection.save!

          probe = probe(connection.base_url, connection.api_token)
          if probe[:success]
            connection.record_verification!(owner: probe[:owner], schools: probe[:schools])
            UnivercampusSyncJob.perform_later(current_workspace.id)
          else
            connection.mark_invalid!(probe[:error])
          end

          AuditLog.record(
            workspace: current_workspace,
            action:    was_new ? "univercampus.connected" : "univercampus.updated",
            request:   request
          )
          render json: payload(connection).merge(probe: probe.slice(:success, :error)),
                 status: was_new ? :created : :ok
        end

        # PATCH /api/v1/integrations/univercampus
        def update
          create
        end

        # DELETE /api/v1/integrations/univercampus
        # Produtos e reviews ficam; o que já foi publicado no UniverCampus também.
        def destroy
          require_write!

          connection = current_workspace.univercampus_connection
          unless connection
            render json: { error: "not_found" }, status: :not_found
            return
          end

          connection.destroy!
          AuditLog.record(workspace: current_workspace, action: "univercampus.disconnected", request: request)
          head :no_content
        end

        # POST /api/v1/integrations/univercampus/test — testa sem salvar.
        def test
          connection = current_workspace.univercampus_connection
          base_url   = conn_params[:base_url].presence || connection&.base_url || UnivercampusConnection.default_base_url
          token      = conn_params[:api_token].presence || connection&.api_token

          if token.blank?
            render json: { success: false, message: "Cole o token gerado no UniverCampus antes de testar." },
                   status: :bad_request
            return
          end

          result = probe(base_url, token)
          if result[:success]
            owner = result[:owner]
            name  = owner["nome"].presence || owner["email"].presence || "dono"
            render json: {
              success: true,
              message: "Conectado como #{name} — #{result[:schools].size} escola(s)",
              owner:   owner,
              schools: result[:schools]
            }
          else
            render json: { success: false, message: result[:error] }
          end
        end

        # POST /api/v1/integrations/univercampus/sync (?inline=true roda na hora)
        def sync
          require_write!

          connection = current_workspace.univercampus_connection
          unless connection&.active?
            render json: { error: "not_configured", message: "Conecte o UniverCampus com um token válido antes de sincronizar." },
                   status: :bad_request
            return
          end

          unless ActiveModel::Type::Boolean.new.cast(params[:inline])
            UnivercampusSyncJob.perform_later(current_workspace.id)
            render json: { message: "Sincronização de cursos enfileirada" }
            return
          end

          result = ::Integrations::Univercampus::CourseSyncer.run(connection: connection)
          # Resumos IA saem da request (1 chamada Haiku por curso alterado).
          UnivercampusSyncJob.perform_later(current_workspace.id, briefs_only: true) unless result[:stage]
          render json: result
        rescue Client::Error => e
          render json: { ok: false, stage: "connection", error: e.message, synced: 0, failed: 0 }
        end

        # POST /api/v1/integrations/univercampus/push_all — reenvia todas as
        # aprovadas dos cursos ativos (o push normal é automático, por review).
        def push_all
          require_write!

          connection = current_workspace.univercampus_connection
          unless connection&.active?
            render json: { error: "not_configured", message: "Conecte o UniverCampus com um token válido antes de reenviar." },
                   status: :bad_request
            return
          end

          UnivercampusPushJob.perform_later(current_workspace.id, all_approved: true)
          render json: { message: "Reenvio de avaliações enfileirado", count: published_reviews.count }
        end

        private

        def conn_params
          params.permit(:base_url, :api_token)
        end

        def probe(base_url, token)
          data = Client.new(base_url: base_url, token: token).schools
          {
            success: true,
            owner:   data["usuario"].is_a?(Hash) ? data["usuario"] : {},
            schools: Array(data["escolas"])
          }
        rescue Client::AuthError => e
          { success: false, error: "Token recusado pelo UniverCampus: #{e.message}" }
        rescue Client::InvalidUrlError => e
          { success: false, error: "URL inválida: #{e.message}" }
        rescue Client::Error => e
          { success: false, error: "Não foi possível falar com o UniverCampus: #{e.message}" }
        end

        def disconnected_payload
          { connected: false, base_url: UnivercampusConnection.default_base_url }
        end

        def univercampus_products
          current_workspace.products.where(platform: PLATFORM, active: true)
        end

        def course_products
          School.filter(univercampus_products, except: true)
        end

        def published_reviews
          current_workspace.reviews.approved.joins(:product).where(products: { platform: PLATFORM, active: true })
        end

        def payload(connection)
          per_school = course_products.group(Arel.sql("metadata->'univercampus'->'escola'->>'id'")).count
          schools = Array(connection.schools).map do |school|
            school.merge("course_count" => per_school[school["id"]].to_i)
          end

          connection.as_payload.merge(
            schools:      schools,
            course_count: course_products.count,
            school_count: School.filter(univercampus_products).count,
            review_count: published_reviews.count
          )
        end

        def encryption_unavailable(_error)
          render json: {
            error:   "encryption_not_configured",
            message: UnivercampusConnection::ENCRYPTION_MISSING
          }, status: :unprocessable_entity
        end
      end
    end
  end
end
