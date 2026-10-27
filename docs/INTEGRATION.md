# UniverReviews — Integration Guide

Production-ready guide for embedding reviews + Q&A + AI summary into
any e-commerce front-end. Three install paths:

  1. WordPress plugin (recommended for WooCommerce stores).
  2. Shopify app (in approval).
  3. Generic script tag + REST API (any framework).

---

## 1. WordPress + WooCommerce (recommended)

### 1.1 Install

1. Download the latest `univer-reviews.zip` from your dashboard
   (`https://dash.univerreviews.com/<slug>/integrations/woocommerce`).
2. WordPress Admin → Plugins → Add New → Upload Plugin → choose the
   zip → Install Now → Activate.
3. The plugin auto-registers a settings page under "UniverReviews"
   in the WP admin sidebar.

### 1.2 Connect

In the plugin settings page paste:

- **Workspace ID** — UUID from your UniverReviews dashboard
  (`/<slug>/settings → API`).
- **API Key** — generate at `/<slug>/settings → API → Keys`.
- **API URL** — defaults to `https://api.univerreviews.com`, leave as-is.

Click "Save + Test Connection". A green checkmark means handshake OK.

### 1.3 Shortcodes available

```text
[univer_reviews product_id="123"]
  Main review widget (stars, distribution, write-review button, paginated list).

[univer_rating product_id="123" size="18" show_value="true" link="#reviews"]
  Inline "★★★★★ 4.8 (123)" — for product cards, hero sections. Smart
  scroll to AI summary anchor by default.

[univer_qa product_id="123"]
  Q&A panel only.

[univer_ai_carousel product_id="123" preset="auto"]
  AI summary carousel. preset="auto" picks topics if available, else
  falls back to media carousel.

[univer_featured_reviews]
  Wall of featured reviews across the entire workspace (for a
  /reviews landing page).

[univer_reviews_summary product_id="123"]
  Compact "★ 4.8 (123)" snippet for cart/checkout.
```

### 1.4 Gutenberg block

A `UniverReviews Widget` block is registered automatically. Drag it
into any post/page and pick a product from the dropdown.

### 1.5 WooCommerce auto-injection

By default the plugin injects `[univer_reviews]` into the
"Reviews" product tab. Disable this in **Settings → WooCommerce → Display**
if you want manual placement only.

### 1.6 Loyalty bridge

If you also use the UniverLoyalty plugin (`univer-loyalty-main`),
reviews approved on the SaaS side fire the `univer_review_approved`
action on WordPress, which awards points based on the active campaign
(text/photo/video tiers, min_chars gate, only_logged_in gate).

Idempotency: comment meta `_ulp_points_awarded=1` prevents double
awards on re-sync.

---

## 2. Shopify (in approval)

App submission to the Shopify App Store is in review. Until approved,
use the generic install (§ 3) and add your `*.myshopify.com` domain
manually under `Settings → Domains`.

Webhooks the app will register once approved:
- `orders/create` → mark verified-purchase reviews
- `products/create|update|delete` → keep catalog synced

---

## 3. Generic install (any framework)

### 3.1 Register your domain

In `/<slug>/settings → Domains`, add the apex domain that will host the
widget. The widget refuses to mount on unregistered domains so a stolen
workspace ID is useless without the matching domain row.

### 3.2 Script tag + custom element

```html
<script async src="https://api.univerreviews.com/widget.js"></script>

<univer-reviews
  workspace-id="YOUR-WORKSPACE-UUID"
  product-id="YOUR-PRODUCT-EXTERNAL-ID"
  api-url="https://api.univerreviews.com"
  layout="default"
  locale="pt-BR"
  theme-color="#d4a850"
></univer-reviews>
```

Attributes:

| Attribute          | Type    | Default          | Notes |
|--------------------|---------|------------------|-------|
| `workspace-id`     | UUID    | (required)       | Workspace identifier |
| `product-id`       | string  | (required)       | Your platform's product id (external_id) |
| `api-url`          | URL     | api.univerreviews.com | Override for self-hosted deploys |
| `layout`           | enum    | default          | `default \| compact \| grid \| carousel` |
| `locale`           | enum    | pt-BR            | `pt-BR \| en-US \| es-AR` |
| `theme-color`      | hex     | #d4a850          | Accent for buttons, badges |
| `star-color`       | hex     | #fbbf24          | Star fill |
| `star-shape`       | enum    | star             | `star \| heart \| flame \| thumb \| diamond` |
| `show-qa`          | bool    | true             | Show Q&A tab |
| `show-write-review`| bool    | true             | Show CTA |
| `per-page`         | int     | 10               | Reviews per pagination |
| `featured`         | bool    | false            | Workspace-wide featured wall mode |
| `min-rating`       | int     | 4                | When featured=true, filter ≥ this rating |
| `limit`            | int     | 30               | When featured=true |

### 3.3 Public REST API

For deeper integrations (mobile apps, AMP, custom landing pages):

```http
GET /api/v1/public/summary/:product_id
Headers:
  X-Univer-Workspace: <workspace_uuid>
  X-Univer-Domain:    <your-domain.com>
Response:
  { "data": { "avg_rating": 4.8, "total_reviews": 248, "rating_distribution": [...] } }

GET /api/v1/public/reviews?product_id=:id&per_page=20
GET /api/v1/public/ai-summary-topics?product_id=:id
GET /api/v1/public/ai-carousel/:product_id?limit=15
GET /api/v1/public/qa?product_id=:id
POST /api/v1/public/reviews  (submit a new review, server-side moderation)
```

All public endpoints require the `X-Univer-Domain` header to match a
registered workspace domain. Rate limit: 1200 requests/min per
domain+IP combo.

---

## 4. Custom-brand star icon

Pro+ plans can upload an SVG/PNG to replace the star glyphs (the
"Sumo-style" hair-care tacos vibe). `/<slug>/settings → Appearance →
Ícone da marca`. Once uploaded, every star slot — widget, write-review
picker, distribution rows — renders as a CSS-masked image tinted with
`star-color`. Falls back to the preset shape automatically when the
custom icon is removed.

---

## 5. AI Summary topics

Pro+ plans only. From `/<slug>/ai-summaries`:

- Per-product: click product → "Gerar com IA". Claude reads the approved
  reviews + brand voice and outputs a topic title + 1–2 sentence
  consensus blurb + a curated list of supporting review IDs.
- Iterate: "+ Gerar mais 1 com IA" adds a new topic on top of the
  existing set (max 5/product). Exclude-list of existing titles
  prevents duplicates.
- Bulk: "Gerar para todos" enqueues a job per eligible product
  (≥ 5 approved reviews).

Cost cap: each plan has a soft monthly USD ceiling visible at
`/<slug>/ai-cost`. T4 enforces hard cutoff.

---

## 6. Bulk operations

- `/api/v1/ai/bulk-create-reviews` — generate N AI reviews (1–50) for
  a product. Internally chunked to 8/call so Claude never truncates.
  Honest "no eligible reviews" surface when source material is missing.
- `/api/v1/ai/bulk-create-questions` — Q&A pair generation.

---

## 7. Webhooks (inbound)

UniverReviews accepts webhooks from:

- **Stripe** — subscription lifecycle. Configured via `STRIPE_WEBHOOK_SECRET`.
- **Shopify** — order events. Per-shop HMAC secret stored on
  `workspace_domains.platform_meta`.
- **WooCommerce** — order events. Per-domain HMAC secret.
- **Resend** — email delivery + open tracking. svix-style HMAC.
- **Feedspace** — review imports. Shared `FEEDSPACE_WEBHOOK_SECRET` +
  `X-Workspace-Id` header.

All webhooks fail-closed in production: missing/invalid signature → 401.

---

## 8. Outbound webhooks (T2 — roadmap)

Coming: workspace-defined endpoints we POST to on `review.approved`,
`review.flagged`, `topic.generated`. Signed with rotatable HMAC secret.

---

## 9. UniverCampus

Conecta um workspace às escolas de um dono no UniverCampus. Desenho completo
em `docs/superpowers/specs/2026-10-27-integracao-univercampus-design.md`.

**Conectar** — no UniverCampus, o dono abre Configurações → UniverReview e gera
um token `ucrev_…` (vale para todas as escolas em que ele é dono). Em
`/<slug>/integrations/univercampus`: URL (pré-preenchida com
`UNIVERCAMPUS_API_URL`, editável) + token → **Testar conexão** (lista as
escolas) → **Salvar e sincronizar**. O token fica cifrado (Active Record
Encryption) e nunca volta em resposta da API.

**O que acontece depois**

- *Cursos → produtos*: `UnivercampusSyncJob` (ao salvar, no botão
  "Sincronizar agora" e no cron diário 06:30 `UnivercampusSyncAllJob`) faz
  upsert de cada curso como produto `platform: "univercampus"` (título,
  descrição, capa, preço, `metadata.univercampus`). Curso que some da API vira
  `active: false`.
- *Resumo IA*: para cada curso cujo `digest` de conteúdo mudou, 1 chamada Haiku
  com a capa + texto do curso gera `metadata.ai_brief` (≤ 600 caracteres).
  Conta no limite mensal de IA (`AiJob` tipo `course_brief`). A geração de
  reviews usa esse resumo como contexto (ou a descrição, na falta dele).
- *Reviews → UniverCampus*: criar/editar/aprovar/apagar uma review de um curso
  enfileira o envio (mudanças do mesmo curso são juntadas por 10 s). Aprovadas
  com texto são publicadas (`PUT /api/univerreview/avaliacoes`, lotes de 100,
  com `sintetica` e `destaque`); as demais são removidas. **Reenviar
  avaliações** manda todas as aprovadas de novo.

**Erros** — token recusado (401/403) marca a conexão como inválida (aviso no
admin, sem retry). 404 de curso desativa o produto. 429/5xx/timeout: retry do
Sidekiq e `last_error` visível na tela.

**Endpoints (admin)** — `GET|POST|PATCH|DELETE /api/v1/integrations/univercampus`,
`POST …/test`, `POST …/sync[?inline=true]`, `POST …/push_all`. Escrita exige
permissão de escrita.

**Local** — o UniverCampus em `http://localhost:3000` é aceito em
development/test (em produção hosts privados são bloqueados por SSRF). Em
development as chaves de criptografia têm fallback; em produção defina
`ACTIVE_RECORD_ENCRYPTION_*` (ver `SECURITY_DEPLOY_CHECKLIST.md`).

---

## 10. Support

- Suporte: suporte@univerreviews.com
- DPO / Privacidade: privacidade@univerreviews.com
- Status: status.univerreviews.com (in setup)
- Termos: https://dash.univerreviews.com/termos
- Privacidade: https://dash.univerreviews.com/privacidade
