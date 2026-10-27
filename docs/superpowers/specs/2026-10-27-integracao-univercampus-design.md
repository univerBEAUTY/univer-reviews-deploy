# Integração UniverReviews ↔ UniverCampus — Design

**Data:** 2026-10-27
**Status:** aprovado em conversa, aguardando revisão do documento
**Repositórios:** `univerBEAUTY/univer-reviews-deploy` (este) e `univercampus` (local: `../univercampus`)

## 1. Objetivo

Permitir que um workspace do UniverReviews se conecte ao UniverCampus com **um token de API gerado pelo dono das escolas**, enxergue os cursos dessas escolas como produtos, gere reviews (IA em massa ou manuais) com contexto real do curso, e publique essas reviews no UniverCampus, onde aparecem:

- como **estrelas/nota média** (página de venda pública, paywall do aluno logado, cards de curso, seção Avaliações do curso);
- como **depoimentos** na página de venda e no paywall.

### Decisões tomadas

| Tema | Decisão |
|---|---|
| Escopo do token | Por **usuário dono**. Só quem é dono (`role = owner`) de ao menos uma escola gera. O token enxerga **todas as escolas em que o usuário é dono no momento da chamada** — não a plataforma inteira. |
| Direção do fluxo | **Push**: o UniverReviews lê cursos e envia/remove reviews pela API do UniverCampus. O UniverCampus guarda cópia local. |
| Depoimentos no paywall | Manuais da escola primeiro; depois externos em ordem: destaque → maior nota → texto mais longo. Máximo 12 no total. Todas as externas entram na média. |
| Reviews sintéticas (IA) | O UniverCampus **guarda** a marca `sintetica`, mas **não exibe aviso** ao aluno. Ligar um aviso depois não exige migração. |

### Fora de escopo

- Reviews de alunos do UniverCampus voltando para o UniverReviews.
- Webhook do UniverCampus avisando mudança de curso (sync diário + manual cobrem).
- Corrigir `product.external_id` em `bulk_generate_qa_job.rb:79` (bug existente, registrado à parte).
- Criptografar as credenciais WooCommerce existentes.

## 2. Arquitetura

```
UniverReviews (Rails API + admin Next)              UniverCampus (Next + Drizzle)
──────────────────────────────────────              ─────────────────────────────
Admin: integrations/univercampus                    config/univerreview (dono gera token ucrev_…)
  URL + token ─ GET  /api/univerreview/escolas ───▶ usuário + escolas onde é dono
UnivercampusSyncJob
  ─────────── GET  /api/univerreview/cursos ──────▶ cursos (metadados)
  ─────────── GET  /api/univerreview/cursos/:id/conteudo ▶ texto do curso cortado + digest
  └─ Haiku (1x por digest) → products.metadata.ai_brief
GenerateService usa ai_brief no prompt
Review after_commit → UnivercampusPushJob
  ─────────── PUT    /api/univerreview/avaliacoes ─▶ upsert lote em avaliacoes_externas
  ─────────── DELETE /api/univerreview/avaliacoes/:idExterno ▶ remove
                                                    lib/avaliacoes-externas.ts mistura com reviews de alunos
```

## 3. Lado UniverCampus

Convenções do repo: código, nomes e commits em português; commits em frase de prosa; `pnpm verify` é o portão; migration com cabeçalho explicativo; toda tabela com `tenant_id` precisa de `CREATE POLICY` (senão `src/lib/db/policies.test.ts` falha); server actions com `slug` precisam abrir escopo de escola.

### 3.1 Tabela `chaves_univerreview` (migration 0095)

Modelada em `chavesDePublicacao` / `src/lib/chave-de-publicacao.ts`, mas **por usuário**:

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | text pk | |
| `user_id` | text → `user.id`, cascade | dono do token |
| `nome` | text | rótulo opcional ("UniverReviews produção") |
| `prefixo` | text | 12 primeiros caracteres visíveis |
| `hash` | text unique | SHA-256 do token |
| `criada_em` | timestamptz | |
| `ultimo_uso_em` | timestamptz null | gravado com folga de 1h |
| `revogada_em` | timestamptz null | |

- Formato: `ucrev_` + 32 bytes aleatórios base64url.
- Sem `tenant_id` → sem política de escola; acesso só pelo servidor. Não sofre o problema da Fase C da chave do universocial.
- Biblioteca `src/lib/chave-univerreview.ts`: `gerarChave`, `autenticarChave(token)` → `{ userId, chaveId } | null`, `revogarChave`, `escolasDoDono(userId)` (memberships com `role = owner`, escolas não excluídas).

### 3.2 Tabela `avaliacoes_externas` (mesma migration 0095)

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | text pk | |
| `tenant_id` | text → tenants, cascade | RLS `escola_permitida(tenant_id)` |
| `course_id` | text → courses, cascade | |
| `origem` | text default `'univerreview'` | |
| `id_externo` | text | id da review no UniverReviews |
| `nota` | integer 1–5 (CHECK) | |
| `titulo` | text null | |
| `texto` | text | |
| `autor_nome` | text | |
| `autor_foto_url` | text null | só `https://` |
| `sintetica` | boolean default false | não exibida |
| `destaque` | boolean default false | |
| `publicada_em` | timestamptz | data exibida |
| `criada_em`, `atualizada_em` | timestamptz | |

- Único: `(tenant_id, origem, id_externo)`. Índice: `(course_id)`.
- `ENABLE` + `FORCE ROW LEVEL SECURITY`, `CREATE POLICY "avaliacoes_externas_tenant" … escola_permitida(tenant_id)`, `GRANT … TO univercampus_app`.

### 3.3 Tela do dono

- Card "UniverReview" em `src/app/s/[slug]/(app)/config/page.tsx`, visível só para dono (como o card do universocial).
- Página `config/univerreview/` (`page.tsx`, `chaves-form.tsx`, `actions.ts`) protegida por `authorizeOwner`. Mostra: explicação, lista das escolas cobertas ("Este token vale para todas as escolas em que você é dono: …"), URL da API a colar no UniverReviews, gerar token (exibido uma única vez), lista de tokens com prefixo/último uso, revogar.
- As actions recebem `slug` e abrem escopo (regra de `escopo-nas-actions.test.ts`), mas a chave é do usuário.

### 3.4 API `src/app/api/univerreview/`

Comum a todas as rotas:
- `Authorization: Bearer ucrev_…`. Token ausente/inválido/revogado → `401 {erro}`. Usuário sem nenhuma escola como dono → `403 {erro}`.
- Toda leitura/escrita de curso confere que a escola do curso está em `escolasDoDono(userId)` **na hora** → senão `404` (não revela existência).
- Limite de requisições por chave reaproveitando `src/lib/limite-de-requisicoes.ts`. Excedido → `429` com `Retry-After`.
- Trabalho dentro de `comTenant(escola)` para respeitar RLS.

| Rota | Resposta |
|---|---|
| `GET /api/univerreview/escolas` | `{ usuario: {id, nome, email}, escolas: [{id, slug, nome, url}] }` |
| `GET /api/univerreview/cursos?escola=<slug>&atualizadoDesde=<iso>` | `{ cursos: [{id, escola: {id, slug, nome}, titulo, slug, descricao, capaUrl, precoCentavos, status, url, atualizadoEm}] }` — cursos não arquivados; sem `escola` → todas as escolas do dono |
| `GET /api/univerreview/cursos/:id/conteudo` | `{ id, digest, texto, caracteres, cortado }` |
| `PUT /api/univerreview/avaliacoes` | corpo `{ avaliacoes: [...] }` (1–100); resposta `{ salvas: n, erros: [{idExterno, erro}] }` |
| `DELETE /api/univerreview/avaliacoes/:idExterno` | `204` (idempotente: inexistente também `204`) |

**Texto do curso (`conteudo`)** — montado em `src/lib/conteudo-para-ia.ts`, nesta ordem, até **6.000 caracteres**:
1. título e descrição do curso;
2. do `paywall`: headline, subtítulo, descrição, tópicos;
3. módulos em ordem, cada um com títulos das aulas;
4. texto das aulas publicadas (Markdown reduzido → texto puro), distribuído proporcionalmente até o limite.

`digest` = SHA-256 do texto final. `cortado = true` quando o limite foi atingido.

**Upsert de avaliação** — campos: `idExterno` (obrigatório), `cursoId` (obrigatório), `nota` 1–5, `titulo?`, `texto` (1–5.000 chars), `autorNome` (1–120), `autorFotoUrl?` (`https://` ou descartada), `sintetica`, `destaque`, `publicadaEm` (ISO). Itens inválidos vão para `erros` sem derrubar o lote.

### 3.5 Exibição — `src/lib/avaliacoes-externas.ts`

- `resumoDoCurso(courseId)`: junta `reviews` (alunos) + `avaliacoes_externas` → `{ media, total }`. Substitui o cálculo atual em: página de venda pública (`src/app/s/[slug]/curso/[courseSlug]/page.tsx` ~:200), paywall interno (`pagina-de-venda.tsx`), cards de curso (`cursos/page.tsx`, `cartao-do-curso.tsx`, `templates/hotmart.tsx`), seção Avaliações (`cursos/[courseSlug]/page.tsx`). A regra de `provaVisivel` (≥3 avaliações) permanece.
- `depoimentosDoCurso(courseId, manuais)`: manuais primeiro, depois externas ordenadas por `destaque desc, nota desc, length(texto) desc, publicada_em desc`, total máximo `MAXIMO_DE_DEPOIMENTOS` (12). Externas são convertidas para o tipo `Depoimento` existente; foto externa renderiza via `<img>` (o componente já usa `<img>`, sem `next/image`), sem foto → inicial.
- Seção Avaliações do curso lista externas junto das de alunos, por data.
- Corrigir o `$type` de `courses.paywall` em `schema.ts` para declarar `depoimentos` (divergência existente que o código toca).

### 3.6 Testes UniverCampus

- Unit: `conteudo-para-ia` (ordem, corte, Markdown → texto, digest estável), ordenação/limite de `depoimentosDoCurso`, média combinada.
- Integração (PGlite, `tests/integration/univerreview-*.test.ts`, modelados em `publicar-pelo-universocial.test.ts`): token válido/revogado/inválido; usuário só vê escolas onde é dono; curso de escola alheia → 404; perder posse → 404/403; upsert idempotente; lote com item inválido; delete idempotente; página de venda soma externas.
- `pnpm verify` e `pnpm check:migrations` verdes.

## 4. Lado UniverReviews

Convenções do repo: RLS por `workspace_id` em toda tabela de tenant; jobs usam `with_workspace_rls`; RSpec + FactoryBot + WebMock; admin em pt-BR com React Query, `sonner`, `PageHeader`, tokens `var(--ur-*)`.

### 4.1 Migrations

1. `create_univercampus_connections`:

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | uuid pk | |
| `workspace_id` | uuid, unique | 1 conexão por workspace; RLS igual a `product_groups` |
| `base_url` | string | default via `ENV["UNIVERCAMPUS_API_URL"]` |
| `api_token` | text | **criptografado** (Active Record Encryption) |
| `token_prefix` | string | exibição |
| `schools` | jsonb | `[{id, slug, nome, url}]` do último teste |
| `owner_info` | jsonb | `{id, nome, email}` |
| `status` | string | `active` / `invalid` |
| `verified_at`, `last_synced_at`, `last_pushed_at` | datetime | |
| `last_error` | text | |
| timestamps | | |

2. `add_description_to_products`: `products.description text`.

Active Record Encryption: configurar `primary_key`, `deterministic_key`, `key_derivation_salt` por ENV (`ACTIVE_RECORD_ENCRYPTION_*`) em `config/application.rb`; adicionar ao `.env.example` e ao `SECURITY_DEPLOY_CHECKLIST.md`. Só `UnivercampusConnection` usa `encrypts :api_token`.

### 4.2 Código

| Arquivo | Responsabilidade |
|---|---|
| `app/models/univercampus_connection.rb` | `encrypts :api_token`, validações, `mark_invalid!(msg)`, `as_payload` (sem token) |
| `app/services/integrations/univercampus/client.rb` | Faraday, Bearer, timeout 30s, retry em 5xx/timeout, bloqueio SSRF reaproveitado do `WooCommerceAdapter` (extrair para módulo compartilhado se trivial); erros `AuthError` (401/403), `NotFound`, `RateLimited`, `Error`; métodos `schools`, `courses(since:)`, `course_content(id)`, `upsert_reviews(list)`, `delete_review(external_id)` |
| `app/services/integrations/univercampus/course_syncer.rb` | Upsert de produtos `platform: "univercampus"`, `platform_product_id = curso.id`, `title`, `description`, `image_url`, `price`, `currency: "BRL"`, `metadata.univercampus = {escola, slug, url, digest}`; cursos ausentes → `active: false`; retorna `{ok, synced, failed, errors}` |
| `app/services/ai/course_brief_service.rb` | Se `digest` mudou: busca `conteudo`, 1 chamada Haiku com capa (imagem por URL) + texto → resumo ≤600 chars (para quem é, o que ensina, módulos principais, promessa, tom). Grava `metadata.ai_brief` e `metadata.ai_brief_digest`. Usa `Ai::BaseService#call_claude` (registra `AiJob`) e respeita `AiCostCap`. Falha de IA não derruba o sync. |
| `app/services/ai/generate_service.rb` (alteração) | Contexto do produto = `title` + (`metadata.ai_brief` ‖ `description` cortada em 600) ; sem nenhum → comportamento atual |
| `app/services/integrations/univercampus/review_publisher.rb` | Dado um conjunto de reviews de um workspace: `approved` → payload e `upsert_reviews` em lotes de 100; demais/apagadas → `delete_review`. `sintetica = ai_is_synthetic \|\| metadata.ai_generated`; `destaque = is_featured`; `publicadaEm = approved_at \|\| created_at`; `autorFotoUrl = author_avatar_url` |
| `app/jobs/univercampus_sync_job.rb` | sync + briefs de um workspace; fila `:imports` |
| `app/jobs/univercampus_sync_all_job.rb` | cron diário (sidekiq.yml), todas as conexões `active` |
| `app/jobs/univercampus_push_job.rb` | recebe `workspace_id` + ids (upsert) + external ids (delete); debounce por produto (agrupa mudanças de ~10s via `set(wait:)` + chave em Redis) |
| `app/models/review.rb` (alteração) | `after_commit` em create/update/destroy: se produto é `univercampus` e mudou `status/body/title/rating/is_featured/author_*` (ou destroy), enfileira push |
| `app/controllers/api/v1/integrations/univercampus_controller.rb` | `show`, `create`/`update` (salva, testa, enfileira sync), `test` (testa sem salvar), `sync` (`?inline=true` síncrono), `push_all` (reenvia todas aprovadas), `destroy`. Escrita exige `require_write!`; papel admin do workspace como no WooCommerce |
| `config/routes.rb` | `namespace :integrations { resource :univercampus, … }` espelhando WooCommerce |

### 4.3 Admin

- `apps/admin/src/app/[workspace]/integrations/page.tsx`: card "UniverCampus" com estado via `useQuery`.
- `apps/admin/src/app/[workspace]/integrations/univercampus/page.tsx`: campos URL (pré-preenchida) + token (password), **Testar** (lista escolas), **Salvar e sincronizar**, **Sincronizar agora**, **Reenviar reviews**, **Desconectar**; status, último sync/push, último erro; lista de escolas e contagem de cursos.
- `apps/admin/src/lib/api.ts`: `integrations.univercampus.*`.
- Lista de Produtos: os cursos já aparecem; filtro por plataforma se ainda não existir. Geração com IA e criação manual inalteradas.

### 4.4 Tratamento de erros

| Situação | Comportamento |
|---|---|
| 401/403 | `connection.mark_invalid!`, aviso no admin, sem retry |
| 404 de curso | produto `active: false`; push daquele curso descartado |
| 429 / 5xx / timeout | retry do Sidekiq com backoff; `last_error` atualizado |
| Erro de item no lote | registrado em `last_error`, demais seguem |
| Falha na IA do resumo | sync segue; geração cai para `description` |

### 4.5 Testes UniverReviews

- `spec/services/integrations/univercampus/client_spec.rb` (WebMock: sucesso, 401, 404, 429, SSRF).
- `course_syncer_spec.rb` (upsert, desativação, metadata).
- `spec/services/ai/course_brief_service_spec.rb` (Claude stubado; não chama com digest igual).
- `review_publisher_spec.rb` (approved → PUT; outros → DELETE; marca sintética; lotes de 100).
- `spec/models/review_spec.rb` (after_commit enfileira só quando relevante).
- `spec/requests/api/v1/integrations/univercampus_spec.rb` (token nunca no payload, escrita exige write, RLS).
- `apps/admin/e2e/univercampus.spec.ts` (conectar com API mockada, ver escolas).

## 5. Ordem de entrega

1. UniverCampus: migration + chave + API + testes (permite testar com `curl`).
2. UniverCampus: exibição (estrelas + depoimentos) + tela do dono.
3. UniverReviews: migrations + conexão + client + sync + tela admin.
4. UniverReviews: resumo IA + prompt.
5. UniverReviews: push de reviews.
6. Ponta a ponta local: UniverCampus em `localhost:3000`, UniverReviews API em `:3001`, admin em outra porta.

Cada repo em sua própria branch (`feat/integracao-univercampus` aqui; `feat/univerreview` no UniverCampus, a partir de `origin/main`).
