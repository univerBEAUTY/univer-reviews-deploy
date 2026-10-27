import type {
  Review,
  ReviewListParams,
  ReviewStatus,
  BulkAction,
  CreateReviewInput,
  AiModerateResult,
  AiHealth,
  AiSimilarReview,
  GenerateVariantsInput,
  ReviewVariant,
  DuplicateCluster,
  Workspace,
  WorkspaceStats,
  WorkspaceUser,
  WooCommerceConfig,
  CatalogHealth,
  CatalogHealthByProduct,
  Product,
  Campaign,
  CampaignInput,
  CampaignSend,
  CampaignSendStatus,
  CampaignStatus,
  PaginatedResponse,
  ApiKey,
  Question,
  QuestionStatus,
  QuestionGroup,
  ProductGroup,
  RewardRule,
  RewardRulePayload,
  RewardGrant,
  AiSummaryTopic,
  AiSummaryProductRow,
  WcSyncResult,
  UnivercampusConfig,
  UnivercampusSyncResult,
  UnivercampusTestResult,
  SuperAdminWorkspaceRow,
  SuperAdminWorkspaceDetail,
  SuperAdminWorkspaceListMeta,
  SuperAdminUser,
  SuperAdminMember,
  SuperAdminAuditLog,
  SuperAdminImpersonatePayload,
  SuperAdminPlan,
  SuperAdminStatus,
} from '@/types'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public issues?: string[]
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  private async request<T>(
    path: string,
    options: RequestInit & { params?: Record<string, string | number | boolean | undefined> } = {},
    token?: string
  ): Promise<T> {
    const { params, ...fetchOptions } = options

    let url = `${this.baseUrl}/api/v1${path}`
    if (params) {
      const searchParams = new URLSearchParams()
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          searchParams.set(k, String(v))
        }
      })
      if (searchParams.toString()) url += `?${searchParams}`
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(fetchOptions.headers as Record<string, string>),
    }

    // Pass session token explicitly as Bearer when caller has it (SSR / typed calls).
    // Cookies are also sent via credentials: 'include' so the Rails backend can look
    // up the Better Auth session cookie even without an explicit token.
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    // Workspace hint header. Rails uses this to bind the request to the
    // workspace the user is currently looking at, instead of picking
    // arbitrarily when the Better Auth session doesn't carry an
    // active_organization_id. Read from the URL path because the admin
    // routes under /:workspace_slug/...
    if (typeof window !== 'undefined') {
      const slug = window.location.pathname.split('/').filter(Boolean)[0]
      // 'super' is the founder ops surface — cross-tenant by design, MUST NOT
      // carry a single workspace hint or the API would try to bind every
      // super-admin request to the literal slug "super" (which doesn't exist).
      if (slug && !['login', 'invite', 'auth', 'api', '_next', 'super'].includes(slug)) {
        headers['X-Univer-Workspace-Slug'] = slug
      }
    }

    const res = await fetch(url, {
      ...fetchOptions,
      headers,
      credentials: 'include',
      cache: 'no-store',
    })

    if (!res.ok) {
      const error = await res
        .json()
        .catch(() => ({ error: 'unknown', message: res.statusText }))

      // 402 Payment Required — backend signals one of two paywall states:
      //   `feature_locked`         → user's plan doesn't include the feature
      //   `ai_cost_cap_reached`    → workspace burned through its monthly USD cap
      //
      // We dispatch a global window event so the PaywallProvider mounted at
      // root layout can pop the modal regardless of which page / mutation
      // triggered the call. We also still throw ApiError so the calling
      // mutation/query's onError fires — the modal is purely an
      // augmentation, callers may still want to log, reset state, etc.
      if (res.status === 402 && typeof window !== 'undefined') {
        try {
          window.dispatchEvent(new CustomEvent('paywall', { detail: error }))
        } catch {
          // SSR guard already handled; defensive against environments where
          // CustomEvent constructor isn't available (older Edge / very stripped
          // jsdom). Failing to surface the modal is non-fatal — the toast
          // path via onError still fires.
        }
      }

      throw new ApiError(res.status, error.message || error.error, error.issues)
    }

    if (res.status === 204) return {} as T
    return res.json()
  }

  // ─── Reviews ────────────────────────────────────────────────────────────────
  reviews = {
    list: (params: ReviewListParams, token: string) =>
      this.request<PaginatedResponse<Review>>(
        '/reviews',
        { params: params as Record<string, string | number | boolean | undefined> },
        token
      ),
    get: (id: string, token: string) =>
      // show renders `{ data: serialize_review(..., full: true) }` — unwrap so
      // callers get the Review directly (the detail page crashed on the
      // `{ data }` wrapper: review.id was undefined → `.slice` on undefined).
      this.request<{ data: Review }>(`/reviews/${id}`, {}, token).then((r) => r.data),
    create: (data: CreateReviewInput, token: string) =>
      this.request<Review>(
        '/reviews',
        { method: 'POST', body: JSON.stringify(data) },
        token
      ),
    updateStatus: (id: string, status: ReviewStatus, token: string) =>
      this.request<Review>(
        `/reviews/${id}/status`,
        { method: 'POST', body: JSON.stringify({ status }) },
        token
      ),
    // Full edit (AI draft editor): rating, title, body, author fields,
    // gender, avatar, status. Publishing a draft = { status: 'approved' }.
    update: (
      id: string,
      data: Partial<{
        rating: number
        title: string
        body: string
        author_name: string
        author_gender: string
        author_avatar_url: string | null
        status: ReviewStatus
      }>,
      token: string,
    ) =>
      this.request<{ data: Review }>(
        `/reviews/${id}`,
        { method: 'PATCH', body: JSON.stringify({ review: data }) },
        token,
      ).then((r) => r.data),
    delete: (id: string, token: string) =>
      this.request(`/reviews/${id}`, { method: 'DELETE' }, token),
    bulk: (ids: string[], action: BulkAction, token: string) =>
      this.request(
        '/reviews/bulk',
        { method: 'POST', body: JSON.stringify({ ids, action }) },
        token
      ),

    /**
     * Stream the reviews matching `filters` as a CSV blob. Bypasses the JSON
     * request() helper because the backend returns text/csv — we need the raw
     * Response so we can hand a Blob to the browser for download. Filters
     * mirror reviews.list (status, rating, source, q, from, to).
     */
    exportCsv: async (
      filters: Pick<ReviewListParams, 'status' | 'rating' | 'source' | 'q' | 'from' | 'to'>,
      token: string,
    ): Promise<Blob> => {
      const search = new URLSearchParams()
      ;(Object.entries(filters) as Array<[string, string | number | undefined]>).forEach(
        ([k, v]) => {
          if (v !== undefined && v !== null && v !== '') {
            search.set(k, String(v))
          }
        },
      )
      const qs = search.toString()
      const url = `${this.baseUrl}/api/v1/reviews/export.csv${qs ? `?${qs}` : ''}`

      const res = await fetch(url, {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
        cache: 'no-store',
      })

      if (!res.ok) {
        const errBody = await res
          .json()
          .catch(() => ({ error: 'unknown', message: res.statusText }))
        if (res.status === 402 && typeof window !== 'undefined') {
          try {
            window.dispatchEvent(new CustomEvent('paywall', { detail: errBody }))
          } catch {
            /* see request<T> comment */
          }
        }
        throw new ApiError(res.status, errBody.message || errBody.error, errBody.issues)
      }

      return res.blob()
    },
  }

  // ─── AI ─────────────────────────────────────────────────────────────────────
  //
  // All Rails AI endpoints wrap their payload in `{ data: ... }`. The client
  // unwraps once so callers receive plain typed objects. Errors raise
  // ApiError; HTTP 503 + error="missing_api_key" specifically means the
  // server is missing ANTHROPIC_API_KEY — the AI Lab UI surfaces this as a
  // banner with a link to /settings#api-keys.
  ai = {
    health: (token: string) =>
      this.request<{ data: AiHealth }>('/ai/health', {}, token).then(r => r.data),

    moderate: (reviewId: string, token: string) =>
      this.request<{ data: AiModerateResult }>(
        '/ai/moderate',
        { method: 'POST', body: JSON.stringify({ review_id: reviewId }) },
        token
      ).then(r => r.data),

    /**
     * Enqueue AiModerateJob for every pending review in the workspace
     * (capped server-side at 500). Returns the number queued so the UI can
     * show "Moderação iniciada para N avaliações pendentes".
     */
    moderatePending: (token: string) =>
      this.request<{ queued: number; message: string }>(
        '/ai/moderate-pending',
        { method: 'POST' },
        token,
      ),

    /**
     * GET /audit_logs — workspace activity timeline.
     */
    auditLogs: (
      params: {
        page?: number
        per_page?: number
        action?: string
        user_id?: string
        entity_type?: string
        from?: string
        to?: string
      },
      token: string,
    ) =>
      this.request<{
        data: Array<{
          id: string
          action: string
          entity_type: string | null
          entity_id: string | null
          metadata: Record<string, unknown> | null
          actor: { id: string; email: string; name: string | null } | null
          ip_address: string | null
          user_agent: string | null
          created_at: string
        }>
        meta: { current_page: number; total_pages: number; total_count: number; per_page: number }
      }>('/audit_logs', { params: params as Record<string, string | number | undefined> }, token),

    auditActions: (token: string) =>
      this.request<{ data: string[] }>('/audit_logs/actions', {}, token).then(r => r.data),

    /**
     * GET /ai/cost-report — per-workspace AI consumption window.
     * Powers the AI Lab "consumo" chart + dashboard cost gauge.
     */
    costReport: (token: string, days = 30) =>
      this.request<{
        data: {
          window_days: number
          total_cost: number
          total_jobs: number
          total_tokens: number
          failed_count: number
          month_cost: number
          plan_cap_monthly_usd: number | null
          daily: Array<{ date: string; cost_usd: number; jobs: number }>
          by_type: Array<{ job_type: string; cost_usd: number; jobs: number }>
        }
      }>(`/ai/cost-report?days=${days}`, {}, token).then(r => r.data),

    /**
     * Run topic extraction for a single product. Default `mode="replace"`
     * wipes existing AI topics and seeds 1 new one. `mode="append"` adds
     * one more on top of the existing set, telling Claude which titles to
     * skip so it doesn't duplicate. Returns 409 limit_reached when the
     * product already has 5 AI topics.
     */
    generateSummaryTopics: (
      productId: string,
      token: string,
      opts: { mode?: 'replace' | 'append' } = {},
    ) =>
      this.request<{
        message: string
        product_id: string
        mode?: 'replace' | 'append'
        count?: number
        ai_count?: number
        ai_added?: number
        ai_limit?: number
        eligible_reviews?: number
        /**
         * Set when the generation was a no-op so the UI can warn instead
         * of falsely celebrating:
         *   - "no_eligible_reviews": product has zero reviews with body ≥40 chars
         *   - "ai_returned_empty":   reviews exist but Claude returned no topics
         */
        reason?: 'no_eligible_reviews' | 'ai_returned_empty' | null
        data?: Array<{
          id: string
          title: string
          source: 'ai' | 'manual'
          review_count: number
          stars_avg: number | null
          ai_summary: string | null
          generated_at: string | null
          position: number
        }>
      }>(
        '/ai/generate-summary-topics',
        {
          method: 'POST',
          body: JSON.stringify({
            product_id: productId,
            mode: opts.mode ?? 'replace',
          }),
        },
        token,
      ),

    /**
     * Enqueue topic extraction in bulk. When productIds is omitted, the
     * backend selects every product with at least MIN_REVIEWS_FOR_BULK
     * approved reviews — the "Gerar para todos" button on the dashboard.
     */
    generateSummaryTopicsBulk: (productIds: string[] | undefined, token: string) =>
      this.request<{ message: string; queued: number }>(
        '/ai/generate-summary-topics-bulk',
        {
          method: 'POST',
          body: JSON.stringify(productIds ? { product_ids: productIds } : {}),
        },
        token,
      ),

    /**
     * Dashboard list — every product with its summary status.
     */
    summariesIndex: (token: string) =>
      this.request<{ data: AiSummaryProductRow[] }>(
        '/ai_summaries',
        {},
        token,
      ),

    /**
     * Generate variants seeded by an existing review's body. The backend
     * route /ai/generate-variants requires a real review_id so the prompt
     * can use the product context — pass the review you want to vary.
     */
    generateFromReview: (reviewId: string, count: number, token: string) =>
      this.request<{ data: ReviewVariant[] }>(
        '/ai/generate-variants',
        {
          method: 'POST',
          body: JSON.stringify({ review_id: reviewId, count }),
        },
        token
      ).then(r => ({ variants: r.data })),

    /**
     * Free-form generation from a written template + optional product. Maps
     * 1:1 to POST /ai/generate.
     */
    generateVariants: (input: GenerateVariantsInput, token: string) =>
      this.request<{ data: ReviewVariant[] }>(
        '/ai/generate',
        {
          method: 'POST',
          body: JSON.stringify({
            template: input.template ?? `${input.product_name} — ${input.tone}, ${input.rating}/5`,
            count: input.count,
          }),
        },
        token
      ).then(r => ({ variants: r.data })),

    reply: (reviewId: string, token: string) =>
      this.request<{ data: { reply: string } }>(
        '/ai/reply',
        { method: 'POST', body: JSON.stringify({ review_id: reviewId }) },
        token
      ).then(r => r.data),

    autoReply: (reviewId: string, _tone: string, token: string) =>
      this.request<{ data: { reply: string; reply_id?: string } }>(
        '/ai/auto-reply',
        { method: 'POST', body: JSON.stringify({ review_id: reviewId }) },
        token
      ).then(r => r.data),

    dedup: (reviewId: string, token: string) =>
      this.request<{ message: string; review_id: string }>(
        '/ai/dedup',
        { method: 'POST', body: JSON.stringify({ review_id: reviewId }) },
        token
      ),

    embed: (reviewId: string, token: string) =>
      this.request<{ message: string; review_id: string }>(
        '/ai/embed',
        { method: 'POST', body: JSON.stringify({ review_id: reviewId }) },
        token
      ),

    findSimilar: (reviewId: string, token: string) =>
      this.request<{ data: AiSimilarReview[] }>(
        '/ai/find-similar',
        { method: 'POST', body: JSON.stringify({ review_id: reviewId }) },
        token
      ).then(r => r.data),

    duplicateClusters: (token: string) =>
      this.request<{ data: DuplicateCluster[] }>('/ai/duplicate-clusters', {}, token)
        .then(r => r.data),

    /**
     * Generate AND persist N AI reviews for a product. Returns the created
     * Review rows so the UI can preview them immediately.
     */
    bulkCreateReviews: (
      input: {
        product_id: string
        count: number
        language?: string
        tone?: string
        status?: 'pending' | 'approved'
        date_spread_days?: number
      },
      token: string,
    ) =>
      this.request<{
        data: Array<{ id: string; rating: number; title: string | null; body: string; author_name: string; author_gender: string | null; author_avatar_url: string | null; status: string; created_at: string }>
        meta: { created: number; requested: number; product_id: string }
      }>(
        '/ai/bulk-create-reviews',
        { method: 'POST', body: JSON.stringify(input) },
        token,
      ),

    /**
     * Generate AND persist N AI Q&A pairs for a product.
     */
    bulkCreateQuestions: (
      input: {
        product_id: string
        count: number
        language?: string
        status?: 'pending' | 'published'
      },
      token: string,
    ) =>
      this.request<{
        data: Array<{ id: string; body: string; answer: string; author_name: string | null; author_gender: string | null; author_avatar_url: string | null; status: string }>
        meta: { created: number; requested: number; product_id: string }
      }>(
        '/ai/bulk-create-questions',
        { method: 'POST', body: JSON.stringify(input) },
        token,
      ),

    /**
     * Upload a custom author avatar for an AI draft (multipart). Bypasses
     * `request` because it forces JSON. Returns the public proxy URL.
     */
    uploadAuthorPhoto: async (file: File, token: string): Promise<{ url: string }> => {
      const form = new FormData()
      form.append('file', file)

      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`
      if (typeof window !== 'undefined') {
        const slug = window.location.pathname.split('/').filter(Boolean)[0]
        if (slug && !['login', 'invite', 'auth', 'api', '_next'].includes(slug)) {
          headers['X-Univer-Workspace-Slug'] = slug
        }
      }

      const res = await fetch(`${this.baseUrl}/api/v1/ai/upload-author-photo`, {
        method: 'POST',
        headers, // NO Content-Type — browser sets the multipart boundary
        body: form,
        credentials: 'include',
        cache: 'no-store',
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'unknown', message: res.statusText }))
        throw new ApiError(res.status, err.message || err.error, err.issues)
      }

      const json = (await res.json()) as { data: { url: string } }
      return json.data
    },

    /**
     * Fan out Q&A generation across EVERY active product in the workspace.
     * Each product gets a background job that fetches its WC details and
     * generates `count_per_product` pairs (default 10) via Claude. Returns
     * immediately — real work happens in Sidekiq.
     */
    bulkCreateQuestionsAll: (
      input: {
        count_per_product?: number
        status?: 'pending' | 'published'
        language?: string
      },
      token: string,
    ) =>
      this.request<{
        message: string
        meta: {
          products_queued: number
          count_per_product: number
          total_pairs_expected: number
          status: string
        }
      }>(
        '/ai/bulk-create-questions-all',
        { method: 'POST', body: JSON.stringify(input) },
        token,
      ),

    cleanupDuplicates: (clusterIds: string[], token: string) =>
      this.request<{ message: string }>(
        '/ai/cleanup-duplicates',
        { method: 'POST', body: JSON.stringify({ cluster_ids: clusterIds }) },
        token
      ),
  }

  // ─── Workspace ──────────────────────────────────────────────────────────────
  workspace = {
    // Backend wraps the workspace payload in { data: ... } — unwrap so callers
    // see a plain Workspace object (fixes settings page reading workspace.domains
    // as undefined because it was reaching into the envelope).
    get: (token: string) =>
      this.request<{ data: Workspace }>('/workspace', {}, token).then(r => r.data),
    update: (data: Partial<Workspace>, token: string) =>
      this.request<{ data: Workspace }>(
        '/workspace',
        { method: 'PATCH', body: JSON.stringify(data) },
        token
      ).then(r => r.data),
    // Backend wraps stats in { data: ... } just like /workspace — unwrap so
    // callers read fields off the bare WorkspaceStats object (fixes dashboard
    // and reviews-page stats cards rendering `undefined`).
    stats: (token: string) =>
      this.request<{ data: WorkspaceStats }>('/workspace/stats', {}, token).then(r => r.data),
    inviteUser: (email: string, role: string, token: string) =>
      this.request<WorkspaceUser>(
        '/workspace/invitations',
        { method: 'POST', body: JSON.stringify({ email, role }) },
        token
      ),
    removeUser: (userId: string, token: string) =>
      this.request(`/workspace/users/${userId}`, { method: 'DELETE' }, token),
    createApiKey: (name: string, token: string) =>
      this.request<{ data: ApiKey; key: string }>(
        '/workspace/api_keys',
        { method: 'POST', body: JSON.stringify({ name, scopes: 'read,write' }) },
        token
      ),
    listApiKeys: (token: string) =>
      this.request<{ data: ApiKey[] }>('/workspace/api_keys', {}, token),
    revokeApiKey: (keyId: string, token: string) =>
      this.request(`/workspace/api_keys/${keyId}`, { method: 'DELETE' }, token),
    addDomain: (domain: string, token: string, platform: 'woocommerce' | 'shopify' | 'generic' = 'generic') =>
      this.request<{ data: { id: string; domain: string; platform: string; verified: boolean } }>(
        '/workspace/domains',
        { method: 'POST', body: JSON.stringify({ domain, platform }) },
        token
      ),
    /**
     * Removes a workspace domain by its row id (preferred). Backend also
     * accepts the raw domain string as a fallback identifier.
     */
    removeDomain: (idOrDomain: string, token: string) =>
      this.request(
        `/workspace/domains/${encodeURIComponent(idOrDomain)}`,
        { method: 'DELETE' },
        token
      ),

    /**
     * Upload a custom rating-star icon (SVG or PNG, ≤500KB). On success the
     * workspace `rating_icon_filled` is set to the public asset URL and the
     * widget will mask + tint it with `widget_star_color` in place of the
     * preset star shape. Returns the new URL so the caller can update its
     * local state without refetching the whole workspace.
     *
     * Sends FormData multipart, bypasses `request` because `request` forces
     * Content-Type: application/json.
     */
    uploadRatingIcon: async (file: File, token: string) => {
      const form = new FormData()
      form.append('file', file)

      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`
      if (typeof window !== 'undefined') {
        const slug = window.location.pathname.split('/').filter(Boolean)[0]
        if (slug && !['login', 'invite', 'auth', 'api', '_next'].includes(slug)) {
          headers['X-Univer-Workspace-Slug'] = slug
        }
      }

      const res = await fetch(`${this.baseUrl}/api/v1/workspace/brand-assets/rating-icon`, {
        method: 'POST',
        headers, // intentionally NO Content-Type — browser sets multipart boundary
        body: form,
        credentials: 'include',
        cache: 'no-store',
      })

      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ error: 'unknown', message: res.statusText }))
        // Mirror the JSON-request paywall dispatch for the bypass paths
        // (multipart upload, CSV export) so the modal also pops for
        // image-upload-style endpoints if they ever gate behind a feature.
        if (res.status === 402 && typeof window !== 'undefined') {
          try {
            window.dispatchEvent(new CustomEvent('paywall', { detail: err }))
          } catch {
            /* see request<T> comment */
          }
        }
        throw new ApiError(res.status, err.message || err.error, err.issues)
      }

      const json = (await res.json()) as { data: { rating_icon_url: string } }
      return json.data
    },

    removeRatingIcon: (token: string) =>
      this.request<{ data: { rating_icon_url: null } }>(
        '/workspace/brand-assets/rating-icon',
        { method: 'DELETE' },
        token,
      ).then(r => r.data),
  }

  // ─── Integrations ───────────────────────────────────────────────────────────
  integrations = {
    woocommerce: {
      get: (token: string) =>
        this.request<WooCommerceConfig>('/integrations/woocommerce', {}, token),
      save: (data: Partial<WooCommerceConfig>, token: string) =>
        this.request<
          WooCommerceConfig & {
            probe?: {
              success: boolean
              error?: string
              store_name?: string
              wc_version?: string
              wp_version?: string
            }
          }
        >(
          '/integrations/woocommerce',
          { method: 'POST', body: JSON.stringify(data) },
          token
        ),
      test: (
        creds: { store_url?: string; consumer_key?: string; consumer_secret?: string },
        token: string
      ) =>
        this.request<{ success: boolean; message: string; store_name?: string }>(
          '/integrations/woocommerce/test',
          { method: 'POST', body: JSON.stringify(creds) },
          token
        ),
      syncProducts: (token: string, opts?: { inline?: boolean }) =>
        this.request<WcSyncResult | { message: string }>(
          '/integrations/woocommerce/sync_products',
          {
            method: 'POST',
            params: opts?.inline ? { inline: 'true' } : undefined,
          },
          token
        ),
      syncReviews: (token: string) =>
        this.request<{ import_id: string; message: string }>(
          '/integrations/woocommerce/sync_reviews',
          { method: 'POST' },
          token
        ),
      disconnect: (token: string) =>
        this.request('/integrations/woocommerce', { method: 'DELETE' }, token),
    },
    univercampus: {
      get: (token: string) =>
        this.request<UnivercampusConfig>('/integrations/univercampus', {}, token),
      // api_token vazio/ausente mantém o token já salvo (troca só a URL).
      save: (data: { base_url?: string; api_token?: string }, token: string) =>
        this.request<UnivercampusConfig & { probe?: { success: boolean; error?: string } }>(
          '/integrations/univercampus',
          { method: 'POST', body: JSON.stringify(data) },
          token
        ),
      test: (data: { base_url?: string; api_token?: string }, token: string) =>
        this.request<UnivercampusTestResult>(
          '/integrations/univercampus/test',
          { method: 'POST', body: JSON.stringify(data) },
          token
        ),
      sync: (token: string, opts?: { inline?: boolean }) =>
        this.request<UnivercampusSyncResult | { message: string }>(
          '/integrations/univercampus/sync',
          {
            method: 'POST',
            params: opts?.inline ? { inline: 'true' } : undefined,
          },
          token
        ),
      pushAll: (token: string) =>
        this.request<{ message: string; count: number }>(
          '/integrations/univercampus/push_all',
          { method: 'POST' },
          token
        ),
      disconnect: (token: string) =>
        this.request('/integrations/univercampus', { method: 'DELETE' }, token),
    },
  }

  // ─── Auth ────────────────────────────────────────────────────────────────────
  auth = {
    magicLink: (email: string) =>
      this.request('/auth/magic-link', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
    verify: (token: string) =>
      this.request<{ token: string; user: WorkspaceUser }>(
        `/auth/verify?token=${token}`,
        {}
      ),
    logout: (token: string) =>
      this.request('/auth/logout', { method: 'DELETE' }, token),
  }

  // ─── Catalog Health ─────────────────────────────────────────────────────────
  catalogHealth = {
    get: (token: string) =>
      this.request<CatalogHealth>('/catalog-health', {}, token),
    byProduct: (token: string) =>
      this.request<CatalogHealthByProduct[]>(
        '/catalog-health/by-product',
        {},
        token
      ),
  }

  // ─── Products ───────────────────────────────────────────────────────────────
  products = {
    list: (params: Record<string, string | number | boolean | undefined>, token: string) =>
      this.request<PaginatedResponse<Product>>('/products', { params }, token),
    sync: (token: string, opts?: { inline?: boolean }) =>
      this.request<WcSyncResult | { message: string }>(
        '/products/sync',
        {
          method: 'POST',
          params: opts?.inline ? { inline: 'true' } : undefined,
        },
        token
      ),
  }

  // ─── Questions ──────────────────────────────────────────────────────────────
  questions = {
    list: (
      params: {
        page?: number
        per_page?: number
        status?: QuestionStatus | ''
        product_id?: string
        question_group_id?: string
      } = {},
      token: string,
    ) =>
      this.request<PaginatedResponse<Question>>(
        '/questions',
        { params: params as Record<string, string | number | boolean | undefined> },
        token,
      ),
    answer: (id: string, answer: string, token: string) =>
      this.request<{ data: Question }>(
        `/questions/${id}`,
        { method: 'PATCH', body: JSON.stringify({ question: { answer } }) },
        token,
      ),
    updateStatus: (id: string, status: QuestionStatus, token: string) =>
      this.request<{ data: Question }>(
        `/questions/${id}`,
        { method: 'PATCH', body: JSON.stringify({ question: { status } }) },
        token,
      ),
    // Full edit (AI draft editor): question body, answer, author name/gender,
    // avatar, status. Sends content fields so the backend takes the
    // full-edit path (no auto-publish). Publishing = { status: 'published' }.
    update: (
      id: string,
      data: Partial<{
        body: string
        answer: string
        author_name: string
        author_gender: string
        author_avatar_url: string | null
        status: QuestionStatus
      }>,
      token: string,
    ) =>
      this.request<{ data: Question }>(
        `/questions/${id}`,
        { method: 'PATCH', body: JSON.stringify({ question: data }) },
        token,
      ).then((r) => r.data),
    delete: (id: string, token: string) =>
      this.request(`/questions/${id}`, { method: 'DELETE' }, token),
  }

  // ─── Question Groups ────────────────────────────────────────────────────────
  questionGroups = {
    list: (params: { page?: number; per_page?: number; q?: string } = {}, token: string) =>
      this.request<PaginatedResponse<QuestionGroup>>(
        '/question_groups',
        { params: params as Record<string, string | number | boolean | undefined> },
        token,
      ),
    get: (id: string, token: string) =>
      this.request<{ data: QuestionGroup }>(`/question_groups/${id}`, {}, token).then((r) => r.data),
    create: (
      data: { name: string; description?: string; product_ids?: string[] },
      token: string,
    ) =>
      this.request<{ data: QuestionGroup }>(
        '/question_groups',
        {
          method: 'POST',
          body: JSON.stringify({
            question_group: { name: data.name, description: data.description },
            product_ids: data.product_ids,
          }),
        },
        token,
      ).then((r) => r.data),
    update: (
      id: string,
      data: { name?: string; description?: string },
      token: string,
    ) =>
      this.request<{ data: QuestionGroup }>(
        `/question_groups/${id}`,
        { method: 'PATCH', body: JSON.stringify({ question_group: data }) },
        token,
      ).then((r) => r.data),
    delete: (id: string, token: string) =>
      this.request(`/question_groups/${id}`, { method: 'DELETE' }, token),
    attachProducts: (id: string, productIds: string[], token: string) =>
      this.request<{ data: QuestionGroup; attached: number }>(
        `/question_groups/${id}/attach_products`,
        { method: 'POST', body: JSON.stringify({ product_ids: productIds }) },
        token,
      ),
    detachProducts: (id: string, productIds: string[], token: string) =>
      this.request<{ data: QuestionGroup; detached: number }>(
        `/question_groups/${id}/detach_products`,
        { method: 'POST', body: JSON.stringify({ product_ids: productIds }) },
        token,
      ),
  }

  // ─── Product Groups ─────────────────────────────────────────────────────────
  // Share reviews across product variations (Judge.me-style). The SaaS picks
  // up the grouping at every public endpoint (reviews/summary/videos) so
  // changing membership is the only knob the merchant has to touch.
  productGroups = {
    list: (params: { page?: number; per_page?: number; q?: string } = {}, token: string) =>
      this.request<PaginatedResponse<ProductGroup>>(
        '/product_groups',
        { params: params as Record<string, string | number | boolean | undefined> },
        token,
      ),
    get: (id: string, token: string) =>
      this.request<{ data: ProductGroup }>(`/product_groups/${id}`, {}, token).then((r) => r.data),
    create: (
      data: { name: string; slug?: string; description?: string; primary_product_id?: string; product_ids?: string[] },
      token: string,
    ) =>
      this.request<{ data: ProductGroup }>(
        '/product_groups',
        {
          method: 'POST',
          body: JSON.stringify({
            product_group: {
              name: data.name,
              slug: data.slug,
              description: data.description,
              primary_product_id: data.primary_product_id,
            },
            product_ids: data.product_ids,
          }),
        },
        token,
      ).then((r) => r.data),
    update: (
      id: string,
      data: { name?: string; slug?: string; description?: string; primary_product_id?: string | null },
      token: string,
    ) =>
      this.request<{ data: ProductGroup }>(
        `/product_groups/${id}`,
        { method: 'PATCH', body: JSON.stringify({ product_group: data }) },
        token,
      ).then((r) => r.data),
    delete: (id: string, token: string) =>
      this.request(`/product_groups/${id}`, { method: 'DELETE' }, token),
    attachProducts: (id: string, productIds: string[], token: string) =>
      this.request<{ data: ProductGroup; attached: number }>(
        `/product_groups/${id}/attach_products`,
        { method: 'POST', body: JSON.stringify({ product_ids: productIds }) },
        token,
      ),
    detachProducts: (id: string, productIds: string[], token: string) =>
      this.request<{ data: ProductGroup; detached: number }>(
        `/product_groups/${id}/detach_products`,
        { method: 'POST', body: JSON.stringify({ product_ids: productIds }) },
        token,
      ),
  }

  // ─── Campaigns ──────────────────────────────────────────────────────────────
  //
  // Post-purchase email automation. Rails wraps every payload in { data: ... }
  // — we unwrap once here so the React layer reads plain Campaign / CampaignSend
  // objects. Pagination uses the standard PaginatedResponse envelope.
  campaigns = {
    list: (
      params: { page?: number; per_page?: number; status?: CampaignStatus | '' } = {},
      token: string,
    ) =>
      this.request<PaginatedResponse<Campaign> | { data: Campaign[] }>(
        '/campaigns',
        { params: params as Record<string, string | number | boolean | undefined> },
        token,
      ).then((r) => {
        // Tolerate two backend shapes: paginated envelope OR plain { data: [] }
        if (Array.isArray((r as PaginatedResponse<Campaign>).data) && (r as PaginatedResponse<Campaign>).meta) {
          return r as PaginatedResponse<Campaign>
        }
        const list = (r as { data: Campaign[] }).data ?? []
        return {
          data: list,
          meta: {
            current_page: 1,
            per_page: list.length || 25,
            total_count: list.length,
            total_pages: 1,
          },
        } as PaginatedResponse<Campaign>
      }),

    get: (id: string, token: string) =>
      this.request<{ data: Campaign }>(`/campaigns/${id}`, {}, token).then((r) => r.data),

    create: (data: CampaignInput, token: string) =>
      this.request<{ data: Campaign }>(
        '/campaigns',
        { method: 'POST', body: JSON.stringify({ campaign: data }) },
        token,
      ).then((r) => r.data),

    update: (id: string, data: Partial<CampaignInput>, token: string) =>
      this.request<{ data: Campaign }>(
        `/campaigns/${id}`,
        { method: 'PATCH', body: JSON.stringify({ campaign: data }) },
        token,
      ).then((r) => r.data),

    remove: (id: string, token: string) =>
      this.request(`/campaigns/${id}`, { method: 'DELETE' }, token),

    sendNow: (id: string, token: string) =>
      this.request<{ data: Campaign }>(
        `/campaigns/${id}/send_now`,
        { method: 'POST' },
        token,
      ).then((r) => r.data),

    pause: (id: string, token: string) =>
      this.request<{ data: Campaign }>(
        `/campaigns/${id}/pause`,
        { method: 'POST' },
        token,
      ).then((r) => r.data),

    resume: (id: string, token: string) =>
      this.request<{ data: Campaign }>(
        `/campaigns/${id}/resume`,
        { method: 'POST' },
        token,
      ).then((r) => r.data),

    testSend: (id: string, payload: { recipient_email: string }, token: string) =>
      this.request<{ message?: string }>(
        `/campaigns/${id}/test_send`,
        { method: 'POST', body: JSON.stringify(payload) },
        token,
      ),
  }

  // ─── Campaign Sends ─────────────────────────────────────────────────────────
  campaignSends = {
    listByCampaign: (
      campaignId: string,
      params: { page?: number; per_page?: number; status?: CampaignSendStatus | '' } = {},
      token: string,
    ) =>
      this.request<PaginatedResponse<CampaignSend>>(
        `/campaigns/${campaignId}/sends`,
        { params: params as Record<string, string | number | boolean | undefined> },
        token,
      ),

    /**
     * Manual retry of a single send. Backend route not yet wired — the client
     * surfaces ApiError(404) so the UI can gracefully render "em breve".
     */
    resend: (sendId: string, token: string) =>
      this.request<{ data: CampaignSend }>(
        `/campaign_sends/${sendId}/resend`,
        { method: 'POST' },
        token,
      ).then((r) => r.data),
  }

  // ─── Email (workspace-level test send / domain status) ──────────────────────
  email = {
    testSend: (recipient_email: string, token: string) =>
      this.request<{ message?: string }>(
        '/email/test_send',
        { method: 'POST', body: JSON.stringify({ recipient_email }) },
        token,
      ),
    domainStatus: (token: string) =>
      this.request<{ data: { domain: string; verified: boolean } }>(
        '/email/domain_status',
        {},
        token,
      ).then((r) => r.data),
  }

  loyalty = {
    list: (token: string) =>
      this.request<{
        data: Array<{
          id: string
          source_campaign_id: number
          name: string
          description: string | null
          is_active: boolean
          rule_type: string
          points_text: number
          points_photo: number
          points_video: number
          base_points: number
          min_chars: number
          only_logged_in: boolean
          bonus_photo: number
          bonus_video: number
          bonus_verified: number
          priority: number
          synced_at: string | null
          updated_at: string | null
        }>
        meta: {
          count: number
          active_count: number
          last_synced_at: string | null
          plugin_connected: boolean
        }
      }>('/loyalty', {}, token),
  }

  // ─── AI Summary Topics ─────────────────────────────────────────────────────
  // CRUD for the per-product topical groupings that power the storefront
  // "Sumário de IA" carousel preset.
  aiSummaryTopics = {
    list: (productId: string, token: string) =>
      this.request<{ data: AiSummaryTopic[] }>(
        '/ai_summary_topics',
        { params: { product_id: productId } },
        token,
      ),

    get: (id: string, token: string) =>
      this.request<{ data: AiSummaryTopic }>(
        `/ai_summary_topics/${id}`,
        {},
        token,
      ).then(r => r.data),

    create: (
      data: { product_id: string; title: string; review_ids?: string[] },
      token: string,
    ) =>
      this.request<{ data: AiSummaryTopic }>(
        '/ai_summary_topics',
        { method: 'POST', body: JSON.stringify(data) },
        token,
      ).then(r => r.data),

    update: (
      id: string,
      data: { title?: string; position?: number; ai_summary?: string | null },
      token: string,
    ) =>
      this.request<{ data: AiSummaryTopic }>(
        `/ai_summary_topics/${id}`,
        { method: 'PATCH', body: JSON.stringify({ ai_summary_topic: data }) },
        token,
      ).then(r => r.data),

    delete: (id: string, token: string) =>
      this.request(`/ai_summary_topics/${id}`, { method: 'DELETE' }, token),

    attachReviews: (id: string, reviewIds: string[], token: string) =>
      this.request<{ data: AiSummaryTopic; attached: number }>(
        `/ai_summary_topics/${id}/attach_reviews`,
        { method: 'POST', body: JSON.stringify({ review_ids: reviewIds }) },
        token,
      ),

    detachReviews: (id: string, reviewIds: string[], token: string) =>
      this.request<{ data: AiSummaryTopic; detached: number }>(
        `/ai_summary_topics/${id}/detach_reviews`,
        { method: 'POST', body: JSON.stringify({ review_ids: reviewIds }) },
        token,
      ),
  }

  // ─── Billing ────────────────────────────────────────────────────────────────
  // Stripe-backed plan management. `createCheckout` returns a checkout URL the
  // UI should `window.location` to. `portal` returns a Stripe Billing Portal
  // URL where the merchant manages payment method / cancels / downloads invoices.
  billing = {
    get: (token: string) =>
      this.request<{
        data: {
          plan: 'entry' | 'medium' | 'ultra'
          status: string
          current_period_end: string | null
          cancel_at_period_end: boolean
          stripe_customer_id: string | null
        }
      }>('/billing', {}, token),

    // Every tier is paid post-T1.3, so create_checkout accepts the full
    // PLANS set rather than a "checkoutable" subset.
    createCheckout: (plan: 'entry' | 'medium' | 'ultra', token: string) =>
      this.request<{ data: { url: string } }>(
        '/billing/create_checkout',
        { method: 'POST', body: JSON.stringify({ plan }) },
        token,
      ).then(r => r.data),

    portal: (token: string) =>
      this.request<{ data: { url: string } }>(
        '/billing/portal',
        { method: 'POST' },
        token,
      ).then(r => r.data),
  }

  // ─── Reward rules ──────────────────────────────────────────────────────────
  // Merchants define what earns a reward (e.g. "review with photo") and what
  // gets granted (coupon / cashback / points / gift).
  rewardRules = {
    list: (params: { page?: number; per_page?: number } = {}, token: string) =>
      this.request<{ data: RewardRule[] }>(
        '/reward_rules',
        { params: params as Record<string, string | number | boolean | undefined> },
        token,
      ),
    get: (id: string, token: string) =>
      this.request<{ data: RewardRule }>(`/reward_rules/${id}`, {}, token).then(r => r.data),
    create: (data: RewardRulePayload, token: string) =>
      this.request<{ data: RewardRule }>(
        '/reward_rules',
        { method: 'POST', body: JSON.stringify({ reward_rule: data }) },
        token,
      ).then(r => r.data),
    update: (id: string, data: Partial<RewardRulePayload>, token: string) =>
      this.request<{ data: RewardRule }>(
        `/reward_rules/${id}`,
        { method: 'PATCH', body: JSON.stringify({ reward_rule: data }) },
        token,
      ).then(r => r.data),
    delete: (id: string, token: string) =>
      this.request(`/reward_rules/${id}`, { method: 'DELETE' }, token),
  }

  // ─── Reward grants ─────────────────────────────────────────────────────────
  // Read-only ledger of what was actually issued — coupon codes, points
  // credited, cashback amounts.
  rewardGrants = {
    list: (params: { page?: number; per_page?: number; rule_id?: string } = {}, token: string) =>
      this.request<PaginatedResponse<RewardGrant>>(
        '/reward_grants',
        { params: params as Record<string, string | number | boolean | undefined> },
        token,
      ),
    get: (id: string, token: string) =>
      this.request<{ data: RewardGrant }>(`/reward_grants/${id}`, {}, token).then(r => r.data),
  }

  // ─── Super admin (founder-only) ────────────────────────────────────────────
  // Cross-tenant ops endpoints. Auth gate lives server-side in
  // Api::V1::SuperAdmin::ApplicationController — a non-admin gets 404 from
  // every call here, NOT 401/403, so we never leak that the surface exists.
  superAdmin = {
    workspaces: {
      list: (
        params: {
          plan?: SuperAdminPlan | ''
          status?: SuperAdminStatus | ''
          q?: string
          sort?: 'mrr_desc' | 'last_active_desc' | 'signup_desc'
        } = {},
        token: string,
      ) =>
        this.request<{ data: SuperAdminWorkspaceRow[]; meta: SuperAdminWorkspaceListMeta }>(
          '/super_admin/workspaces',
          { params: params as Record<string, string | number | boolean | undefined> },
          token,
        ),

      get: (id: string, token: string) =>
        this.request<{ data: SuperAdminWorkspaceDetail }>(
          `/super_admin/workspaces/${id}`,
          {},
          token,
        ).then(r => r.data),

      suspend: (id: string, token: string) =>
        this.request<{ data: SuperAdminWorkspaceDetail }>(
          `/super_admin/workspaces/${id}/suspend`,
          { method: 'POST' },
          token,
        ).then(r => r.data),

      unsuspend: (id: string, token: string) =>
        this.request<{ data: SuperAdminWorkspaceDetail }>(
          `/super_admin/workspaces/${id}/unsuspend`,
          { method: 'POST' },
          token,
        ).then(r => r.data),

      switchPlan: (id: string, plan: SuperAdminPlan, token: string) =>
        this.request<{ data: SuperAdminWorkspaceDetail }>(
          `/super_admin/workspaces/${id}/switch_plan`,
          { method: 'POST', body: JSON.stringify({ plan }) },
          token,
        ).then(r => r.data),

      impersonate: (id: string, token: string) =>
        this.request<{ data: SuperAdminImpersonatePayload }>(
          `/super_admin/workspaces/${id}/impersonate`,
          { method: 'POST' },
          token,
        ).then(r => r.data),

      softDestroy: (id: string, token: string, opts: { force?: boolean } = {}) =>
        this.request<{ data: SuperAdminWorkspaceDetail }>(
          `/super_admin/workspaces/${id}/soft_destroy`,
          {
            method: 'DELETE',
            params: opts.force ? { force: '1' } : undefined,
          },
          token,
        ).then(r => r.data),

      audit: (
        id: string,
        params: { page?: number; per_page?: number; action?: string; scope?: 'super_admin' | '' } = {},
        token: string,
      ) =>
        this.request<{
          data: SuperAdminAuditLog[]
          meta: { current_page: number; total_pages: number; total_count: number; per_page: number }
        }>(
          `/super_admin/workspaces/${id}/audit_logs`,
          { params: params as Record<string, string | number | boolean | undefined> },
          token,
        ),

      cancelPlan: (id: string, token: string, opts: { reason?: string } = {}) =>
        this.request<{ data: SuperAdminWorkspaceDetail }>(
          `/super_admin/workspaces/${id}/cancel_plan`,
          { method: 'POST', body: JSON.stringify({ reason: opts.reason }) },
          token,
        ).then(r => r.data),

      setSeatLimit: (id: string, seatLimit: number | null, token: string) =>
        this.request<{ data: SuperAdminWorkspaceDetail }>(
          `/super_admin/workspaces/${id}/seat_limit`,
          {
            method: 'PATCH',
            body: JSON.stringify({ seat_limit: seatLimit === null ? null : seatLimit }),
          },
          token,
        ).then(r => r.data),
    },

    members: {
      list: (workspaceId: string, token: string) =>
        this.request<{
          data: SuperAdminMember[]
          meta: { effective_seat_limit: number | null }
        }>(
          `/super_admin/workspaces/${workspaceId}/members`,
          {},
          token,
        ),

      setRole: (
        workspaceId: string,
        memberId: string,
        role: 'owner' | 'admin' | 'editor' | 'moderator' | 'viewer',
        token: string,
      ) =>
        this.request<{ data: SuperAdminMember }>(
          `/super_admin/workspaces/${workspaceId}/members/${memberId}`,
          { method: 'PATCH', body: JSON.stringify({ role }) },
          token,
        ).then(r => r.data),

      remove: (workspaceId: string, memberId: string, token: string) =>
        this.request<void>(
          `/super_admin/workspaces/${workspaceId}/members/${memberId}`,
          { method: 'DELETE' },
          token,
        ),

      bulkRemove: (workspaceId: string, memberIds: string[], token: string) =>
        this.request<{
          data: {
            removed_count: number
            removed_ids: string[]
            skipped_ids: string[]
            remaining_users_count: number
          }
        }>(
          `/super_admin/workspaces/${workspaceId}/members/bulk_destroy`,
          { method: 'POST', body: JSON.stringify({ member_ids: memberIds }) },
          token,
        ).then(r => r.data),
    },

    users: {
      list: (
        params: { q?: string; page?: number; per_page?: number } = {},
        token: string,
      ) =>
        this.request<{
          data: SuperAdminUser[]
          meta: { current_page: number; total_pages: number; total_count: number; per_page: number }
        }>(
          '/super_admin/users',
          { params: params as Record<string, string | number | boolean | undefined> },
          token,
        ),

      setRole: (id: string, role: 'admin' | 'user', token: string, opts: { force?: boolean } = {}) =>
        this.request<{ data: SuperAdminUser }>(
          `/super_admin/users/${id}/set_role`,
          {
            method: 'POST',
            body: JSON.stringify({ role, force: opts.force ? '1' : undefined }),
          },
          token,
        ).then(r => r.data),
    },
  }
}

/**
 * Resolve the API base URL.
 *
 * Order of precedence:
 * 1. NEXT_PUBLIC_API_URL env var (build-time, both server and client)
 * 2. Browser: derive from current hostname (dash.foo.com → api.foo.com)
 * 3. Server (SSR): docker-compose internal hostname
 * 4. Last-resort dev fallback
 *
 * The hostname-derived fallback is what makes prod work even when the deploy
 * config forgets to set NEXT_PUBLIC_API_URL — silent localhost fallbacks
 * cause every client request to fail with mixed-content / unreachable errors.
 */
function resolveApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL

  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) {
      return 'http://localhost:3001'
    }
    // dash.univerreviews.com → api.univerreviews.com
    if (host.startsWith('dash.')) {
      return `${window.location.protocol}//${host.replace(/^dash\./, 'api.')}`
    }
    // foo.example.com → api.example.com (root + 1 subdomain)
    const parts = host.split('.')
    const root = parts.slice(-2).join('.')
    return `${window.location.protocol}//api.${root}`
  }

  return 'http://api:3000'
}

export const api = new ApiClient(resolveApiBaseUrl())
