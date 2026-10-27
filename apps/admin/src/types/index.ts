// ─── Review ───────────────────────────────────────────────────────────────────

export type ReviewStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'hidden' | 'spam'
export type ReviewSource = 'widget' | 'woocommerce' | 'api' | 'import' | 'ai_generated'
export type BulkAction = 'approve' | 'reject' | 'delete' | 'hide' | 'mark_spam'

export interface ReviewMedia {
  id: string
  url: string
  type: 'image' | 'video'
  thumbnail_url?: string
}

export interface ReviewReply {
  id: string
  body: string
  // Serializer returns `author_name`; `author` kept for back-compat.
  author_name?: string | null
  author?: string
  created_at: string
  ai_generated?: boolean
}

export interface AiAnalysis {
  quality_score: number
  sentiment: 'positive' | 'neutral' | 'negative'
  topics: string[]
  is_synthetic: boolean
  synthetic_confidence: number
  moderation_flags: string[]
  /** Optional free-text rationale from the moderation prompt, surfaced
   *  in the moderation-queue card so operators see why the IA scored
   *  the review the way it did. */
  reason?: string | null
}

export interface Review {
  id: string
  workspace_id: string
  product_id: string | null
  product_name: string | null
  author_name: string
  author_email: string | null
  author_avatar_url: string | null
  // "female" | "male" | null — drives the gender toggle in the editors.
  author_gender: string | null
  author_country: string | null
  rating: number
  title: string | null
  body: string
  status: ReviewStatus
  source: ReviewSource
  verified_purchase: boolean
  // Actual serializer field name (the API returns is_verified_purchase).
  is_verified_purchase: boolean
  helpful_count: number
  media: ReviewMedia[]
  replies: ReviewReply[]
  ai_analysis: AiAnalysis | null
  reward_id: string | null
  product?: { id: string; title: string | null; handle: string | null; image_url: string | null } | null
  created_at: string
  updated_at: string
  published_at: string | null
  approved_at: string | null
}

export interface ReviewListParams {
  page?: number
  per_page?: number
  q?: string
  status?: ReviewStatus | ''
  rating?: number | ''
  source?: ReviewSource | ''
  product_id?: string
  from?: string
  to?: string
  sort?: string
  direction?: 'asc' | 'desc'
  // Carousel / Summary admin filter: reviews that have any attached media.
  // Sent as ILIKE-friendly string ("true") because the API param parser
  // does string comparison.
  with_media?: 'true' | undefined
}

export interface ReviewVariant {
  id: string
  body: string
  rating: number
  author_name: string
}

export interface CreateReviewInput {
  product_id: string
  author_name: string
  author_email?: string
  rating: number
  title?: string
  body: string
  status?: ReviewStatus
}

export interface AiModerateResult {
  review_id: string
  quality_score: number
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed'
  topics: string[]
  is_synthetic: boolean
  synthetic_confidence: number
  moderation_flags: string[]
  recommendation: 'approve' | 'reject' | 'review'
  reason?: string | null
}

export interface AiHealth {
  configured: boolean
  reason: 'ok' | 'missing' | 'placeholder' | string
  models: { sonnet: string; haiku: string }
}

export interface AiSimilarReview {
  id: string
  title: string | null
  body: string | null
  rating: number
  status: ReviewStatus
  neighbor_distance: number
}

export interface GenerateVariantsInput {
  product_name: string
  rating: number
  tone: string
  count: number
  template?: string
}

export interface DuplicateCluster {
  id: string
  review_ids: string[]
  count: number
  similarity_score: number
  sample_reviews: Pick<Review, 'id' | 'body' | 'author_name' | 'rating'>[]
  product_id: string | null
  product_name: string | null
  created_at: string
}

// ─── Workspace ────────────────────────────────────────────────────────────────

export type RatingIcon = 'star' | 'heart' | 'flame' | 'thumb' | 'diamond'
export type UserRole = 'owner' | 'admin' | 'moderator' | 'viewer'

export interface WorkspaceUser {
  id: string
  email: string
  name: string
  avatar_url: string | null
  role: UserRole
  created_at: string
  last_seen_at: string | null
}

export interface WorkspaceBranding {
  brand_color: string
  rating_icon: RatingIcon
  logo_url: string | null
  brand_voice: string | null
}

/**
 * Storefront `<univer-reviews>` widget customization. The admin "Aparência do
 * Widget" tab edits these fields and the storefront fetches them via
 * GET /api/v1/public/widget-config. Per-element HTML attributes always win
 * over the workspace-level values stored here (precedence:
 * attribute > workspace setting > built-in default).
 */
export type WidgetLayout = 'default' | 'compact' | 'grid' | 'carousel'
export type WidgetLocale = 'pt-BR' | 'en-US' | 'es-AR'
export type WidgetStarShape = 'star' | 'heart' | 'flame' | 'thumb' | 'diamond'

export interface WidgetConfig {
  layout: WidgetLayout
  locale: WidgetLocale
  theme_color: string
  star_color: string
  star_shape: WidgetStarShape
  /** Custom brand artwork (SVG/PNG public URL) shown in place of the preset
   *  star shape. Tinted with `star_color` via CSS mask. Null when the
   *  workspace hasn't uploaded a custom icon. */
  star_icon_url?: string | null
  /** Optional distinct "empty" state artwork. When null, the widget uses
   *  the filled icon at low opacity for unfilled positions. */
  star_icon_empty_url?: string | null
  show_qa: boolean
  show_write_review: boolean
  per_page: number
  custom_css: string
}

export interface WorkspaceDomain {
  id: string
  domain: string
  platform: 'woocommerce' | 'shopify' | 'generic'
  verified: boolean
}

export interface Workspace {
  id: string
  name: string
  slug: string
  default_locale: string
  currency: string
  branding: WorkspaceBranding
  /** Storefront widget customization. Optional so older payloads still type-check. */
  widget?: WidgetConfig
  // Three-tier paid ladder (T1.3). Source of truth: Rails Workspace::PLANS
  // and the workspaces_plan_check CHECK constraint. Renaming here without
  // running the DB migration will desync the admin from the backend.
  plan: 'entry' | 'medium' | 'ultra'
  users: WorkspaceUser[]
  domains: WorkspaceDomain[]
  created_at: string
}

/**
 * Snake-case payload accepted by PATCH /api/v1/workspace for the widget
 * "Aparência" tab. Sent as flat keys (no `widget:` envelope) because the
 * Rails controller permits them at the top level of `workspace_params`.
 */
export interface WidgetUpdatePayload {
  brand_color?: string
  default_locale?: WidgetLocale
  rating_icon_preset?: WidgetStarShape
  widget_default_layout?: WidgetLayout
  widget_star_color?: string
  widget_show_qa?: boolean
  widget_show_write_review?: boolean
  widget_per_page?: number
  widget_custom_css?: string
}

export interface WorkspaceStats {
  total_reviews: number
  total_reviews_delta: number
  avg_rating: number
  avg_rating_delta: number
  pending_moderation: number
  pending_moderation_delta: number
  reviews_this_month: number
  reviews_this_month_delta: number
  reviews_over_time: { date: string; count: number }[]
  rating_distribution: { rating: number; count: number }[]
}

// ─── Product ──────────────────────────────────────────────────────────────────

export interface Product {
  id: string
  workspace_id: string
  external_id: string | null
  name: string
  slug: string
  image_url: string | null
  price: number | null
  currency: string
  review_count: number
  avg_rating: number | null
  source: string
  product_group_id: string | null
  created_at: string
  updated_at: string
}

// ─── Questions & Q&A Groups ───────────────────────────────────────────────────

export type QuestionStatus = 'pending' | 'published' | 'rejected'

export interface Question {
  id: string
  product_id: string | null
  question_group_id: string | null
  author_name: string | null
  body: string
  answer: string | null
  answered_at: string | null
  helpful_count: number
  status: QuestionStatus
  created_at: string
  updated_at: string
}

export interface QuestionGroup {
  id: string
  name: string
  description: string | null
  products_count: number
  questions_count: number
  created_at: string
  updated_at: string
  products?: Array<{
    id: string
    title: string
    handle: string | null
    image_url: string | null
  }>
}

// ─── Product Group ────────────────────────────────────────────────────────────
// Mirrors Judge.me "Groups": one canonical entity that aggregates reviews
// across N storefront SKUs (e.g. 8 variations of "Colorizze" all sharing
// the same review pool).
export interface ProductGroup {
  id: string
  name: string
  slug: string
  description: string | null
  primary_product_id: string | null
  products_count: number
  reviews_count: number
  avg_rating: number | null
  created_at: string
  updated_at: string
  products?: Array<{
    id: string
    title: string
    handle: string | null
    image_url: string | null
    platform_product_id: string | null
  }>
}

// ─── Campaign ─────────────────────────────────────────────────────────────────

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'archived' | 'completed'
export type CampaignType = 'email' | 'sms' | 'whatsapp'
export type CampaignTriggerEvent =
  | 'order_completed'
  | 'order_delivered'
  | 'order_paid'
  | 'order_refunded'

/**
 * Email-first campaign shape. Older shape (subject/body/type/trigger) kept as
 * optional for backwards compatibility with the legacy list view; new fields
 * are authoritative for the post-purchase email automation flow.
 */
export interface Campaign {
  id: string
  workspace_id: string
  name: string
  status: CampaignStatus

  // Triggering + scheduling
  trigger_events: CampaignTriggerEvent[]
  trigger_after_minutes: number

  // From / reply-to
  from_name: string
  from_email: string
  reply_to: string | null

  // Email content
  subject_template: string
  html_template: string

  // Aggregates
  sent_count: number
  open_count: number
  click_count: number
  review_count: number

  created_at: string
  updated_at: string

  // ── Legacy fields (optional — kept so older callers still type-check) ──
  type?: CampaignType
  subject?: string | null
  body?: string
  trigger?: 'manual' | 'post_purchase' | 'scheduled'
}

export type CampaignSendStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'complained'
  | 'converted'

export interface CampaignSend {
  id: string
  campaign_id: string
  recipient_email: string
  recipient_name: string | null
  status: CampaignSendStatus
  sent_at: string | null
  opened_at: string | null
  clicked_at: string | null
  bounced_at: string | null
  external_order_id: string | null
  opened_count: number
  clicked_count: number
  last_event_at: string | null
  created_at: string
}

export interface CampaignStats {
  sent: number
  delivered: number
  opened: number
  clicked: number
  converted: number
  delivered_rate: number
  open_rate: number
  click_rate: number
  conversion_rate: number
}

export interface CampaignInput {
  name: string
  status?: CampaignStatus
  trigger_events: CampaignTriggerEvent[]
  trigger_after_minutes: number
  from_name?: string
  from_email?: string
  reply_to?: string | null
  subject_template: string
  html_template: string
}

// ─── Integrations ─────────────────────────────────────────────────────────────

export interface WooCommerceConfig {
  store_url: string
  consumer_key: string
  consumer_secret: string
  sync_products: boolean
  sync_reviews: boolean
  auto_sync_interval: number
  connected: boolean
  last_sync_at: string | null
  product_count: number | null
  review_count: number | null
  webhooks?: {
    registered_count: number
    registered_at: string | null
    topics: string[]
  }
}

/**
 * Result returned by the inline mode of `/products/sync` and
 * `/integrations/woocommerce/sync_products?inline=true`. Lets the admin
 * render an honest "synced N, failed K" toast right after the click
 * instead of "enqueued" and forcing the merchant to refresh and guess.
 */
export interface WcSyncResult {
  ok: boolean
  pages_fetched?: number
  total_fetched?: number
  synced: number
  failed: number
  errors?: Array<{ id?: number | string; name?: string | null; error: string }>
  sample_after?: Array<[string, string | null]>
  /** Set when the sync bailed before iterating products (auth/connection). */
  stage?: 'auth' | 'connection' | 'fatal'
  error?: string
}

// ─── UniverCampus ─────────────────────────────────────────────────────────────

export interface UnivercampusSchool {
  id: string
  slug: string
  nome: string
  url: string
  /** Cursos ativos sincronizados desta escola (só no GET da conexão). */
  course_count?: number
}

export interface UnivercampusOwner {
  id?: string
  nome?: string
  email?: string
}

/** GET /integrations/univercampus. O token nunca vem na resposta. */
export interface UnivercampusConfig {
  connected: boolean
  base_url: string
  status?: 'active' | 'invalid'
  token_prefix?: string | null
  schools?: UnivercampusSchool[]
  owner?: UnivercampusOwner
  verified_at?: string | null
  last_synced_at?: string | null
  last_pushed_at?: string | null
  last_error?: string | null
  course_count?: number
  review_count?: number
}

export interface UnivercampusTestResult {
  success: boolean
  message: string
  owner?: UnivercampusOwner
  schools?: UnivercampusSchool[]
}

/** POST /integrations/univercampus/sync?inline=true */
export interface UnivercampusSyncResult {
  ok: boolean
  total_fetched?: number
  synced: number
  failed: number
  deactivated?: number
  errors?: Array<{ id?: string; titulo?: string | null; error: string }>
  stage?: 'auth' | 'connection'
  error?: string
}

// ─── Catalog Health ───────────────────────────────────────────────────────────

export interface CatalogHealth {
  health_score: number
  total_products: number
  products_with_reviews: number
  products_without_reviews: number
  avg_reviews_per_product: number
  products_below_threshold: number
}

export interface CatalogHealthByProduct {
  product_id: string
  product_name: string
  review_count: number
  avg_rating: number | null
  health_score: number
}

// ─── API Helpers ──────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[]
  meta: {
    current_page: number
    per_page: number
    total_count: number
    total_pages: number
  }
}

export interface ApiKey {
  id: string
  name: string
  prefix: string
  created_at: string
  last_used_at: string | null
  expires_at: string | null
}

// ─── AI Summary Topics ───────────────────────────────────────────────────────

export interface AiSummaryTopic {
  id: string
  product_id: string
  title: string
  position: number
  source: 'manual' | 'ai'
  review_count: number
  stars_avg: number | string | null
  ai_summary: string | null
  generated_at: string | null
  created_at: string
  updated_at: string
  reviews?: Array<{
    id: string
    rating: number
    title: string | null
    body: string
    author_name: string | null
    created_at: string
  }>
}

export interface AiSummaryProductRow {
  id: string
  title: string
  handle: string | null
  image_url: string | null
  approved_reviews: number
  topic_count: number
  last_generated_at: string | null
  has_ai_topic: boolean
  status: 'insufficient' | 'pending' | 'generated'
}

// ─── Reward Rules & Grants ────────────────────────────────────────────────────
// Backed by Rails models RewardRule + RewardGrant. Fields mirror the
// permit-list in apps/api/app/controllers/api/v1/reward_rules_controller.rb.

export type RewardType = 'coupon' | 'points' | 'cashback' | 'gift'
export type RewardTriggerEvent = 'review_approved' | 'review_with_photo' | 'review_with_video' | 'review_long'

export interface RewardRule {
  id: string
  name: string
  active: boolean
  trigger_event: RewardTriggerEvent
  min_body_length: number | null
  require_purchase: boolean
  reward_type: RewardType
  reward_amount: number | null
  reward_currency: string | null
  coupon_template: string | null
  bonus_with_photo_pct: number | null
  bonus_with_video_pct: number | null
  bonus_long_review_pct: number | null
  max_per_customer_per_product: number | null
  max_per_customer_per_month: number | null
  max_total_grants: number | null
  starts_at: string | null
  ends_at: string | null
  created_at: string
  updated_at: string
}

export type RewardRulePayload = Partial<Omit<RewardRule, 'id' | 'created_at' | 'updated_at'>>

export interface RewardGrant {
  id: string
  rule_id: string
  review_id: string | null
  customer_email: string | null
  customer_name: string | null
  status: 'issued' | 'redeemed' | 'revoked' | 'expired'
  coupon_code: string | null
  amount: number | null
  currency: string | null
  created_at: string
  redeemed_at: string | null
}

// ─── Super admin (founder-only) ───────────────────────────────────────────────
// Mirrors the JSON payload from Api::V1::SuperAdmin::* controllers. The
// `plan` field is the DB slug (free/starter/pro/enterprise); `plan_label`
// is the product-facing name (free/entry/medium/ultra).

export type SuperAdminPlan = 'entry' | 'medium' | 'ultra' | 'free'
export type SuperAdminStatus = 'active' | 'trial' | 'suspended' | 'cancelled'

export interface SuperAdminWorkspaceRow {
  id: string
  slug: string
  name: string
  plan: 'entry' | 'medium' | 'ultra'
  plan_label: SuperAdminPlan
  status: SuperAdminStatus
  brand_color: string | null
  /** Monthly recurring revenue in BRL (R$). Source of truth for the
   *  founder dashboard's MRR aggregations. */
  mrr_brl: number
  currency: 'BRL'
  /** Explicit per-workspace seat cap override. NULL = use plan default. */
  seat_limit: number | null
  /** Computed seat cap: override OR plan default. NULL = unlimited. */
  effective_seat_limit: number | null
  created_at: string | null
  last_active_at: string | null
  owner_email: string | null
  users_count: number
}

export interface SuperAdminWorkspaceDetail extends SuperAdminWorkspaceRow {
  reviews_count: number
  products_count: number
  /** Whether adding one more member would bust the cap. */
  seat_limit_reached: boolean
  /** AI spend is kept in USD because Anthropic bills us in USD. The
   *  dashboard converts at display time only. */
  ai_cost_month_usd: number
  ai_cost_lifetime_usd: number
  workspace_users: SuperAdminWorkspaceMember[]
}

export interface SuperAdminWorkspaceMember {
  id: string
  email: string
  name: string
  role: 'owner' | 'admin' | 'editor' | 'moderator' | 'viewer'
  better_auth_user_id: string | null
  last_login_at: string | null
  created_at: string | null
}

/** Standalone member type so the new super_admin/members API doesn't
 *  pretend to carry workspace-level context. Same shape as
 *  SuperAdminWorkspaceMember but kept distinct so future divergence
 *  doesn't require a cross-cutting rename. */
export type SuperAdminMember = SuperAdminWorkspaceMember

export interface SuperAdminWorkspaceListMeta {
  total_workspaces: number
  active_workspaces: number
  trial_workspaces: number
  suspended_workspaces: number
  cancelled_workspaces: number
  mrr_estimate_brl: number
  ai_cost_month_usd: number
  currency: 'BRL'
}

export interface SuperAdminUser {
  id: string
  email: string
  name: string
  role: 'admin' | 'user' | null
  banned: boolean
  created_at: string | null
  memberships: Array<{
    workspace_id: string
    workspace_slug: string | null
    workspace_name: string | null
    role: string
    created_at: string | null
  }>
}

export interface SuperAdminAuditLog {
  id: string
  action: string
  entity_type: string | null
  entity_id: string | null
  metadata: Record<string, unknown> | null
  actor: { id: string | null; email: string; name: string | null } | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

export interface SuperAdminImpersonatePayload {
  user_id: string
  email: string
  endpoint: string
  redirect_to: string
}
