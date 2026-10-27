class AiJob < ApplicationRecord
  belongs_to :workspace

  JOB_TYPES = %w[moderate generate reply sentiment translate dedup embed course_brief].freeze
  STATUSES   = %w[pending running done failed].freeze

  validates :job_type, inclusion: { in: JOB_TYPES }
  validates :status,   inclusion: { in: STATUSES }

  scope :by_type,   ->(t) { where(job_type: t) }
  scope :done,      -> { where(status: "done") }
  scope :failed,    -> { where(status: "failed") }
  scope :recent,    -> { order(created_at: :desc) }
  scope :this_month, -> { where("created_at >= ?", Time.current.beginning_of_month) }

  def total_tokens
    input_tokens.to_i + output_tokens.to_i
  end
end
