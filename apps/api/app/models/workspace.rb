class Workspace < ApplicationRecord
  belongs_to :better_auth_organization,
             class_name: "BetterAuth::Organization",
             foreign_key: :better_auth_org_id,
             optional: true

  has_many :workspace_users,    dependent: :destroy
  has_many :workspace_api_keys, dependent: :destroy
  has_many :workspace_domains,  dependent: :destroy
  has_many :products,           dependent: :destroy
  has_many :product_groups,     dependent: :destroy
  has_many :reviews,            dependent: :destroy
  has_many :campaigns,          dependent: :destroy
  has_many :reward_rules,       dependent: :destroy
  has_many :reward_grants,      dependent: :destroy
  has_many :imports,            dependent: :destroy
  has_many :ai_jobs,            dependent: :destroy
  has_many :audit_logs,         dependent: :destroy
  has_many :questions,          dependent: :destroy
  has_many :question_groups,    dependent: :destroy
  has_many :loyalty_configs,    dependent: :destroy
  has_many :ai_summary_topics,  dependent: :destroy
  has_many :platform_events,    dependent: :destroy
  has_one  :subscription,       dependent: :destroy
  has_one  :univercampus_connection, dependent: :destroy

  # T1.3 collapsed the legacy free/starter/pro/enterprise tuple into the
  # current paid-only ladder. See the rename migration header for why
  # freemium was removed and how rows were remapped.
  PLANS   = %w[entry medium ultra].freeze
  # Added 'cancelled' (T1.1+) to model voluntary churn distinctly from
  # 'suspended' (which implies founder-initiated moderation / abuse).
  # See migration 20260528192242 for the DB-level CHECK and rationale.
  STATUSES = %w[active suspended trial cancelled].freeze
  WIDGET_LAYOUTS = %w[default compact grid carousel showcase].freeze
  WIDGET_STAR_SHAPES = %w[star heart flame thumb diamond].freeze
  WIDGET_LOCALES = %w[pt-BR en-US es-AR].freeze

  validates :slug,   presence: true, uniqueness: true,
                     format: { with: /\A[a-z0-9-]+\z/, message: "only lowercase letters, numbers and hyphens" }
  validates :name,   presence: true
  validates :plan,   inclusion: { in: PLANS }
  validates :status, inclusion: { in: STATUSES }
  validates :brand_color,      format: { with: /\A#[0-9a-fA-F]{6}\z/, allow_blank: true }
  validates :widget_star_color, format: { with: /\A#[0-9a-fA-F]{6}\z/, allow_blank: false }
  validates :widget_default_layout, inclusion: { in: WIDGET_LAYOUTS }
  validates :widget_per_page, numericality: {
    only_integer: true, greater_than_or_equal_to: 1, less_than_or_equal_to: 100,
  }
  # NULL = "use the plan default from PlanFeatures::LIMITS"; an explicit
  # integer overrides for this workspace only. Guard against 0/negative
  # so the super-admin UI can rely on (seat_limit.nil? || seat_limit > 0).
  validates :seat_limit, numericality: {
    only_integer: true, greater_than: 0, less_than_or_equal_to: 10_000,
  }, allow_nil: true
  validates :rating_icon_preset,
            inclusion: { in: WIDGET_STAR_SHAPES, allow_blank: true }

  scope :active,    -> { where(status: "active") }
  scope :suspended, -> { where(status: "suspended") }
  scope :cancelled, -> { where(status: "cancelled") }

  def active?    = status == "active"
  def suspended? = status == "suspended"
  def trial?     = status == "trial"
  def cancelled? = status == "cancelled"

  # Effective seat cap = explicit override OR plan default. Returns nil
  # for unlimited (ultra plan with no override). The plan default lives
  # in `PlanFeatures::LIMITS[plan][:max_team_members]` — keep the key in
  # sync if the limit table ever renames.
  def effective_seat_limit
    return seat_limit if seat_limit.present?
    PlanFeatures.limit(:max_team_members, self)
  end

  # True if adding one more member would exceed the effective cap.
  # Returns false when seats are unlimited.
  def seat_limit_reached?
    cap = effective_seat_limit
    return false if cap.nil?
    workspace_users.count >= cap
  end

  def plan_entry?  = plan == "entry"
  def plan_medium? = plan == "medium"
  def plan_ultra?  = plan == "ultra"

  def woocommerce_domain
    workspace_domains.find_by(platform: "woocommerce")
  end

  def woocommerce_config
    woocommerce_domain&.platform_meta
  end

  # Public widget config exposed at GET /api/v1/public/widget-config. The
  # storefront `<univer-reviews>` element calls this on connect to pick up
  # workspace-level defaults, with the rule that an explicit HTML attribute
  # always wins (attribute > workspace setting > built-in default).
  def widget_config
    {
      layout:            widget_default_layout.presence || "default",
      locale:            default_locale.presence || "pt-BR",
      theme_color:       brand_color.presence || "#d4a850",
      star_color:        widget_star_color.presence || "#fbbf24",
      star_shape:        rating_icon_preset.presence || "star",
      # Custom brand icon override. When set, the storefront renders the
      # uploaded artwork (SVG or PNG) in place of the preset star shape.
      # `star_icon_url` is the "filled" state and is masked + tinted with
      # `star_color`; if the workspace also uploaded a distinct "empty"
      # artwork we expose it so the widget can render both states cleanly.
      star_icon_url:     rating_icon_filled.presence,
      star_icon_empty_url: rating_icon_empty.presence,
      show_qa:           widget_show_qa.nil? ? true : widget_show_qa,
      show_write_review: widget_show_write_review.nil? ? true : widget_show_write_review,
      per_page:          widget_per_page.presence || 5,
      custom_css:        widget_custom_css.to_s,
    }
  end
end
