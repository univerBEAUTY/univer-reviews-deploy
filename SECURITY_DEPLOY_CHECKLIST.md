# Security Deploy Checklist — MVP

Generated from the security hardening sweep. Read top-to-bottom before deploying to production.

## REQUIRED env vars in Coolify (set BEFORE redeploy)

The Rails app now fails boot in production when any of these are missing. Set them on the `api` service in Coolify under Environment Variables.

| Variable | Purpose | If unset |
|---|---|---|
| `JWT_SECRET` | Signs legacy auth JWTs | App refuses to boot (fail-loud, intentional) |
| `BETTER_AUTH_SECRET` | Signs Better Auth cookies | Cookies insecure / refuses to load |
| `STRIPE_WEBHOOK_SECRET` | Verifies Stripe webhooks | `/api/v1/webhooks/stripe` returns 503 |
| `RESEND_WEBHOOK_SECRET` | Verifies Resend webhooks (svix-format) | `/api/v1/webhooks/resend` rejects every delivery |
| `FEEDSPACE_WEBHOOK_SECRET` | Shared secret for Feedspace integration | `/api/v1/webhooks/feedspace` rejects every delivery |
| `PAYMENT_WEBHOOK_SECRET` | HMAC key for external payment-platform webhook (`/api/v1/webhooks/payment`) | Endpoint returns 503 (fail-closed). No buyer can be auto-provisioned. |
| `UNIVERCART_WEBHOOK_SECRET` | HMAC key for `/api/v1/webhooks/univercart` (`whsec_<…>` from Univercart admin → endpoints). | Endpoint returns 503; no Univercart sales can land. |
| `UNIVERCART_JWT_SECRET` | HS256 shared secret used to verify magic-link JWTs at `dash/connect/setup?t=<JWT>`. | Setup page errors out with `connect_misconfigured`. |
| `UNIVERCART_API_KEY` | Bearer `sk_live_<…>` for `POST /v1/tokens/:jti/redeem`. Lives on Rails only. | Rails redeem proxy returns 503; no buyer can log in via the magic-link. |
| `UNIVERCART_API_URL` | Optional override; defaults to `https://api.univercart.com`. | Uses default. |
| `UNIVERCART_PARTNER_SLUG` | Our `aud` claim in inbound JWTs (`univerreviews`). | Defaults to `univerreviews`. |
| `ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY`, `ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY`, `ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT` | Active Record Encryption — cifra `univercampus_connections.api_token`. Gere com `bin/rails db:encryption:init`; defina no `api` **e** no `sidekiq`. Não troque depois de conectar: tokens salvos ficam ilegíveis. | App sobe normal; só salvar uma conexão UniverCampus é recusado (422 com mensagem pedindo as chaves). |
| `UNIVERCAMPUS_API_URL` | URL do UniverCampus pré-preenchida no admin | Usa `https://univercampus.cloud` |
| `CONNECT_PROXY_SECRET` | Shared secret between Next `/connect/setup` and Rails `/api/v1/connect/redeem` so a stray visitor can't trigger redemptions. Generate with `openssl rand -hex 32`. | Endpoint returns 503. |
| `FRONTEND_URL` | Allowlist for Stripe redirects | Falls back to `https://dash.univerreviews.com` |
| `STRIPE_SECRET_KEY` | Stripe API client | Stripe calls fail with auth errors |
| `ANTHROPIC_API_KEY` | AI moderation / generation | AI endpoints return missing-key error |
| `RESEND_API_KEY` | Email sending | Email sends fail |
| `DATABASE_URL`, `REDIS_URL`, `SECRET_KEY_BASE` | Standard Rails infra | App refuses to boot |

Generate strong values with:
```bash
openssl rand -hex 64   # for JWT_SECRET, FEEDSPACE_WEBHOOK_SECRET
```

For Resend webhook: copy the signing secret from the Resend dashboard (format `whsec_<base64>`).
For Stripe webhook: copy from Stripe dashboard → Developers → Webhooks → reveal signing secret.

## Required migrations to run after deploy

```
bundle exec rails db:migrate
```

Two new migrations applied this sweep:
- `20260520000001_harden_reward_grants.rb` — unique indexes on reward_grants
- `20260520000002_create_stripe_events.rb` — stripe_events idempotency table

T1.2 payment webhook migration:
- `20260528173200_create_payment_events.rb` — payment_events idempotency table (no RLS; pre-provisioning)

Integração UniverCampus (2026-10-27) — todas aditivas, aplicadas pelo `rails db:prepare` do boot do `api`:
- `20261027000001_create_univercampus_connections.rb` — conexão por workspace (token cifrado, RLS FORCE)
- `20261027000002_add_description_to_products.rb` — `products.description` (text, nullable)
- `20261027000003_allow_course_brief_ai_jobs.rb` — `ai_jobs_type_check` passa a aceitar `course_brief`

## DB role hardening (HIGH priority, post-MVP)

The Postgres role used by the app is currently a superuser, which bypasses every `FORCE ROW LEVEL SECURITY` policy in the schema. The RLS scaffolding works but is not enforced today.

Action: create a non-superuser app role and switch `DATABASE_URL` to use it. See audit finding CRITICAL #2 for the full rationale.

```sql
CREATE ROLE univer_app LOGIN PASSWORD '<strong>' NOSUPERUSER NOBYPASSRLS;
GRANT USAGE ON SCHEMA public, auth TO univer_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public, auth TO univer_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public, auth TO univer_app;
-- Better Auth hook needs BYPASSRLS for the cross-tenant email lookup:
GRANT pg_signal_backend TO univer_app;   -- optional
-- For the cross-tenant linking hook only, grant BYPASSRLS:
ALTER ROLE univer_app BYPASSRLS;          -- OR create a separate role
```

The application code already handles `SET LOCAL row_security = off` failures gracefully — switching to a non-superuser role is now a same-day exercise.

## Data fix required (carried forward from the lizzon bug)

Users who logged in BEFORE the auth hook fix may be wrongly linked to the first workspace (lizzon). Run the SQL fix from the original bug report:

```sql
-- Move better_auth_user_id from lizzon → the user's real workspace_user
UPDATE workspace_users wu_correct
SET better_auth_user_id = wu_wrong.better_auth_user_id
FROM workspace_users wu_wrong
JOIN workspaces w ON w.id = wu_wrong.workspace_id AND w.slug = 'lizzon'
WHERE LOWER(wu_correct.email) = LOWER(wu_wrong.email)
  AND wu_correct.id != wu_wrong.id
  AND wu_correct.better_auth_user_id IS NULL
  AND wu_wrong.better_auth_user_id IS NOT NULL;

-- Null-out the wrong association on lizzon-side rows
UPDATE workspace_users wu_wrong
SET better_auth_user_id = NULL
FROM workspaces w
WHERE wu_wrong.workspace_id = w.id
  AND w.slug = 'lizzon'
  AND EXISTS (
    SELECT 1 FROM workspace_users wu2
    WHERE LOWER(wu2.email) = LOWER(wu_wrong.email)
      AND wu2.id != wu_wrong.id
      AND wu2.better_auth_user_id = wu_wrong.better_auth_user_id
  );
```

## What was fixed in this sweep

13 CRITICAL/HIGH security findings closed (see git log for `security(...)` commits):

1. JWT_SECRET hardcoded fallback — fail-boot
2. Shopify webhook HMAC verification — was missing entirely
3. Feedspace webhook shared secret — was open
4. WooCommerce webhook fail-closed + drop Referer trust + drop subdomain walk
5. Resend webhook fail-closed + 5-min timestamp tolerance
6. Legacy login requires `workspace_slug`
7. Magic-link `verify` moved to POST body (was GET ?token=)
8. workspace_users role grants gated by caller role + no self-elevation
9. SSRF allowlist on WooCommerce `store_url` probe
10. Reward grant TOCTOU race (unique indexes + row lock)
11. Public submit reward farm — `is_verified_purchase` server-derived
12. Upload MIME allowlist + random filename + server-chosen content-type
13. Stripe webhook idempotency via `stripe_events` table
14. Open redirect allowlist on Stripe redirects + billing role gate
15. `filter_parameters` Rails initializer
16. CSP / HSTS / X-Frame-Options / Permissions-Policy on Next.js admin
17. Vote dedupe (helpful/unhelpful) via Redis SETNX per /24 or /64
18. Public questions endpoint rate limit + length caps
19. Workspace selection no longer falls back to arbitrary membership

## What's still open (post-MVP)

- Encrypt `platform_meta` (WC consumer_key/secret/webhook_secret plaintext in jsonb today)
- Replace Postgres superuser with non-superuser app role
- Better Auth bearer plugin — review whether it's needed; today it lets a stolen session token authenticate cross-subdomain
- Magic-link tokens not invalidated atomically (race between two concurrent magic-link requests)
- Widget shadow DOM is `mode: 'open'` — customer storefront JS can read widget state
- Widget script lacks Subresource Integrity (SRI) on customer sites
