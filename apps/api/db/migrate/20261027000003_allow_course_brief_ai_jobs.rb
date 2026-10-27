# Aceita `course_brief` em ai_jobs.job_type (Ai::CourseBriefService registra
# o custo de cada resumo de curso do UniverCampus como AiJob, o que também o
# faz contar no AiCostCap). Aditiva: só amplia o CHECK.
#
# O down volta à lista antiga com NOT VALID para não apagar linhas já gravadas.
class AllowCourseBriefAiJobs < ActiveRecord::Migration[8.0]
  OLD_TYPES = %w[moderate generate reply sentiment translate dedup embed].freeze
  NEW_TYPES = (OLD_TYPES + %w[course_brief]).freeze

  def up
    execute "ALTER TABLE ai_jobs DROP CONSTRAINT IF EXISTS ai_jobs_type_check"
    execute "ALTER TABLE ai_jobs ADD CONSTRAINT ai_jobs_type_check CHECK (job_type IN (#{quoted(NEW_TYPES)}))"
  end

  def down
    execute "ALTER TABLE ai_jobs DROP CONSTRAINT IF EXISTS ai_jobs_type_check"
    execute "ALTER TABLE ai_jobs ADD CONSTRAINT ai_jobs_type_check CHECK (job_type IN (#{quoted(OLD_TYPES)})) NOT VALID"
  end

  private

  def quoted(types)
    types.map { |t| "'#{t}'" }.join(",")
  end
end
