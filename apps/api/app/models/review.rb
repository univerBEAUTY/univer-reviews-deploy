class Review < ApplicationRecord
  belongs_to :workspace
  belongs_to :product, optional: true
  has_many   :review_media,  dependent: :destroy
  has_many   :replies,       dependent: :destroy
  has_one    :reward_grant,  dependent: :nullify

  has_neighbors :embedding

  SOURCES    = %w[manual csv woo shopify ryviu_import email whatsapp widget].freeze
  # "draft" = AI-generated, awaiting operator review in the bulk-draft editor.
  # Kept out of the storefront AND the normal pending moderation queue until
  # the operator hits "Publicar" (which flips it to approved).
  STATUSES   = %w[draft pending approved rejected hidden spam].freeze
  SENTIMENTS = %w[positive negative neutral mixed].freeze

  validates :rating,       presence: true, inclusion: { in: 1..5 }
  validates :workspace_id, presence: true
  validates :source,       inclusion: { in: SOURCES }
  validates :status,       inclusion: { in: STATUSES }
  validates :ai_sentiment, inclusion: { in: SENTIMENTS }, allow_nil: true

  # Length caps. Without them an attacker could POST a 200 MB body to the
  # public submit endpoint and exhaust memory in the AI moderation worker
  # (embedding cost is linear in tokens). The public controller already
  # clamps before save; this is defense in depth at the model boundary so
  # the same constraints apply to imports / API / WP plugin.
  validates :body,         length: { maximum: 4_000 }, allow_nil: true
  validates :title,        length: { maximum: 200 },   allow_nil: true
  validates :author_name,  length: { maximum: 120 },   allow_nil: true
  validates :author_email, length: { maximum: 254 },   allow_nil: true

  before_save :set_approved_at

  # Campos que aparecem no UniverCampus (nota, texto, autor, destaque,
  # status/aprovação) ou que trocam a review de curso.
  UNIVERCAMPUS_PUSH_FIELDS = %w[
    status body title rating is_featured author_name author_avatar_url approved_at product_id
  ].freeze

  after_commit :enqueue_univercampus_push, on: %i[create update destroy]

  scope :approved,     -> { where(status: "approved") }
  scope :pending,      -> { where(status: "pending") }
  scope :draft,        -> { where(status: "draft") }
  scope :for_product,  ->(product_id) { where(product_id: product_id) }
  scope :recent,       -> { order(created_at: :desc) }
  scope :featured,     -> { where(is_featured: true) }
  scope :with_media,   -> { joins(:review_media).distinct }
  scope :with_photo,   -> { joins(:review_media).where(review_media: { type: "image" }).distinct }
  scope :with_video,   -> { joins(:review_media).where(review_media: { type: "video" }).distinct }
  scope :verified,     -> { where(is_verified_purchase: true) }
  scope :by_rating,    ->(r) { where(rating: r) }
  scope :by_source,    ->(s) { where(source: s) }
  scope :by_country,   ->(c) { where(author_country: c) }
  scope :date_range,   ->(from, to) { where(created_at: from..to) }
  scope :search_body,  ->(q) { where("body ILIKE ?", "%#{q}%") }
  scope :most_helpful, -> { order(helpful_count: :desc, created_at: :desc) }

  # Reviews safe to show as social proof on a third-party surface (and to feed
  # Google structured data): approved AND not machine-written.
  #
  # Machine-written rows carry TWO markers, and both are checked on purpose:
  #   - `ai_is_synthetic` — set to true by `ai/bulk-create-reviews` and
  #     `reviews/bulk_import`, but ALSO overwritten by the moderation worker
  #     (Ai::ModerateService) with whatever the detector decides, so a
  #     generated row can come back `false` from a re-run;
  #   - `metadata.ai_generated` — written once at creation, never touched again.
  # A row is "real" only when NEITHER marker says otherwise. `= false` (not
  # `IS NOT TRUE`) so a NULL flag is treated as unknown, i.e. excluded.
  scope :real, -> {
    approved
      .where(ai_is_synthetic: false)
      .where("COALESCE(reviews.metadata->>'ai_generated', 'false') <> 'true'")
  }

  def approved?  = status == "approved"
  def pending?   = status == "pending"
  def rejected?  = status == "rejected"
  def hidden?    = status == "hidden"
  def spam?      = status == "spam"

  def approve!(user_id: nil)
    update!(status: "approved", approved_at: Time.current)
  end

  def reject!
    update!(status: "rejected")
  end

  def mark_spam!
    update!(status: "spam")
  end

  def hide!
    update!(status: "hidden")
  end

  def has_media?
    review_media.any?
  end

  def has_photo?
    review_media.where(type: "image").any?
  end

  def has_video?
    review_media.where(type: "video").any?
  end

  def mark_helpful!
    increment!(:helpful_count)
  end

  def mark_unhelpful!
    increment!(:unhelpful_count)
  end

  private

  # Enfileira o push (com debounce por curso) quando a review é de um curso do
  # UniverCampus e algo visível lá mudou. Nunca derruba o save.
  def enqueue_univercampus_push
    univercampus_push_targets.each do |target_product_id, kind|
      UnivercampusPushJob.enqueue_debounced(
        workspace_id: workspace_id,
        product_id:   target_product_id,
        upsert_ids:   kind == :upsert ? [id] : [],
        delete_ids:   kind == :delete ? [id] : []
      )
    end
  rescue StandardError => e
    Rails.logger.error("[UC-PUSH] review=#{id} não enfileirou push: #{e.class}: #{e.message}")
  end

  # { product_id => :upsert | :delete }, só para produtos do UniverCampus.
  def univercampus_push_targets
    candidates =
      if destroyed?
        { product_id => :delete }
      else
        return {} unless (saved_changes.keys & UNIVERCAMPUS_PUSH_FIELDS).any?
        moved_from = saved_change_to_product_id? ? product_id_before_last_save : nil
        { moved_from => :delete, product_id => :upsert }
      end
    candidates = candidates.reject { |pid, _| pid.nil? }
    return {} if candidates.empty?

    # after_commit roda depois do COMMIT da request, quando o SET LOCAL do
    # tenant já não vale — reabre o escopo RLS para ler products.
    ids = self.class.transaction do
      self.class.connection.execute(
        self.class.sanitize_sql(["SET LOCAL app.workspace_id = ?", workspace_id.to_s])
      )
      Product.where(id: candidates.keys, platform: ::Integrations::Univercampus::CourseSyncer::PLATFORM).pluck(:id)
    end
    candidates.slice(*ids)
  end

  def set_approved_at
    if status_changed?(to: "approved") && approved_at.nil?
      self.approved_at = Time.current
    end
  end
end
