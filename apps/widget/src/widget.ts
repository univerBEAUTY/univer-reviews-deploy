// UniverReviews Widget — Vanilla Web Component
// Custom element: <univer-reviews>
// Light-first, zero dependencies, Shadow DOM isolated.

// ─── Types ───────────────────────────────────────────────────────────────────

interface ReviewMedia {
  type: 'image' | 'video'
  url: string
  thumb_url: string
}

interface Reply {
  body: string
  author_name: string
  created_at: string
}

interface Review {
  id: string
  rating: number
  title: string | null
  body: string
  author_name: string
  author_country: string | null
  author_avatar_url: string | null
  is_verified_purchase: boolean
  is_featured: boolean
  helpful_count: number
  unhelpful_count: number
  language: string
  created_at: string
  media: ReviewMedia[]
  replies: Reply[]
  /** Escrita por IA (gerada no painel ou importada como exemplo). O layout
   *  `showcase` mostra o rótulo de exemplo ao lado do nome. */
  is_synthetic?: boolean
}

interface ReviewSummary {
  product_id: string
  total_reviews: number
  avg_rating: number
  rating_distribution: { rating: number; count: number; percentage: number }[]
  verified_count?: number
  media_count?: number
  recommend_percentage?: number
}

interface PublicQuestion {
  id: string
  body: string
  author_name: string | null
  answer: string | null
  answered_at: string | null
  helpful_count: number
  created_at: string
}

type Layout = 'default' | 'compact' | 'grid' | 'carousel' | 'showcase'
type SortMode = 'created_at' | 'helpful' | 'rating' | 'oldest'
type RatingFilter = 0 | 1 | 2 | 3 | 4 | 5
type MediaFilter = 'all' | 'with_photo' | 'with_video' | 'with_media' | 'verified'
type ActiveTab = 'reviews' | 'qa'
type StarShape = 'star' | 'heart' | 'flame' | 'thumb' | 'diamond'

interface WidgetConfig {
  layout?: Layout
  locale?: string
  theme_color?: string
  star_color?: string
  star_shape?: StarShape
  /** Custom brand artwork (SVG/PNG public URL) shown in place of the preset
   *  star shape. Tinted with `star_color` via CSS mask so a single uploaded
   *  file paints both filled + empty states. */
  star_icon_url?: string | null
  star_icon_empty_url?: string | null
  show_qa?: boolean
  show_write_review?: boolean
  per_page?: number
  custom_css?: string
}

// The glyph used for a single star. Exposed as a top-level function so the
// rating picker (interactive) and the rendered cards (read-only) stay in
// sync when the workspace switches shapes.
function starGlyph(shape: StarShape): string {
  switch (shape) {
    case 'heart':   return '\u2665'  // ♥
    case 'flame':   return '\uD83D\uDD25' // 🔥
    case 'thumb':   return '\uD83D\uDC4D' // 👍
    case 'diamond': return '\u2666'  // ♦
    case 'star':
    default:        return '\u2605'  // ★
  }
}

// ─── i18n ────────────────────────────────────────────────────────────────────

const i18n: Record<string, Record<string, string>> = {
  'pt-BR': {
    reviews: 'Avaliações',
    qa: 'Perguntas',
    write_review: 'ESCREVER UM COMENTÁRIO',
    ask_question: 'Fazer Pergunta',
    no_reviews: 'Nenhuma avaliação ainda. Seja o primeiro!',
    no_questions: 'Nenhuma pergunta ainda.',
    loading: 'Carregando…',
    error: 'Não foi possível carregar as avaliações.',
    verified: 'Compra verificada',
    helpful_q: 'Isso é útil?',
    previous: 'Anterior',
    next: 'Próxima',
    your_name: 'Seu nome',
    your_email: 'Seu e-mail',
    review_title_ph: 'Título (opcional)',
    review_body_ph: 'Conte sua experiência…',
    submit: 'Enviar avaliação',
    cancel: 'Cancelar',
    add_photos: 'Adicionar fotos ou vídeo',
    file_hint: 'Até 5 arquivos · imagem ou vídeo',
    question_ph: 'Sua pergunta',
    sending: 'Enviando…',
    thank_review: 'Obrigado! Sua avaliação foi enviada e está em moderação.',
    thank_question: 'Obrigado! Sua pergunta foi enviada.',
    select_rating: 'Selecione uma nota',
    name_required: 'Informe seu nome',
    email_required: 'E-mail inválido',
    rating_required: 'Escolha uma nota',
    body_required: 'Escreva pelo menos 10 caracteres',
    store_reply: 'Resposta da loja',
    showing: 'Mostrando',
    of: 'de',
    all_filter: 'Todas',
    with_photo: 'Com foto',
    with_video: 'Com vídeo',
    verified_filter: 'Verificadas',
    star_filter: 'estrelas',
    sort_recent: 'Mais recentes',
    sort_oldest: 'Mais antigas',
    sort_helpful: 'Mais úteis',
    sort_rating_high: 'Maior nota',
    sort_rating_low: 'Menor nota',
    months_ago: 'meses atrás',
    month_ago: 'mês atrás',
    days_ago: 'dias atrás',
    day_ago: 'dia atrás',
    hours_ago: 'horas atrás',
    hour_ago: 'hora atrás',
    just_now: 'agora',
    years_ago: 'anos atrás',
    year_ago: 'ano atrás',
    sc_verified: 'verificadas',
    sc_recommend: 'recomendam este produto',
    sc_write: 'Escrever avaliação',
    sc_media_title: 'Fotos e vídeos de clientes',
    sc_media_link: 'Ver avaliações com mídia',
    sc_with_media: 'Com foto ou vídeo',
    sc_sort: 'Ordenar:',
    sc_load_more: 'Carregar mais avaliações',
    sc_all_verified: 'Exibindo avaliações de compras verificadas',
    ai_example: 'Avaliação de exemplo · gerada por IA',
  },
  'en-US': {
    reviews: 'Reviews',
    qa: 'Q&A',
    write_review: 'WRITE A REVIEW',
    ask_question: 'Ask a Question',
    no_reviews: 'No reviews yet. Be the first!',
    no_questions: 'No questions yet.',
    loading: 'Loading…',
    error: 'Could not load reviews.',
    verified: 'Verified Purchase',
    helpful_q: 'Was this helpful?',
    previous: 'Previous',
    next: 'Next',
    your_name: 'Your name',
    your_email: 'Your email',
    review_title_ph: 'Title (optional)',
    review_body_ph: 'Share your experience…',
    submit: 'Submit review',
    cancel: 'Cancel',
    add_photos: 'Add photos or video',
    file_hint: 'Up to 5 files · image or video',
    question_ph: 'Your question',
    sending: 'Sending…',
    thank_review: 'Thank you! Your review was submitted and is in moderation.',
    thank_question: 'Thank you! Your question was submitted.',
    select_rating: 'Select a rating',
    name_required: 'Name required',
    email_required: 'Invalid email',
    rating_required: 'Please pick a rating',
    body_required: 'Write at least 10 characters',
    store_reply: 'Store reply',
    showing: 'Showing',
    of: 'of',
    all_filter: 'All',
    with_photo: 'With photo',
    with_video: 'With video',
    verified_filter: 'Verified',
    star_filter: 'stars',
    sort_recent: 'Newest',
    sort_oldest: 'Oldest',
    sort_helpful: 'Most helpful',
    sort_rating_high: 'Highest rating',
    sort_rating_low: 'Lowest rating',
    months_ago: 'months ago',
    month_ago: 'month ago',
    days_ago: 'days ago',
    day_ago: 'day ago',
    hours_ago: 'hours ago',
    hour_ago: 'hour ago',
    just_now: 'just now',
    years_ago: 'years ago',
    year_ago: 'year ago',
    sc_verified: 'verified',
    sc_recommend: 'recommend this product',
    sc_write: 'Write a review',
    sc_media_title: 'Customer photos & videos',
    sc_media_link: 'See reviews with media',
    sc_with_media: 'With photo or video',
    sc_sort: 'Sort:',
    sc_load_more: 'Load more reviews',
    sc_all_verified: 'Showing reviews from verified purchases',
    ai_example: 'Sample review · AI-generated',
  },
}

// ─── Utilities ───────────────────────────────────────────────────────────────

// Deterministic colorful avatar background from author name.
const AVATAR_PALETTE = [
  '#7c3aed', '#2563eb', '#0891b2', '#059669', '#16a34a',
  '#ca8a04', '#ea580c', '#dc2626', '#db2777', '#9333ea',
  '#0284c7', '#65a30d', '#d97706', '#e11d48',
]

function avatarColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]
}

function initialOf(name: string): string {
  return (name?.trim()[0] || '?').toUpperCase()
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function relativeTime(iso: string, locale: string): string {
  const t = i18n[locale] || i18n['pt-BR']
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const sec = Math.floor((Date.now() - then) / 1000)
  if (sec < 60) return t.just_now
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} min`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} ${hr === 1 ? t.hour_ago : t.hours_ago}`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day} ${day === 1 ? t.day_ago : t.days_ago}`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `${mo} ${mo === 1 ? t.month_ago : t.months_ago}`
  const yr = Math.floor(mo / 12)
  return `${yr} ${yr === 1 ? t.year_ago : t.years_ago}`
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

const buildCSS = (themeColor: string, starColor: string): string => `
:host {
  --ur-bg: #ffffff;
  --ur-surface: #ffffff;
  --ur-surface-soft: #fafafa;
  --ur-text: #111827;
  --ur-text-soft: #6b7280;
  --ur-text-muted: #9ca3af;
  --ur-border: #e5e7eb;
  --ur-border-soft: #f3f4f6;
  --ur-star: ${starColor};
  --ur-star-empty: #e5e7eb;
  --ur-verified: #16a34a;
  --ur-accent: ${themeColor};
  --ur-accent-soft: ${themeColor}1A;
  --ur-danger: #dc2626;

  display: block;
  color: var(--ur-text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen,
    Ubuntu, Cantarell, "Helvetica Neue", sans-serif;
  font-size: 15px;
  line-height: 1.55;
  background: var(--ur-bg);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* { box-sizing: border-box; }
button { font-family: inherit; cursor: pointer; }

/* Widget root has no own padding/max-width — the host page container
   decides the width and breathing room. Avoids the "double padding"
   look when the widget sits inside a theme container that already has
   spacing. */
.ur-root { width: 100%; margin: 0; padding: 0; }

/* ── Summary header ───────────────────────────────────────────────────────── */
.ur-summary {
  display: grid;
  grid-template-columns: minmax(180px, 240px) 1fr auto;
  gap: 32px;
  align-items: center;
  padding: 8px 0 24px;
  border-bottom: 1px solid var(--ur-border-soft);
}

.ur-hero { display: flex; flex-direction: column; gap: 4px; }
.ur-hero-rating {
  font-size: 48px; font-weight: 700; line-height: 1; color: var(--ur-text);
  letter-spacing: -0.02em;
}
.ur-hero-stars { display: flex; gap: 2px; margin-top: 4px; }
.ur-hero-count { font-size: 14px; color: var(--ur-text-soft); margin-top: 4px; }

.ur-dist { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.ur-dist-row {
  display: grid;
  grid-template-columns: 24px 1fr 36px;
  gap: 10px;
  align-items: center;
  cursor: pointer;
  user-select: none;
  font-size: 13px;
  color: var(--ur-text-soft);
  transition: opacity 0.15s;
}
.ur-dist-row:hover { opacity: 0.85; }
.ur-dist-row.active { font-weight: 600; color: var(--ur-text); }
.ur-dist-label { display: flex; align-items: center; gap: 4px; }
.ur-dist-star { color: var(--ur-star); font-size: 12px; }
.ur-dist-bar {
  height: 8px; background: var(--ur-border-soft); border-radius: 999px;
  overflow: hidden; position: relative;
}
.ur-dist-fill {
  position: absolute; inset: 0 auto 0 0; background: var(--ur-star);
  border-radius: 999px; transition: width 0.4s ease;
}
.ur-dist-count { font-variant-numeric: tabular-nums; text-align: right; }

.ur-write-btn {
  background: var(--ur-accent);
  color: #fff;
  border: none;
  padding: 14px 28px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  white-space: nowrap;
  transition: transform 0.1s, filter 0.15s;
}
.ur-write-btn:hover { filter: brightness(1.05); }
.ur-write-btn:active { transform: translateY(1px); }

/* ── Toolbar ──────────────────────────────────────────────────────────────── */
.ur-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 0;
  border-bottom: 1px solid var(--ur-border-soft);
}
.ur-showing { font-size: 13px; color: var(--ur-text-soft); }
.ur-filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }

.ur-chip {
  border: 1px solid var(--ur-border);
  background: var(--ur-surface);
  color: var(--ur-text-soft);
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.15s;
}
.ur-chip:hover { border-color: var(--ur-text-muted); color: var(--ur-text); }
.ur-chip.active {
  background: var(--ur-accent-soft);
  border-color: var(--ur-accent);
  color: var(--ur-accent);
  font-weight: 600;
}

.ur-select {
  border: 1px solid var(--ur-border);
  background: var(--ur-surface);
  color: var(--ur-text);
  padding: 6px 30px 6px 12px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
}

/* ── Tabs ─────────────────────────────────────────────────────────────────── */
.ur-tabs {
  display: flex;
  gap: 24px;
  border-bottom: 1px solid var(--ur-border-soft);
  margin-top: 8px;
}
.ur-tab {
  background: none;
  border: none;
  padding: 14px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--ur-text-soft);
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
}
.ur-tab:hover { color: var(--ur-text); }
.ur-tab.active {
  color: var(--ur-text);
  border-bottom-color: var(--ur-accent);
}

/* ── Review list layouts ──────────────────────────────────────────────────── */
.ur-list { padding: 20px 0; }
.ur-list.layout-grid {
  display: grid;
  /* Desktop: fixed 4-column grid. Tablet/mobile breakpoints below collapse
     to 2 and 1 columns respectively. */
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}
.ur-list.layout-default { display: flex; flex-direction: column; gap: 12px; }
.ur-list.layout-compact { display: flex; flex-direction: column; gap: 0; }
.ur-list.layout-carousel {
  display: flex; gap: 16px; overflow-x: auto; padding-bottom: 8px;
  scroll-snap-type: x mandatory;
}
.ur-list.layout-carousel .ur-card {
  min-width: 320px; max-width: 320px; flex-shrink: 0; scroll-snap-align: start;
}
.ur-list.layout-grid .ur-card-body { -webkit-line-clamp: 4; }

/* ── Card ─────────────────────────────────────────────────────────────────── */
.ur-card {
  background: var(--ur-surface);
  border: 1px solid var(--ur-border);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.ur-card:hover { border-color: var(--ur-text-muted); }

.ur-list.layout-compact .ur-card {
  border-radius: 0; border-width: 0 0 1px 0; padding: 16px 0; gap: 8px;
}
.ur-list.layout-compact .ur-card:hover { border-color: var(--ur-border); }

.ur-card-head {
  display: flex; align-items: center; gap: 10px;
}
.ur-avatar {
  width: 32px; height: 32px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-weight: 600; font-size: 13px; flex-shrink: 0;
}
.ur-avatar-img { object-fit: cover; display: block; }
.ur-author {
  display: flex; flex-direction: column; min-width: 0; flex: 1;
}
.ur-author-line {
  display: flex; align-items: center; gap: 6px; font-size: 14px;
  font-weight: 600; color: var(--ur-text);
}
.ur-verified-badge {
  display: inline-flex; align-items: center; justify-content: center;
  width: 14px; height: 14px; border-radius: 50%; background: var(--ur-verified);
  color: #fff; font-size: 9px; flex-shrink: 0;
}
.ur-time { font-size: 12px; color: var(--ur-text-muted); }
.ur-country { font-size: 14px; line-height: 1; }

.ur-card-stars { display: flex; gap: 2px; }
.ur-card-title {
  font-size: 14px; font-weight: 600; color: var(--ur-text); margin: 0;
}
.ur-card-body {
  font-size: 14px; color: var(--ur-text); margin: 0;
  display: -webkit-box; -webkit-box-orient: vertical;
  -webkit-line-clamp: 6; overflow: hidden; word-break: break-word;
}

.ur-media-row { display: flex; gap: 6px; flex-wrap: wrap; }
.ur-media-thumb {
  width: 56px; height: 56px; border-radius: 6px; object-fit: cover;
  border: 1px solid var(--ur-border); cursor: pointer; position: relative;
}
.ur-media-thumb.video::after {
  content: '▶'; position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.4); color: #fff; border-radius: 6px;
}

.ur-reply {
  background: var(--ur-surface-soft);
  border-left: 3px solid var(--ur-accent);
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--ur-text);
}
.ur-reply-label {
  font-size: 11px; font-weight: 700; color: var(--ur-accent);
  text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px;
}

.ur-card-foot {
  display: flex; align-items: center; gap: 12px;
  padding-top: 6px; margin-top: 4px; border-top: 1px solid var(--ur-border-soft);
}
.ur-foot-label { font-size: 12px; color: var(--ur-text-soft); margin-right: auto; }
.ur-helpful {
  display: inline-flex; align-items: center; gap: 4px;
  background: transparent; border: 1px solid var(--ur-border);
  padding: 4px 10px; border-radius: 999px; font-size: 12px;
  color: var(--ur-text-soft); transition: all 0.15s;
}
.ur-helpful:hover { background: var(--ur-surface-soft); color: var(--ur-text); }
.ur-helpful.voted { background: var(--ur-accent-soft); color: var(--ur-accent); border-color: var(--ur-accent); }

/* ── Stars ────────────────────────────────────────────────────────────────── */
.ur-star { color: var(--ur-star); font-size: 14px; line-height: 1; }
.ur-star.empty { color: var(--ur-star-empty); }
.ur-hero-stars .ur-star { font-size: 22px; }

/* Custom brand-icon variant. Renders a CSS-masked rectangle so the same
 * uploaded asset paints both filled and empty states — filled inherits
 * --ur-star, empty falls back to --ur-star-empty. Sizes track the glyph
 * font-size by default and scale up inside the hero. */
.ur-star.ur-star-img {
  display: inline-block;
  width: 1em;
  height: 1em;
  background-color: var(--ur-star);
  -webkit-mask-image: var(--ur-icon-url);
          mask-image: var(--ur-icon-url);
  -webkit-mask-repeat: no-repeat;
          mask-repeat: no-repeat;
  -webkit-mask-position: center;
          mask-position: center;
  -webkit-mask-size: contain;
          mask-size: contain;
  vertical-align: -2px;
}
.ur-star.ur-star-img.empty { background-color: var(--ur-star-empty); }
.ur-hero-stars .ur-star.ur-star-img { width: 22px; height: 22px; }
.ur-rating-picker .ur-icon-inline {
  display: inline-block;
  width: 28px;
  height: 28px;
}

/* Inline mark for dist label / Q&A pills / etc. — single masked dot
 * sized to match surrounding text. */
.ur-icon-inline {
  display: inline-block;
  width: 0.85em;
  height: 0.85em;
  background-color: currentColor;
  -webkit-mask-image: var(--ur-icon-url);
          mask-image: var(--ur-icon-url);
  -webkit-mask-repeat: no-repeat;
          mask-repeat: no-repeat;
  -webkit-mask-position: center;
          mask-position: center;
  -webkit-mask-size: contain;
          mask-size: contain;
  vertical-align: -2px;
}

/* ── Pagination ───────────────────────────────────────────────────────────── */
.ur-pagination {
  display: flex; justify-content: center; align-items: center;
  gap: 6px; padding: 24px 0;
}
.ur-page-btn {
  background: var(--ur-surface);
  border: 1px solid var(--ur-border);
  color: var(--ur-text);
  min-width: 36px; height: 36px; padding: 0 10px;
  border-radius: 8px; font-size: 13px; font-weight: 500;
  transition: all 0.15s;
}
.ur-page-btn:hover:not(:disabled) { border-color: var(--ur-text-muted); }
.ur-page-btn.active {
  background: var(--ur-accent); color: #fff; border-color: var(--ur-accent);
}
.ur-page-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── Empty / loading ──────────────────────────────────────────────────────── */
.ur-empty, .ur-loading {
  text-align: center; padding: 60px 16px; color: var(--ur-text-soft); font-size: 14px;
}
.ur-spinner {
  width: 24px; height: 24px; margin: 0 auto 12px;
  border: 2.5px solid var(--ur-border); border-top-color: var(--ur-accent);
  border-radius: 50%; animation: ur-spin 0.7s linear infinite;
}
@keyframes ur-spin { to { transform: rotate(360deg); } }

/* ── Form ─────────────────────────────────────────────────────────────────── */
.ur-form-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center; padding: 16px;
  z-index: 9999; animation: ur-fade 0.2s;
}
@keyframes ur-fade { from { opacity: 0; } to { opacity: 1; } }
.ur-form {
  background: var(--ur-surface); border-radius: 12px; padding: 24px;
  max-width: 480px; width: 100%; max-height: 90vh; overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
}
.ur-form-title {
  margin: 0 0 16px; font-size: 18px; font-weight: 700; color: var(--ur-text);
}
.ur-field { margin-bottom: 14px; }
.ur-label {
  display: block; font-size: 12px; font-weight: 600; color: var(--ur-text-soft);
  margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.04em;
}
.ur-input, .ur-textarea {
  width: 100%; padding: 10px 12px; border: 1px solid var(--ur-border);
  border-radius: 8px; font-size: 14px; color: var(--ur-text);
  background: var(--ur-surface); font-family: inherit;
}
.ur-input:focus, .ur-textarea:focus {
  outline: none; border-color: var(--ur-accent);
  box-shadow: 0 0 0 3px var(--ur-accent-soft);
}
.ur-textarea { min-height: 100px; resize: vertical; }

.ur-file-trigger {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 12px; border: 1px dashed var(--ur-border);
  border-radius: 8px; cursor: pointer; transition: all 0.15s;
}
.ur-file-trigger:hover { border-color: var(--ur-accent); background: var(--ur-surface-soft); }
.ur-file-cta { font-size: 13px; font-weight: 600; color: var(--ur-accent); }
.ur-file-hint { font-size: 11px; color: var(--ur-text-muted); }

.ur-rating-picker { display: flex; gap: 4px; margin-bottom: 6px; }
.ur-rating-picker button {
  background: none; border: none; padding: 4px; font-size: 28px;
  color: var(--ur-star-empty); transition: color 0.1s;
}
.ur-rating-picker button.lit { color: var(--ur-star); }

.ur-form-error { color: var(--ur-danger); font-size: 12px; margin-top: -8px; margin-bottom: 12px; }
.ur-form-success {
  background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0;
  padding: 12px; border-radius: 8px; font-size: 14px; margin-bottom: 12px;
}

.ur-form-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
.ur-btn {
  padding: 10px 18px; border-radius: 8px; font-size: 14px; font-weight: 600;
  border: 1px solid var(--ur-border); background: var(--ur-surface); color: var(--ur-text);
  transition: all 0.15s;
}
.ur-btn:hover { background: var(--ur-surface-soft); }
.ur-btn.primary { background: var(--ur-accent); color: #fff; border-color: var(--ur-accent); }
.ur-btn.primary:hover { filter: brightness(1.05); }
.ur-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Q&A ──────────────────────────────────────────────────────────────────── */
.ur-qa-head {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 16px 0; border-bottom: 1px solid var(--ur-border-soft);
}
.ur-qa-title { font-size: 16px; font-weight: 700; color: var(--ur-text); margin: 0; }
.ur-qa-sub { font-size: 13px; color: var(--ur-text-soft); margin-top: 2px; }
.ur-qa-ask-btn {
  background: var(--ur-accent); color: #fff; border: none;
  padding: 10px 18px; border-radius: 6px; font-size: 13px; font-weight: 700;
  letter-spacing: 0.04em; transition: filter 0.15s, transform 0.1s; white-space: nowrap;
}
.ur-qa-ask-btn:hover { filter: brightness(1.05); }
.ur-qa-ask-btn:active { transform: translateY(1px); }

.ur-qa-list { display: flex; flex-direction: column; gap: 12px; padding: 20px 0; }
.ur-qa-card {
  background: var(--ur-surface);
  border: 1px solid var(--ur-border);
  border-radius: 12px;
  padding: 16px;
  display: flex; flex-direction: column; gap: 10px;
}
.ur-qa-q {
  display: flex; align-items: flex-start; gap: 10px; font-size: 14px;
}
.ur-qa-q-mark {
  flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%;
  background: var(--ur-accent); color: #fff; font-size: 12px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.ur-qa-q-body { color: var(--ur-text); flex: 1; }
.ur-qa-meta { font-size: 12px; color: var(--ur-text-muted); margin-top: 4px; }
.ur-qa-a {
  margin-left: 32px; padding: 10px 12px;
  background: var(--ur-surface-soft);
  border-left: 3px solid var(--ur-accent);
  border-radius: 6px;
  font-size: 13px; color: var(--ur-text);
}
.ur-qa-a-label {
  font-size: 11px; font-weight: 700; color: var(--ur-accent);
  text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px;
}
.ur-qa-pending {
  margin-left: 32px; font-size: 12px; font-style: italic; color: var(--ur-text-muted);
}

/* ── Lightbox ─────────────────────────────────────────────────────────────── */
.ur-lightbox {
  position: fixed; inset: 0; background: rgba(0,0,0,0.85);
  display: flex; align-items: center; justify-content: center;
  z-index: 99999; cursor: zoom-out;
}
.ur-lightbox img, .ur-lightbox video {
  max-width: 90%; max-height: 90%; border-radius: 4px;
}

/* ── Responsive ───────────────────────────────────────────────────────────── */
/* Tablet: 2 columns */
/* ── Showcase layout (vitrine de e-commerce) ─────────────────────────────── */
.ur-sc-summary {
  border: 1px solid var(--ur-border); border-radius: 12px;
  padding: 20px; margin-bottom: 20px; background: var(--ur-surface);
}
.ur-sc-top { display: grid; grid-template-columns: minmax(200px, 280px) 1fr; gap: 24px; align-items: start; }
.ur-sc-score { display: flex; align-items: center; gap: 10px; }
.ur-sc-avg { font-size: 40px; font-weight: 800; line-height: 1; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.ur-sc-score .ur-star { font-size: 20px; }
.ur-sc-score .ur-star.ur-star-img { width: 20px; height: 20px; }
.ur-sc-count { margin-top: 8px; font-size: 12px; color: var(--ur-text-soft); }
.ur-sc-count strong { color: var(--ur-text); font-weight: 600; }
.ur-sc-recommend {
  margin-top: 12px; display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 10px; border-radius: 8px; background: #f0fdf4; color: #166534; font-size: 12px;
}
.ur-sc-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ur-verified); flex-shrink: 0; }
.ur-sc-write {
  margin-top: 14px; display: block; width: 100%; background: var(--ur-text); color: #fff;
  border: none; border-radius: 8px; padding: 12px 16px; font-size: 13px; font-weight: 600;
}
.ur-sc-write:hover { opacity: .9; }
.ur-sc-dist { background: var(--ur-surface-soft); border-radius: 10px; padding: 12px 16px; display: flex; flex-direction: column; gap: 6px; }
.ur-sc-media { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--ur-border-soft); }
.ur-sc-media-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 10px; }
.ur-sc-media-title { font-size: 13px; font-weight: 600; }
.ur-sc-link { background: none; border: none; padding: 0; font-size: 12px; color: var(--ur-text); text-decoration: underline; }
.ur-sc-thumbs { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; }
.ur-sc-thumbs::-webkit-scrollbar { display: none; }
.ur-sc-thumb {
  position: relative; width: 64px; height: 64px; flex-shrink: 0; border-radius: 6px;
  object-fit: cover; background: var(--ur-border-soft) center/cover; border: 1px solid var(--ur-border); cursor: zoom-in;
}
.ur-sc-thumb.video::after {
  content: '▶'; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 16px; text-shadow: 0 1px 3px rgba(0,0,0,.5);
}
.ur-sc-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 6px; }
.ur-sc-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.ur-sc-chip {
  display: inline-flex; align-items: center; gap: 4px; padding: 6px 12px; border-radius: 999px;
  border: 1px solid var(--ur-border); background: var(--ur-surface); color: var(--ur-text); font-size: 12px;
}
.ur-sc-chip sup { font-size: 9px; opacity: .75; }
.ur-sc-chip .ur-star { font-size: 12px; }
.ur-sc-chip.active { background: var(--ur-text); border-color: var(--ur-text); color: #fff; }
.ur-sc-sort { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--ur-text-soft); }
.ur-sc-note { font-size: 11px; color: var(--ur-text-muted); margin: 6px 0 12px; }
.ur-sc-list { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
.ur-sc-card { display: flex; gap: 12px; padding: 14px 16px; border: 1px solid var(--ur-border); border-radius: 10px; background: var(--ur-surface); }
.ur-sc-avatar {
  width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0; object-fit: cover;
  background: var(--ur-border-soft); color: var(--ur-text-soft);
  display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600;
}
.ur-sc-main { min-width: 0; flex: 1; }
.ur-sc-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ur-sc-name { font-size: 13px; font-weight: 600; }
.ur-sc-badge { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 500; }
.ur-sc-verified { background: #f0fdf4; color: #166534; }
.ur-sc-ai { background: var(--ur-border-soft); color: var(--ur-text); border: 1px solid var(--ur-border); font-size: 12px; }
.ur-sc-meta { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
.ur-sc-meta .ur-star { font-size: 13px; }
.ur-sc-date { font-size: 12px; color: var(--ur-text-soft); }
.ur-sc-title { margin: 8px 0 0; font-size: 14px; font-weight: 600; }
.ur-sc-body { margin: 6px 0 0; font-size: 13px; color: var(--ur-text); white-space: pre-line; overflow-wrap: anywhere; }
.ur-sc-more { display: flex; flex-direction: column; align-items: center; gap: 8px; margin-top: 18px; }
.ur-sc-more-btn { padding: 10px 20px; border: 1px solid var(--ur-border); border-radius: 8px; background: var(--ur-surface); font-size: 13px; color: var(--ur-text); }
.ur-sc-more-btn:disabled { opacity: .6; cursor: default; }
.ur-sc-shown { font-size: 11px; color: var(--ur-text-muted); }
@media (max-width: 640px) {
  .ur-sc-top { grid-template-columns: 1fr; gap: 16px; }
  .ur-sc-toolbar { flex-direction: column; align-items: stretch; }
}

@media (max-width: 1023px) {
  .ur-list.layout-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
}
/* Mobile: 1 column (vertical stack) */
@media (max-width: 640px) {
  .ur-summary {
    grid-template-columns: 1fr; gap: 20px; text-align: left;
  }
  .ur-hero { align-items: flex-start; }
  .ur-write-btn { width: 100%; }
  .ur-list.layout-grid { grid-template-columns: 1fr; gap: 12px; }
  .ur-toolbar { flex-direction: column; align-items: flex-start; }
}
`

// ─── Component ───────────────────────────────────────────────────────────────

interface VoteState { [reviewId: string]: 'helpful' | 'unhelpful' | undefined }

class UniverReviewsWidget extends HTMLElement {
  private shadow: ShadowRoot
  private productId = ''
  private apiUrl = 'https://api.univerreviews.com'
  private layout: Layout = 'default'
  private locale = 'pt-BR'
  private themeColor = '#d4a850'
  private starColor  = '#fbbf24'
  private starShape: StarShape = 'star'
  // Custom brand-icon URL (SVG/PNG). When set, every star slot renders as
  // a CSS-masked rectangle so the artwork inherits `starColor` for filled
  // positions and the inactive border color for empty positions. Falls
  // back to the glyph-based starShape when null.
  private starIconUrl: string | null = null
  private showWriteReview = true
  private showQa = true
  private customCss = ''

  // Per-attribute precedence flags — set true the moment the host page
  // ships an explicit attribute. The remote widget-config is then merged
  // in only for the keys the page did NOT override (attribute > workspace
  // setting > built-in default).
  private attrSet = {
    layout: false,
    locale: false,
    themeColor: false,
    starColor: false,
    starShape: false,
    perPage: false,
    showQa: false,
    showWriteReview: false,
    showReviews: false,
    customCss: false,
  }

  // Q&A-only mode. When show-reviews="false" we hide the reviews tab AND
  // default activeTab to 'qa' so the host can drop <univer-reviews show-reviews="false">
  // (or use the [univer_qa] shortcode) to render just the question panel.
  private showReviews = true

  private reviews: Review[] = []
  private summary: ReviewSummary | null = null
  private questions: PublicQuestion[] = []
  private questionsLoaded = false

  private activeTab: ActiveTab = 'reviews'

  private currentPage = 1
  private totalPages = 1
  private totalCount = 0
  private perPage = 5

  private ratingFilter: RatingFilter = 0
  private mediaFilter: MediaFilter = 'all'
  private sortMode: SortMode = 'created_at'

  private loading = true
  private votes: VoteState = {}

  // Layout `showcase`: miniaturas da faixa "Fotos e vídeos de clientes" e o
  // estado do botão "Carregar mais", que acumula páginas em vez de trocá-las.
  private mediaStrip: ReviewMedia[] = []
  private loadingMore = false

  private showReviewForm = false
  private showQuestionForm = false
  private formSuccess: string | null = null

  // Cached workspace config so we only fetch once per element instance.
  private workspaceConfigLoaded = false

  constructor() {
    super()
    this.shadow = this.attachShadow({ mode: 'open' })
  }

  static get observedAttributes(): string[] {
    return [
      'workspace-id', 'product-id', 'api-url', 'layout', 'locale',
      'theme-color', 'star-color', 'star-shape', 'show-qa', 'show-reviews',
      'show-write-review', 'per-page', 'featured', 'limit', 'min-rating',
    ]
  }

  private featuredMode = false
  private featuredLimit = 30
  private featuredMinRating = 4

  connectedCallback() {
    this.readAttrs()
    this.loadVotes()
    // Fire workspace config + data fetch in parallel. Config result is
    // applied before render() inside fetchAll so the storefront ends up
    // painted exactly once with the merged settings.
    void this.fetchWorkspaceConfig().then(() => this.fetchAll())
  }

  attributeChangedCallback() {
    this.readAttrs()
    this.render()
  }

  private readAttrs() {
    this.productId      = this.getAttribute('product-id') || ''
    this.apiUrl         = this.getAttribute('api-url') || this.apiUrl

    const layoutAttr = this.getAttribute('layout')
    if (layoutAttr) { this.layout = layoutAttr as Layout; this.attrSet.layout = true }

    const localeAttr = this.getAttribute('locale')
    if (localeAttr) { this.locale = localeAttr; this.attrSet.locale = true }

    const themeAttr = this.getAttribute('theme-color')
    if (themeAttr) { this.themeColor = themeAttr; this.attrSet.themeColor = true }

    // Star color and shape are now per-element attributes too (in addition to
    // the workspace-config fetch). Lets the host page override stars without
    // touching the theme accent color used on buttons/links.
    const starColorAttr = this.getAttribute('star-color')
    if (starColorAttr) { this.starColor = starColorAttr; this.attrSet.starColor = true }
    const starShapeAttr = this.getAttribute('star-shape') as StarShape | null
    if (starShapeAttr && ['star','heart','flame','thumb','diamond'].includes(starShapeAttr)) {
      this.starShape = starShapeAttr
      this.attrSet.starShape = true
    }

    // Custom CSS — host page can inject site-specific styles via a child
    // <template data-custom-css>…</template> element OR via the custom-css
    // attribute (capped at 20 KB by the WP plugin). Both override the
    // workspace-wide custom CSS from the dashboard config.
    const customCssTpl = this.querySelector('template[data-custom-css]') as HTMLTemplateElement | null
    if (customCssTpl?.content) {
      const css = customCssTpl.innerHTML.trim()
      if (css) {
        this.customCss = css
        this.attrSet.customCss = true
      }
    } else {
      const customCssAttr = this.getAttribute('custom-css')
      if (customCssAttr && customCssAttr.length > 0) {
        this.customCss = customCssAttr
        this.attrSet.customCss = true
      }
    }

    if (this.hasAttribute('show-write-review')) {
      this.showWriteReview = this.getAttribute('show-write-review') !== 'false'
      this.attrSet.showWriteReview = true
    }
    if (this.hasAttribute('show-qa')) {
      this.showQa = this.getAttribute('show-qa') !== 'false'
      this.attrSet.showQa = true
    }
    if (this.hasAttribute('show-reviews')) {
      this.showReviews = this.getAttribute('show-reviews') !== 'false'
      this.attrSet.showReviews = true
      // Q&A-only: hiding reviews must imply showing Q&A; otherwise the
      // widget would render an empty shell.
      if (!this.showReviews) {
        this.showQa = true
        this.activeTab = 'qa'
      }
    }
    const pp = parseInt(this.getAttribute('per-page') || '', 10)
    if (pp > 0 && pp <= 100) { this.perPage = pp; this.attrSet.perPage = true }
    this.featuredMode = this.getAttribute('featured') === 'true'
    const lim = parseInt(this.getAttribute('limit') || '', 10)
    if (lim > 0) this.featuredLimit = Math.min(lim, 100)
    const mr = parseInt(this.getAttribute('min-rating') || '', 10)
    if (mr >= 1 && mr <= 5) this.featuredMinRating = mr
  }

  // Fetch workspace-level customization from the API and merge it into the
  // current settings, respecting per-attribute precedence: any attribute
  // the host page set explicitly is preserved; everything else picks up
  // the workspace value. Theme/star color and custom CSS always come from
  // the workspace if it provides them (those have no per-element override).
  private async fetchWorkspaceConfig(): Promise<void> {
    if (this.workspaceConfigLoaded) return
    try {
      const r = await fetch(`${this.apiUrl}/api/v1/public/widget-config`, {
        headers: { 'X-Univer-Domain': window.location.hostname },
      })
      if (!r.ok) { this.workspaceConfigLoaded = true; return }
      const json = await r.json()
      const cfg: WidgetConfig = json?.data || {}

      if (!this.attrSet.layout && cfg.layout)         this.layout         = cfg.layout
      if (!this.attrSet.locale && cfg.locale)         this.locale         = cfg.locale
      if (!this.attrSet.themeColor && cfg.theme_color) this.themeColor    = cfg.theme_color
      if (!this.attrSet.showQa && typeof cfg.show_qa === 'boolean')
        this.showQa = cfg.show_qa
      if (!this.attrSet.showWriteReview && typeof cfg.show_write_review === 'boolean')
        this.showWriteReview = cfg.show_write_review
      if (!this.attrSet.perPage && typeof cfg.per_page === 'number' && cfg.per_page > 0)
        this.perPage = Math.min(cfg.per_page, 100)

      // Star color + shape now have per-element attribute overrides — the
      // workspace config is the fallback when the host page didn't set them.
      if (!this.attrSet.starColor && cfg.star_color) this.starColor = cfg.star_color
      if (!this.attrSet.starShape && cfg.star_shape) this.starShape = cfg.star_shape
      // The custom brand icon has no per-element attribute — it's a
      // workspace-level setting only, so we always take whatever the
      // backend sent. `null` clears any stale value from a previous load.
      this.starIconUrl = cfg.star_icon_url ?? null
      if (!this.attrSet.customCss && cfg.custom_css) this.customCss = cfg.custom_css
    } catch (e) {
      console.warn('[univer-reviews] widget-config', e instanceof Error ? e.message : 'unknown')
    } finally {
      this.workspaceConfigLoaded = true
    }
  }

  private t(key: string): string {
    return i18n[this.locale]?.[key] ?? i18n['pt-BR'][key] ?? key
  }

  // ─── Vote persistence (localStorage) ─────────────────────────────────────
  private voteStorageKey() { return `ur-votes-${this.productId}` }

  private loadVotes() {
    try {
      const raw = localStorage.getItem(this.voteStorageKey())
      if (raw) this.votes = JSON.parse(raw)
    } catch { /* ignore */ }
  }

  private saveVotes() {
    try {
      localStorage.setItem(this.voteStorageKey(), JSON.stringify(this.votes))
    } catch { /* ignore */ }
  }

  // ─── Data fetching ──────────────────────────────────────────────────────
  private async fetchAll() {
    if (this.featuredMode) {
      this.loading = true
      this.render()
      try { await this.fetchFeatured() }
      catch (e) { console.warn('[univer-reviews]', e instanceof Error ? e.message : 'unknown') }
      this.loading = false
      this.render()
      return
    }

    if (!this.productId) {
      this.loading = false
      this.render()
      return
    }
    this.loading = true
    this.render()
    try {
      // Q&A-only mode: skip review/summary fetches so the panel doesn't
      // spin or surface unrelated network errors.
      const tasks: Promise<void>[] = this.showReviews
        ? [this.fetchSummary(), this.fetchReviews()]
        : []
      if (this.showReviews && this.layout === 'showcase') tasks.push(this.fetchMediaStrip())
      if (this.showQa) tasks.push(this.fetchQuestions())
      await Promise.all(tasks)
    } catch (e) {
      console.warn('[univer-reviews]', e instanceof Error ? e.message : 'unknown')
    }
    this.loading = false
    this.render()
  }

  private async fetchFeatured() {
    const params = new URLSearchParams({
      limit: String(this.featuredLimit),
      min_rating: String(this.featuredMinRating),
    })
    const r = await fetch(`${this.apiUrl}/api/v1/public/featured?${params}`, {
      headers: { 'X-Univer-Domain': window.location.hostname },
    })
    if (!r.ok) return
    const json = await r.json()
    this.reviews = json.data || []
    this.totalCount = json.meta?.total || this.reviews.length
    this.totalPages = 1
    this.summary = null
  }

  private async fetchQuestions() {
    if (!this.productId) return
    const r = await fetch(`${this.apiUrl}/api/v1/public/questions/${this.productId}`, {
      headers: { 'X-Univer-Domain': window.location.hostname },
    })
    if (!r.ok) {
      this.questionsLoaded = true
      return
    }
    const json = await r.json()
    this.questions = json.data || []
    this.questionsLoaded = true
  }

  private async fetchSummary() {
    const r = await fetch(`${this.apiUrl}/api/v1/public/summary/${this.productId}`, {
      headers: { 'X-Univer-Domain': window.location.hostname },
    })
    if (!r.ok) return
    const json = await r.json()
    this.summary = json.data
  }

  private async fetchReviews(append = false) {
    const params = new URLSearchParams({
      page: String(this.currentPage),
      per_page: String(this.perPage),
      sort: this.sortMode,
    })
    if (this.ratingFilter > 0) params.set('rating', String(this.ratingFilter))
    if (this.mediaFilter === 'with_photo') params.set('with_photo', 'true')
    if (this.mediaFilter === 'with_video') params.set('with_video', 'true')
    if (this.mediaFilter === 'with_media') params.set('with_media', 'true')
    if (this.mediaFilter === 'verified') params.set('verified', 'true')

    const r = await fetch(
      `${this.apiUrl}/api/v1/public/reviews/${this.productId}?${params}`,
      { headers: { 'X-Univer-Domain': window.location.hostname } }
    )
    if (!r.ok) {
      console.warn('[univer-reviews] HTTP', r.status)
      return
    }
    const json = await r.json()
    const page: Review[] = json.data || []
    this.reviews = append ? this.reviews.concat(page) : page
    this.totalPages = json.meta?.total_pages || 1
    this.totalCount = json.meta?.total_count || 0
  }

  // Faixa de mídia do layout `showcase`: as fotos e vídeos das avaliações
  // mais recentes que têm mídia, independente dos filtros da lista.
  private async fetchMediaStrip() {
    const params = new URLSearchParams({ page: '1', per_page: '12', sort: 'created_at', with_media: 'true' })
    const r = await fetch(
      `${this.apiUrl}/api/v1/public/reviews/${this.productId}?${params}`,
      { headers: { 'X-Univer-Domain': window.location.hostname } }
    )
    if (!r.ok) return
    const json = await r.json()
    const reviews: Review[] = json.data || []
    this.mediaStrip = reviews.reduce<ReviewMedia[]>((acc, rv) => acc.concat(rv.media || []), []).slice(0, 8)
  }

  private async loadMore() {
    if (this.loadingMore || this.currentPage >= this.totalPages) return
    this.loadingMore = true
    this.currentPage += 1
    this.render()
    try { await this.fetchReviews(true) }
    catch (e) {
      this.currentPage -= 1
      console.warn('[univer-reviews]', e instanceof Error ? e.message : 'unknown')
    }
    this.loadingMore = false
    this.render()
  }

  private async refresh() {
    this.loading = true
    this.render()
    try { await this.fetchReviews() }
    catch (e) { console.warn('[univer-reviews]', e instanceof Error ? e.message : 'unknown') }
    this.loading = false
    this.render()
  }

  private async voteHelpful(reviewId: string, kind: 'helpful' | 'unhelpful') {
    const prev = this.votes[reviewId]
    // Toggle off if same vote
    if (prev === kind) {
      delete this.votes[reviewId]
      this.saveVotes()
      await fetch(`${this.apiUrl}/api/v1/public/reviews/${reviewId}/${kind}?undo=true`, {
        method: 'POST',
        headers: { 'X-Univer-Domain': window.location.hostname },
      }).catch(() => null)
      const review = this.reviews.find(r => r.id === reviewId)
      if (review) {
        if (kind === 'helpful') review.helpful_count = Math.max(0, review.helpful_count - 1)
        else review.unhelpful_count = Math.max(0, review.unhelpful_count - 1)
      }
      this.render()
      return
    }
    // If switching, undo previous first
    if (prev) {
      await fetch(`${this.apiUrl}/api/v1/public/reviews/${reviewId}/${prev}?undo=true`, {
        method: 'POST',
        headers: { 'X-Univer-Domain': window.location.hostname },
      }).catch(() => null)
      const review = this.reviews.find(r => r.id === reviewId)
      if (review) {
        if (prev === 'helpful') review.helpful_count = Math.max(0, review.helpful_count - 1)
        else review.unhelpful_count = Math.max(0, review.unhelpful_count - 1)
      }
    }
    this.votes[reviewId] = kind
    this.saveVotes()
    await fetch(`${this.apiUrl}/api/v1/public/reviews/${reviewId}/${kind}`, {
      method: 'POST',
      headers: { 'X-Univer-Domain': window.location.hostname },
    }).catch(() => null)
    const review = this.reviews.find(r => r.id === reviewId)
    if (review) {
      if (kind === 'helpful') review.helpful_count += 1
      else review.unhelpful_count += 1
    }
    this.render()
  }

  // ─── Render entrypoint ──────────────────────────────────────────────────
  private render() {
    // The custom CSS override is appended *after* the built-in stylesheet
    // so workspace overrides win cascade-wise without us trying to merge
    // selectors. We still HTML-escape only the closing-style sequence to
    // keep the workspace from breaking out of the <style> block.
    const safeCustom = this.customCss
      ? `<style data-ur="custom">${this.customCss.replace(/<\/style>/gi, '<\\/style>')}</style>`
      : ''
    this.shadow.innerHTML = `<style>${buildCSS(this.themeColor, this.starColor)}</style>${safeCustom}${this.renderRoot()}`
    this.attachEvents()
  }

  private renderRoot(): string {
    if (this.featuredMode) {
      if (this.loading) {
        return `<div class="ur-root"><div class="ur-loading"><div class="ur-spinner"></div>${this.t('loading')}</div></div>`
      }
      return `
<div class="ur-root">
  ${this.renderList()}
</div>`
    }
    if (!this.productId) {
      return `<div class="ur-root"><div class="ur-empty">product-id is required</div></div>`
    }
    const showcase = this.layout === 'showcase'
    const summary = showcase ? this.renderShowcaseSummary() : this.renderSummary()
    const toolbar = showcase ? this.renderShowcaseToolbar() : this.renderToolbar()
    if (this.loading && this.reviews.length === 0 && this.activeTab === 'reviews') {
      return `<div class="ur-root">${summary}${this.renderTabs()}${toolbar}<div class="ur-loading"><div class="ur-spinner"></div>${this.t('loading')}</div></div>`
    }
    const body = this.activeTab === 'qa'
      ? this.renderQa()
      : showcase
        ? `${toolbar}${this.renderShowcaseList()}`
        : `${toolbar}${this.renderList()}${this.totalPages > 1 ? this.renderPagination() : ''}`
    return `
<div class="ur-root">
  ${summary}
  ${this.renderTabs()}
  ${body}
  ${this.showReviewForm ? this.renderForm() : ''}
  ${this.showQuestionForm ? this.renderQuestionForm() : ''}
</div>`
  }

  // ─── Tabs ────────────────────────────────────────────────────────────────
  private renderTabs(): string {
    // Hide tab bar when only one panel is visible (either show-qa=false or
    // show-reviews=false). With only one tab there is nothing to switch to.
    if (!this.showQa) return ''
    if (!this.showReviews) return ''
    return `
<div class="ur-tabs">
  <button class="ur-tab ${this.activeTab === 'reviews' ? 'active' : ''}" data-tab="reviews">${this.t('reviews')}</button>
  <button class="ur-tab ${this.activeTab === 'qa' ? 'active' : ''}" data-tab="qa">${this.t('qa')}</button>
</div>`
  }

  // ─── Q&A ─────────────────────────────────────────────────────────────────
  private renderQa(): string {
    if (this.loading && !this.questionsLoaded) {
      return `<div class="ur-loading"><div class="ur-spinner"></div>${this.t('loading')}</div>`
    }
    const items = this.questions
    return `
<div class="ur-qa-head">
  <div>
    <h3 class="ur-qa-title">${this.t('qa')}</h3>
    <p class="ur-qa-sub">${items.length} ${this.t('qa').toLowerCase()}</p>
  </div>
  <button class="ur-qa-ask-btn" data-action="open-question-form">${this.t('ask_question')}</button>
</div>
${items.length === 0
  ? `<div class="ur-empty">${this.t('no_questions')}</div>`
  : `<div class="ur-qa-list">${items.map(q => this.renderQaCard(q)).join('')}</div>`}`
  }

  private renderQaCard(q: PublicQuestion): string {
    const time = relativeTime(q.created_at, this.locale)
    const author = q.author_name?.trim() || ''
    return `
<article class="ur-qa-card">
  <div class="ur-qa-q">
    <div class="ur-qa-q-mark">Q</div>
    <div class="ur-qa-q-body">
      ${escapeHtml(q.body)}
      <div class="ur-qa-meta">${author ? escapeHtml(author) + ' · ' : ''}${time}</div>
    </div>
  </div>
  ${q.answer
    ? `<div class="ur-qa-a">
         <div class="ur-qa-a-label">${this.t('store_reply')}</div>
         ${escapeHtml(q.answer)}
       </div>`
    : ''}
</article>`
  }

  private renderQuestionForm(): string {
    return `
<div class="ur-form-overlay" data-action="close-question-form">
  <form class="ur-form" data-action="submit-question-form" id="ur-q-form">
    <h3 class="ur-form-title">${this.t('ask_question')}</h3>
    ${this.formSuccess ? `<div class="ur-form-success">${this.formSuccess}</div>` : ''}
    <div class="ur-field">
      <label class="ur-label">${this.t('your_name')}</label>
      <input class="ur-input" name="author_name" required />
    </div>
    <div class="ur-field">
      <label class="ur-label">${this.t('your_email')}</label>
      <input class="ur-input" name="author_email" type="email" required />
    </div>
    <div class="ur-field">
      <label class="ur-label">${this.t('question_ph')}</label>
      <textarea class="ur-textarea" name="body" placeholder="${this.t('question_ph')}" required minlength="6"></textarea>
    </div>
    <div class="ur-form-actions">
      <button type="button" class="ur-btn" data-action="close-question-form">${this.t('cancel')}</button>
      <button type="submit" class="ur-btn primary">${this.t('submit')}</button>
    </div>
  </form>
</div>`
  }

  // ─── Summary header ──────────────────────────────────────────────────────
  private renderSummary(): string {
    // Q&A-only mode: no rating summary to display.
    if (!this.showReviews) return ''

    const avg = this.summary?.avg_rating ?? 0
    const total = this.summary?.total_reviews ?? 0
    const dist = this.summary?.rating_distribution ?? [5, 4, 3, 2, 1].map(r => ({ rating: r, count: 0, percentage: 0 }))

    return `
<header class="ur-summary">
  <div class="ur-hero">
    <div class="ur-hero-rating">${Number(avg).toFixed(1)}</div>
    <div class="ur-hero-stars">${this.renderStars(avg)}</div>
    <div class="ur-hero-count">${total} ${this.t('reviews')}</div>
  </div>
  <div class="ur-dist">
    ${[5, 4, 3, 2, 1].map(r => {
      const row = dist.find(d => d.rating === r) || { count: 0, percentage: 0 }
      const active = this.ratingFilter === r
      return `
      <div class="ur-dist-row ${active ? 'active' : ''}" data-rating="${r}">
        <span class="ur-dist-label">${r}<span class="ur-dist-star">${this.renderStarInline()}</span></span>
        <span class="ur-dist-bar"><span class="ur-dist-fill" style="width:${row.percentage}%"></span></span>
        <span class="ur-dist-count">${row.count}</span>
      </div>`
    }).join('')}
  </div>
  ${this.showWriteReview ? `<button class="ur-write-btn" data-action="open-form">${this.t('write_review')}</button>` : ''}
</header>`
  }

  // ─── Toolbar ─────────────────────────────────────────────────────────────
  private renderToolbar(): string {
    const start = this.totalCount === 0 ? 0 : (this.currentPage - 1) * this.perPage + 1
    const end = Math.min(this.currentPage * this.perPage, this.totalCount)
    return `
<div class="ur-toolbar">
  <div class="ur-showing">
    ${this.t('showing')} ${start}–${end} ${this.t('of')} ${this.totalCount}
  </div>
  <div class="ur-filters">
    <button class="ur-chip ${this.mediaFilter === 'all' && this.ratingFilter === 0 ? 'active' : ''}" data-media="all">
      ${this.t('all_filter')}
    </button>
    <button class="ur-chip ${this.mediaFilter === 'with_photo' ? 'active' : ''}" data-media="with_photo">
      ${this.t('with_photo')}
    </button>
    <button class="ur-chip ${this.mediaFilter === 'with_video' ? 'active' : ''}" data-media="with_video">
      ${this.t('with_video')}
    </button>
    <button class="ur-chip ${this.mediaFilter === 'verified' ? 'active' : ''}" data-media="verified">
      ${this.t('verified_filter')}
    </button>
    <select class="ur-select" data-action="sort">
      <option value="created_at" ${this.sortMode === 'created_at' ? 'selected' : ''}>${this.t('sort_recent')}</option>
      <option value="oldest" ${this.sortMode === 'oldest' ? 'selected' : ''}>${this.t('sort_oldest')}</option>
      <option value="helpful" ${this.sortMode === 'helpful' ? 'selected' : ''}>${this.t('sort_helpful')}</option>
      <option value="rating" ${this.sortMode === 'rating' ? 'selected' : ''}>${this.t('sort_rating_high')}</option>
    </select>
  </div>
</div>`
  }

  // ─── List ────────────────────────────────────────────────────────────────
  private renderList(): string {
    if (this.reviews.length === 0) {
      return `<div class="ur-empty">${this.t('no_reviews')}</div>`
    }
    return `
<div class="ur-list layout-${this.layout}">
  ${this.reviews.map(r => this.renderCard(r)).join('')}
</div>`
  }

  private renderCard(r: Review): string {
    const name = r.author_name || 'Anônimo'
    const color = avatarColor(name)
    const time = relativeTime(r.created_at, this.locale)
    const userVote = this.votes[r.id]
    // Custom uploaded avatar wins; otherwise the deterministic initials chip.
    const avatar = r.author_avatar_url
      ? `<img class="ur-avatar ur-avatar-img" src="${escapeHtml(r.author_avatar_url)}" alt="" loading="lazy" />`
      : `<div class="ur-avatar" style="background:${color}">${initialOf(name)}</div>`

    return `
<article class="ur-card" data-id="${r.id}">
  <div class="ur-card-head">
    ${avatar}
    <div class="ur-author">
      <div class="ur-author-line">
        <span>${escapeHtml(name)}</span>
        ${r.is_verified_purchase ? `<span class="ur-verified-badge" title="${this.t('verified')}">✓</span>` : ''}
      </div>
      <span class="ur-time">${time}</span>
    </div>
  </div>
  <div class="ur-card-stars">${this.renderStars(r.rating)}</div>
  ${r.title ? `<h3 class="ur-card-title">${escapeHtml(r.title)}</h3>` : ''}
  <p class="ur-card-body">${escapeHtml(r.body || '')}</p>
  ${this.renderMediaRow(r.media, 'ur-media-row', 'ur-media-thumb')}
  ${r.replies && r.replies[0] ? `
    <div class="ur-reply">
      <div class="ur-reply-label">${this.t('store_reply')}</div>
      ${escapeHtml(r.replies[0].body)}
    </div>
  ` : ''}
  <div class="ur-card-foot">
    <span class="ur-foot-label">${this.t('helpful_q')}</span>
    <button class="ur-helpful ${userVote === 'helpful' ? 'voted' : ''}" data-vote="helpful" data-id="${r.id}">
      <span>👍</span><span>${r.helpful_count || 0}</span>
    </button>
    <button class="ur-helpful ${userVote === 'unhelpful' ? 'voted' : ''}" data-vote="unhelpful" data-id="${r.id}">
      <span>👎</span><span>${r.unhelpful_count || 0}</span>
    </button>
  </div>
</article>`
  }

  // Miniaturas clicáveis (abrem o lightbox). Usada pelos cards e pela faixa
  // "Fotos e vídeos de clientes" do layout `showcase`.
  private renderMediaRow(media: ReviewMedia[], rowClass: string, thumbClass: string): string {
    if (!media || media.length === 0) return ''
    return `
    <div class="${rowClass}">
      ${media.map(m => `
        <${m.type === 'video' ? 'div' : 'img'}
          class="${thumbClass} ${m.type === 'video' ? 'video' : ''}"
          ${m.type === 'image' ? `src="${escapeHtml(m.thumb_url || m.url)}" alt="" loading="lazy"` : `style="background:url('${escapeHtml(m.thumb_url || '')}') center/cover"`}
          data-lightbox="${escapeHtml(m.url)}"
          data-type="${m.type}"
        ${m.type === 'video' ? '></div>' : '/>'}
      `).join('')}
    </div>`
  }

  // ─── Showcase layout ─────────────────────────────────────────────────────
  // Vitrine de e-commerce: resumo em card (nota, % que recomenda, botão de
  // escrever e distribuição), faixa de mídia dos clientes, chips de filtro
  // com contagem e lista em coluna única com "Carregar mais".
  //
  // Os selos só dizem o que os dados sustentam: "verificadas" e "Compra
  // verificada" vêm de `is_verified_purchase`, e uma avaliação escrita por IA
  // sempre leva o rótulo de exemplo.
  private renderShowcaseSummary(): string {
    if (!this.showReviews) return ''
    const s = this.summary
    const total = s?.total_reviews ?? 0
    const verified = s?.verified_count ?? 0
    const avg = Number(s?.avg_rating ?? 0).toLocaleString(this.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    const dist = s?.rating_distribution ?? [5, 4, 3, 2, 1].map(r => ({ rating: r, count: 0, percentage: 0 }))
    const reviewsWord = this.t('reviews').toLowerCase()
    const count = total > 0 && verified === total
      ? `<strong>${total}</strong> ${reviewsWord} ${this.t('sc_verified')}`
      : `<strong>${total}</strong> ${reviewsWord}${verified > 0 ? ` · ${verified} ${this.t('sc_verified')}` : ''}`
    const recommend = total > 0 && typeof s?.recommend_percentage === 'number'
      ? `<div class="ur-sc-recommend"><span class="ur-sc-dot"></span><span><strong>${Math.round(s.recommend_percentage)}%</strong> ${this.t('sc_recommend')}</span></div>`
      : ''

    return `
<section class="ur-sc-summary">
  <div class="ur-sc-top">
    <div>
      <div class="ur-sc-score">
        <span class="ur-sc-avg">${avg}</span>
        <span>${this.renderStars(s?.avg_rating ?? 0)}</span>
      </div>
      <div class="ur-sc-count">${count}</div>
      ${recommend}
      ${this.showWriteReview ? `<button class="ur-sc-write" data-action="open-form">${this.t('sc_write')}</button>` : ''}
    </div>
    <div class="ur-sc-dist">
      ${[5, 4, 3, 2, 1].map(r => {
        const row = dist.find(d => d.rating === r) || { count: 0, percentage: 0 }
        return `
        <div class="ur-dist-row ${this.ratingFilter === r ? 'active' : ''}" data-rating="${r}">
          <span class="ur-dist-label">${r}<span class="ur-dist-star">${this.renderStarInline()}</span></span>
          <span class="ur-dist-bar"><span class="ur-dist-fill" style="width:${row.percentage}%"></span></span>
          <span class="ur-dist-count">${row.count}</span>
        </div>`
      }).join('')}
    </div>
  </div>
  ${this.mediaStrip.length > 0 ? `
  <div class="ur-sc-media">
    <div class="ur-sc-media-head">
      <span class="ur-sc-media-title">${this.t('sc_media_title')}</span>
      <button class="ur-sc-link" data-media="with_media">${this.t('sc_media_link')}</button>
    </div>
    ${this.renderMediaRow(this.mediaStrip, 'ur-sc-thumbs', 'ur-sc-thumb')}
  </div>` : ''}
</section>`
  }

  private renderShowcaseToolbar(): string {
    const s = this.summary
    const total = s?.total_reviews ?? 0
    const media = s?.media_count ?? 0
    const allActive = this.mediaFilter === 'all' && this.ratingFilter === 0
    const starChips = (s?.rating_distribution ?? [])
      .filter(d => d.count > 0)
      .sort((a, b) => b.rating - a.rating)
      .map(d => `
      <button class="ur-sc-chip ${this.ratingFilter === d.rating ? 'active' : ''}" data-star="${d.rating}">
        ${d.rating} <span class="ur-star">${this.renderStarInline()}</span><sup>${d.count}</sup>
      </button>`).join('')
    const allVerified = total > 0 && (s?.verified_count ?? 0) === total

    return `
<div class="ur-sc-toolbar">
  <div class="ur-sc-chips">
    <button class="ur-sc-chip ${allActive ? 'active' : ''}" data-media="all">${this.t('all_filter')}<sup>${total}</sup></button>
    ${media > 0 ? `<button class="ur-sc-chip ${this.mediaFilter === 'with_media' ? 'active' : ''}" data-media="with_media">${this.t('sc_with_media')}<sup>${media}</sup></button>` : ''}
    ${starChips}
  </div>
  <label class="ur-sc-sort">${this.t('sc_sort')}
    <select class="ur-select" data-action="sort">
      <option value="created_at" ${this.sortMode === 'created_at' ? 'selected' : ''}>${this.t('sort_recent')}</option>
      <option value="oldest" ${this.sortMode === 'oldest' ? 'selected' : ''}>${this.t('sort_oldest')}</option>
      <option value="helpful" ${this.sortMode === 'helpful' ? 'selected' : ''}>${this.t('sort_helpful')}</option>
      <option value="rating" ${this.sortMode === 'rating' ? 'selected' : ''}>${this.t('sort_rating_high')}</option>
    </select>
  </label>
</div>
${allVerified ? `<div class="ur-sc-note">${this.t('sc_all_verified')}</div>` : ''}`
  }

  private renderShowcaseList(): string {
    if (this.reviews.length === 0) {
      return `<div class="ur-empty">${this.t('no_reviews')}</div>`
    }
    const hasMore = this.currentPage < this.totalPages
    return `
<div class="ur-sc-list">
  ${this.reviews.map(r => this.renderShowcaseCard(r)).join('')}
</div>
<div class="ur-sc-more">
  ${hasMore ? `<button class="ur-sc-more-btn" data-action="load-more" ${this.loadingMore ? 'disabled' : ''}>${this.loadingMore ? this.t('loading') : this.t('sc_load_more')}</button>` : ''}
  <div class="ur-sc-shown">${this.t('showing')} ${this.reviews.length} ${this.t('of')} ${this.totalCount}</div>
</div>`
  }

  private renderShowcaseCard(r: Review): string {
    const name = r.author_name || 'Anônimo'
    const avatar = r.author_avatar_url
      ? `<img class="ur-sc-avatar" src="${escapeHtml(r.author_avatar_url)}" alt="" loading="lazy" />`
      : `<div class="ur-sc-avatar">${initialOf(name)}</div>`
    const d = new Date(r.created_at)
    const date = Number.isNaN(d.getTime())
      ? ''
      : d.toLocaleDateString(this.locale, { day: '2-digit', month: '2-digit', year: 'numeric' })

    return `
<article class="ur-sc-card" data-id="${r.id}">
  ${avatar}
  <div class="ur-sc-main">
    <div class="ur-sc-head">
      <span class="ur-sc-name">${escapeHtml(name)}</span>
      ${r.is_verified_purchase ? `<span class="ur-sc-badge ur-sc-verified"><span class="ur-sc-dot"></span>${this.t('verified')}</span>` : ''}
      ${r.is_synthetic ? `<span class="ur-sc-badge ur-sc-ai">${this.t('ai_example')}</span>` : ''}
    </div>
    <div class="ur-sc-meta">
      <span>${this.renderStars(r.rating)}</span>
      ${date ? `<span class="ur-sc-date">${date}</span>` : ''}
    </div>
    ${r.title ? `<h3 class="ur-sc-title">${escapeHtml(r.title)}</h3>` : ''}
    ${r.body ? `<p class="ur-sc-body">${escapeHtml(r.body)}</p>` : ''}
    ${this.renderMediaRow(r.media, 'ur-media-row', 'ur-media-thumb')}
    ${r.replies && r.replies[0] ? `
      <div class="ur-reply">
        <div class="ur-reply-label">${this.t('store_reply')}</div>
        ${escapeHtml(r.replies[0].body)}
      </div>
    ` : ''}
  </div>
</article>`
  }

  // ─── Stars ───────────────────────────────────────────────────────────────
  private renderStars(rating: number): string {
    const r = Math.max(0, Math.min(5, Number(rating) || 0))
    const full = Math.round(r)
    let out = ''
    for (let i = 1; i <= 5; i++) {
      out += this.renderStarSlot(i > full ? 'empty' : 'full')
    }
    return out
  }

  /**
   * Single star slot. When the workspace uploaded a custom brand icon we
   * paint a CSS-masked rectangle so the artwork inherits `starColor`
   * (filled) or the muted track color (empty) without baking the tint
   * into the asset. Falls back to the glyph preset otherwise.
   *
   * Empty cells deliberately drop opacity instead of swapping color so a
   * single-color SVG still reads as "half-on" without us needing the
   * workspace to upload a second outline file.
   */
  private renderStarSlot(state: 'full' | 'empty'): string {
    if (this.starIconUrl) {
      // Background-color is set via inline style so `starColor` can
      // change at runtime without rebuilding the shadow stylesheet.
      const safeUrl = escapeHtml(this.starIconUrl).replace(/'/g, '%27')
      return `<span class="ur-star ur-star-img ${state === 'empty' ? 'empty' : ''}" style="--ur-icon-url:url('${safeUrl}')"></span>`
    }
    const glyph = starGlyph(this.starShape)
    return `<span class="ur-star ${state === 'empty' ? 'empty' : ''}">${glyph}</span>`
  }

  // Inline (non-star-shaped) rating glyph for places where we want a
  // single "★" mark next to a number — e.g., dist row label, helpful tags.
  private renderStarInline(): string {
    if (this.starIconUrl) {
      const safeUrl = escapeHtml(this.starIconUrl).replace(/'/g, '%27')
      return `<span class="ur-icon-inline" style="--ur-icon-url:url('${safeUrl}')"></span>`
    }
    return starGlyph(this.starShape)
  }

  // ─── Pagination ──────────────────────────────────────────────────────────
  private renderPagination(): string {
    const pages: (number | '…')[] = []
    const total = this.totalPages
    const cur = this.currentPage
    const push = (p: number | '…') => pages.push(p)

    if (total <= 7) {
      for (let i = 1; i <= total; i++) push(i)
    } else {
      push(1)
      if (cur > 3) push('…')
      for (let i = Math.max(2, cur - 1); i <= Math.min(total - 1, cur + 1); i++) push(i)
      if (cur < total - 2) push('…')
      push(total)
    }

    return `
<nav class="ur-pagination">
  <button class="ur-page-btn" data-page="${cur - 1}" ${cur === 1 ? 'disabled' : ''}>${this.t('previous')}</button>
  ${pages.map(p => p === '…'
    ? `<span class="ur-page-btn" style="border:none;background:none">…</span>`
    : `<button class="ur-page-btn ${p === cur ? 'active' : ''}" data-page="${p}">${p}</button>`
  ).join('')}
  <button class="ur-page-btn" data-page="${cur + 1}" ${cur === total ? 'disabled' : ''}>${this.t('next')}</button>
</nav>`
  }

  // ─── Write review form ──────────────────────────────────────────────────
  private renderForm(): string {
    return `
<div class="ur-form-overlay" data-action="close-form">
  <form class="ur-form" data-action="submit-form" id="ur-form">
    <h3 class="ur-form-title">${this.t('write_review')}</h3>
    ${this.formSuccess ? `<div class="ur-form-success">${this.formSuccess}</div>` : ''}
    <div class="ur-field">
      <label class="ur-label">${this.t('select_rating')}</label>
      <div class="ur-rating-picker" data-picker="rating">
        ${[1, 2, 3, 4, 5].map(i =>
          `<button type="button" data-rating="${i}">${this.renderStarInline()}</button>`
        ).join('')}
      </div>
      <input type="hidden" name="rating" value="0" />
    </div>
    <div class="ur-field">
      <label class="ur-label">${this.t('your_name')}</label>
      <input class="ur-input" name="author_name" required />
    </div>
    <div class="ur-field">
      <label class="ur-label">${this.t('your_email')}</label>
      <input class="ur-input" name="author_email" type="email" required />
    </div>
    <div class="ur-field">
      <input class="ur-input" name="title" placeholder="${this.t('review_title_ph')}" />
    </div>
    <div class="ur-field">
      <textarea class="ur-textarea" name="body" placeholder="${this.t('review_body_ph')}" required minlength="10"></textarea>
    </div>
    <div class="ur-field">
      <label class="ur-label">${this.t('add_photos')}</label>
      <label class="ur-file-trigger">
        <input type="file" name="media" accept="image/*,video/*" multiple hidden />
        <span class="ur-file-cta">📎 ${this.t('add_photos')}</span>
        <span class="ur-file-hint">${this.t('file_hint')}</span>
      </label>
      <div class="ur-media-row" data-preview></div>
    </div>
    <div class="ur-form-actions">
      <button type="button" class="ur-btn" data-action="close-form">${this.t('cancel')}</button>
      <button type="submit" class="ur-btn primary">${this.t('submit')}</button>
    </div>
  </form>
</div>`
  }

  // ─── Events ──────────────────────────────────────────────────────────────
  private attachEvents() {
    const root = this.shadow.querySelector('.ur-root')
    if (!root) return

    root.querySelectorAll<HTMLElement>('[data-rating]').forEach(el => {
      // Only the distribution rows in summary — picker handled separately
      if (el.closest('.ur-dist-row')) {
        el.addEventListener('click', () => {
          const r = parseInt(el.dataset.rating || '0', 10) as RatingFilter
          this.ratingFilter = this.ratingFilter === r ? 0 : r
          this.currentPage = 1
          void this.refresh()
        })
      }
    })

    root.querySelectorAll<HTMLButtonElement>('[data-media]').forEach(btn => {
      btn.addEventListener('click', () => {
        const m = btn.dataset.media as MediaFilter
        if (m === 'all') {
          this.mediaFilter = 'all'
          this.ratingFilter = 0
        } else {
          this.mediaFilter = this.mediaFilter === m ? 'all' : m
        }
        this.currentPage = 1
        void this.refresh()
      })
    })

    // Chips de nota do layout `showcase` (a distribuição usa `.ur-dist-row`).
    root.querySelectorAll<HTMLButtonElement>('[data-star]').forEach(btn => {
      btn.addEventListener('click', () => {
        const r = parseInt(btn.dataset.star || '0', 10) as RatingFilter
        this.ratingFilter = this.ratingFilter === r ? 0 : r
        this.currentPage = 1
        void this.refresh()
      })
    })

    root.querySelector('[data-action="load-more"]')?.addEventListener('click', () => {
      void this.loadMore()
    })

    root.querySelector<HTMLSelectElement>('[data-action="sort"]')?.addEventListener('change', e => {
      this.sortMode = (e.target as HTMLSelectElement).value as SortMode
      this.currentPage = 1
      void this.refresh()
    })

    root.querySelectorAll<HTMLButtonElement>('[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = parseInt(btn.dataset.page || '0', 10)
        if (p >= 1 && p <= this.totalPages) {
          this.currentPage = p
          void this.refresh()
        }
      })
    })

    root.querySelectorAll<HTMLButtonElement>('[data-vote]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id!
        const kind = btn.dataset.vote as 'helpful' | 'unhelpful'
        void this.voteHelpful(id, kind)
      })
    })

    root.querySelectorAll<HTMLElement>('[data-lightbox]').forEach(el => {
      el.addEventListener('click', () => {
        this.openLightbox(el.dataset.lightbox!, el.dataset.type as 'image' | 'video')
      })
    })

    root.querySelector('[data-action="open-form"]')?.addEventListener('click', () => {
      this.showReviewForm = true
      this.formSuccess = null
      this.render()
    })

    // Tab switching
    root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab as ActiveTab
        if (tab === this.activeTab) return
        this.activeTab = tab
        if (tab === 'qa' && !this.questionsLoaded && this.showQa) {
          void this.fetchQuestions().then(() => this.render())
        }
        this.render()
      })
    })

    // Open question form
    root.querySelector('[data-action="open-question-form"]')?.addEventListener('click', () => {
      this.showQuestionForm = true
      this.formSuccess = null
      this.render()
    })

    // Close question form (overlay click or cancel button)
    root.querySelectorAll('[data-action="close-question-form"]').forEach(el => {
      el.addEventListener('click', (e) => {
        const target = e.target as HTMLElement
        const isOverlay = target === el
        const isCancelBtn = target.dataset?.action === 'close-question-form'
        if (!isOverlay && !isCancelBtn) return
        this.showQuestionForm = false
        this.render()
      })
    })

    // Submit question form
    const qForm = root.querySelector<HTMLFormElement>('#ur-q-form')
    if (qForm) {
      qForm.addEventListener('click', (e) => e.stopPropagation())
      qForm.addEventListener('submit', async (e) => {
        e.preventDefault()
        const fd = new FormData(qForm)
        const body = String(fd.get('body') || '').trim()
        if (body.length < 6) { alert(this.t('body_required')); return }

        const payload = {
          author_name:  fd.get('author_name'),
          author_email: fd.get('author_email'),
          body,
        }
        const r = await fetch(`${this.apiUrl}/api/v1/public/questions/${this.productId}`, {
          method: 'POST',
          headers: {
            'X-Univer-Domain': window.location.hostname,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        })
        if (r.ok) {
          this.formSuccess = this.t('thank_question')
          this.render()
          setTimeout(() => {
            this.showQuestionForm = false
            this.questionsLoaded = false
            void this.fetchQuestions().then(() => this.render())
          }, 2000)
        } else {
          const err = await r.json().catch(() => ({}))
          alert(err.message || this.t('error'))
        }
      })
    }

    // Form close: only when user clicks the overlay backdrop or the
    // explicit Cancel button. Star picker / inputs / submit no longer trigger
    // close because we check data-action instead of tagName.
    root.querySelectorAll('[data-action="close-form"]').forEach(el => {
      el.addEventListener('click', (e) => {
        const target = e.target as HTMLElement
        const isOverlay = target === el
        const isCancelBtn = target.dataset?.action === 'close-form'
        if (!isOverlay && !isCancelBtn) return
        this.showReviewForm = false
        this.render()
      })
    })

    const form = root.querySelector<HTMLFormElement>('#ur-form')
    if (form) {
      // Stop any click inside form from bubbling up to the overlay close handler.
      form.addEventListener('click', (e) => e.stopPropagation())

      const picker = form.querySelector<HTMLElement>('[data-picker="rating"]')
      const ratingInput = form.querySelector<HTMLInputElement>('input[name="rating"]')
      picker?.querySelectorAll<HTMLButtonElement>('button').forEach((btn, idx) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          const v = idx + 1
          ratingInput!.value = String(v)
          picker.querySelectorAll('button').forEach((b, i) => b.classList.toggle('lit', i < v))
        })
      })

      // Media preview thumbnails as user picks files
      const fileInput = form.querySelector<HTMLInputElement>('input[name="media"]')
      const previewRow = form.querySelector<HTMLElement>('[data-preview]')
      fileInput?.addEventListener('change', () => {
        if (!previewRow || !fileInput.files) return
        previewRow.innerHTML = ''
        Array.from(fileInput.files).forEach((f) => {
          const url = URL.createObjectURL(f)
          const isVideo = f.type.startsWith('video/')
          previewRow.insertAdjacentHTML(
            'beforeend',
            isVideo
              ? `<div class="ur-media-thumb video" style="background:#1f2937"></div>`
              : `<img class="ur-media-thumb" src="${url}" alt="" />`
          )
        })
      })

      form.addEventListener('submit', async (e) => {
        e.preventDefault()
        const rating = Number(ratingInput?.value || 0)
        if (rating < 1) { alert(this.t('rating_required')); return }

        const fd = new FormData(form)
        fd.set('product_id', this.productId)
        fd.set('rating', String(rating))
        // Remove the hidden helper field so backend reads the right key
        fd.delete('media') // re-append below as media[]
        const files = fileInput?.files
        if (files && files.length > 0) {
          Array.from(files).slice(0, 5).forEach(f => fd.append('media[]', f, f.name))
        }
        const r = await fetch(`${this.apiUrl}/api/v1/public/submit`, {
          method: 'POST',
          headers: { 'X-Univer-Domain': window.location.hostname },
          body: fd,
        })
        if (r.ok) {
          this.formSuccess = this.t('thank_review')
          this.render()
          setTimeout(() => { this.showReviewForm = false; this.render(); void this.fetchAll() }, 2200)
        } else {
          const err = await r.json().catch(() => ({}))
          alert(err.message || this.t('error'))
        }
      })
    }
  }

  private openLightbox(url: string, type: 'image' | 'video') {
    const lb = document.createElement('div')
    lb.className = 'ur-lightbox'
    lb.innerHTML = type === 'video'
      ? `<video src="${url}" controls autoplay></video>`
      : `<img src="${url}" alt="" />`
    lb.addEventListener('click', () => lb.remove())
    document.body.appendChild(lb)
    const style = document.createElement('style')
    style.textContent = `
      .ur-lightbox{position:fixed;inset:0;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;z-index:99999;cursor:zoom-out}
      .ur-lightbox img,.ur-lightbox video{max-width:90%;max-height:90%;border-radius:4px}
    `
    lb.appendChild(style)
  }
}

if (!customElements.get('univer-reviews')) {
  customElements.define('univer-reviews', UniverReviewsWidget)
}

// ─── Compact summary element ────────────────────────────────────────────────
// <univer-reviews-summary product-id="123" workspace-id="..."> →
//    ★★★★★ 4.8 (123)
// Used in shop loops / product cards.

class UniverReviewsSummary extends HTMLElement {
  private shadow: ShadowRoot
  private productId = ''
  private apiUrl = 'https://api.univerreviews.com'
  private themeColor = '#d4a850'

  constructor() {
    super()
    this.shadow = this.attachShadow({ mode: 'open' })
  }

  static get observedAttributes() {
    return ['product-id', 'api-url', 'theme-color', 'workspace-id']
  }

  connectedCallback() {
    this.productId = this.getAttribute('product-id') || ''
    this.apiUrl    = this.getAttribute('api-url') || this.apiUrl
    this.themeColor = this.getAttribute('theme-color') || this.themeColor
    if (!this.productId) return
    void this.fetchAndRender()
  }

  private async fetchAndRender() {
    try {
      const r = await fetch(`${this.apiUrl}/api/v1/public/summary/${this.productId}`, {
        headers: { 'X-Univer-Domain': window.location.hostname },
      })
      if (!r.ok) return
      const json = await r.json()
      const avg = Number(json.data?.avg_rating || 0)
      const total = Number(json.data?.total_reviews || 0)
      this.render(avg, total)
    } catch { /* ignore */ }
  }

  private render(avg: number, total: number) {
    if (total === 0) { this.shadow.innerHTML = ''; return }
    const full = Math.round(avg)
    let stars = ''
    for (let i = 1; i <= 5; i++) {
      stars += `<span class="s${i > full ? ' empty' : ''}">★</span>`
    }
    this.shadow.innerHTML = `
<style>
  :host { display: inline-flex; align-items: center; gap: 6px; font-family: inherit; font-size: 13px; }
  .stars { display: inline-flex; gap: 1px; color: #fbbf24; }
  .stars .empty { color: #e5e7eb; }
  .rating { font-weight: 600; color: #111827; }
  .count { color: #6b7280; }
</style>
<span class="stars">${stars}</span>
<span class="rating">${avg.toFixed(1)}</span>
<span class="count">(${total})</span>
`
  }
}

if (!customElements.get('univer-reviews-summary')) {
  customElements.define('univer-reviews-summary', UniverReviewsSummary)
}

// ────────────────────────────────────────────────────────────────────────────
// <univer-ai-carousel> — AI-curated horizontal carousel
// ────────────────────────────────────────────────────────────────────────────
// Renders "Veja o que estão falando" with the best reviews (media + quality
// scored server-side). Self-contained, light-DOM-friendly, no external CSS.
//
// Attrs:
//   workspace-id   uuid (required)
//   product-id     uuid | handle | platform id (required)
//   api-url        defaults to https://api.univerreviews.com
//   title          PT-BR default "Veja o que estão falando"
//   limit          int, capped at 30 (default 15)
//   theme-color    hex, used on hover/CTA accents
//   star-color     hex
//
// Renders nothing if the endpoint returns zero items, so it's safe to drop
// onto every product page without conditional logic.

interface CarouselReviewMedia { type: 'image' | 'video'; url: string; thumb_url: string }
interface CarouselReview {
  id: string
  rating: number
  title: string | null
  body: string
  author_name: string | null
  is_verified_purchase: boolean
  is_featured: boolean
  helpful_count: number
  ai_quality_score: number | null
  created_at: string
  media: CarouselReviewMedia[]
  primary_media: CarouselReviewMedia | null
  product: {
    id: string
    title: string | null
    handle: string | null
    image_url: string | null
  } | null
}

// Topic-mode payload (preset="topics"). One topic = one horizontal carousel.
interface TopicReview {
  id: string
  rating: number
  title: string | null
  body: string
  author_name: string | null
  created_at: string
}
interface SummaryTopic {
  id: string
  title: string
  ai_summary: string | null
  review_count: number
  stars_avg: number | string | null
  reviews: TopicReview[]
}

class UniverAiCarousel extends HTMLElement {
  private shadow: ShadowRoot
  private productId = ''
  private apiUrl = 'https://api.univerreviews.com'
  private titleText = 'Veja o que estão falando'
  private limit = 15
  private themeColor = '#d4a850'
  private starColor = '#fbbf24'
  // 'auto' — pick topics layout if the product has curated AI topics,
  //          fall back to media carousel otherwise. Default so merchants
  //          don't need to edit shortcodes after generating topics.
  // 'carousel' — force the media-first carousel.
  // 'topics'   — force the topical stacked carousels (renders nothing
  //              if the product has no topics yet).
  private preset: 'auto' | 'carousel' | 'topics' = 'auto'
  private reviews: CarouselReview[] = []
  private topics: SummaryTopic[] = []
  private selected: CarouselReview | null = null

  constructor() {
    super()
    this.shadow = this.attachShadow({ mode: 'open' })
  }

  connectedCallback() {
    this.productId = this.getAttribute('product-id') || ''
    this.apiUrl = this.getAttribute('api-url') || this.apiUrl
    // Prefer data-title so the native browser tooltip (which kicks in for
    // a `title` attribute) doesn't render a duplicate label on hover.
    // We still accept `title` for backwards-compat with merchants who
    // were already on v0.7.x shortcodes.
    this.titleText =
      this.getAttribute('data-title') ||
      this.getAttribute('title') ||
      this.titleText
    this.themeColor = this.getAttribute('theme-color') || this.themeColor
    this.starColor = this.getAttribute('star-color') || this.starColor
    const lim = parseInt(this.getAttribute('limit') || '', 10)
    if (lim > 0 && lim <= 30) this.limit = lim
    const presetAttr = this.getAttribute('preset')
    if (presetAttr === 'topics' || presetAttr === 'carousel') this.preset = presetAttr
    if (!this.productId) return
    void this.fetchAndRender()
  }

  private async fetchAndRender() {
    try {
      // For 'auto' AND 'topics', try the topics endpoint first. 'auto' falls
      // back to the carousel when no topics exist; 'topics' renders nothing
      // (explicit opt-out of the legacy layout).
      if (this.preset === 'topics' || this.preset === 'auto') {
        const url = `${this.apiUrl}/api/v1/public/ai-summary-topics/${encodeURIComponent(this.productId)}`
        const r = await fetch(url, { headers: { 'X-Univer-Domain': window.location.hostname } })
        if (r.ok) {
          const json = await r.json()
          const tops = (Array.isArray(json.data) ? json.data : []) as SummaryTopic[]
          // Filter out topics with zero reviews — they'd render empty.
          this.topics = tops.filter(t => Array.isArray(t.reviews) && t.reviews.length > 0)
          if (this.topics.length > 0) {
            this.renderTopics()
            return
          }
        }
        // 'topics' forced + no topics → render nothing, do NOT fall through.
        if (this.preset === 'topics') { this.shadow.innerHTML = ''; return }
        // 'auto' → fall through to legacy carousel below.
      }

      const url = `${this.apiUrl}/api/v1/public/ai-carousel/${encodeURIComponent(this.productId)}?limit=${this.limit}`
      const r = await fetch(url, { headers: { 'X-Univer-Domain': window.location.hostname } })
      if (!r.ok) return
      const json = await r.json()
      this.reviews = Array.isArray(json.data) ? json.data : []
      if (this.reviews.length === 0) { this.shadow.innerHTML = ''; return }
      this.render()
    } catch { /* swallow — fail-quiet on storefront */ }
  }

  // ── preset="topics" — multiple horizontal carousels stacked vertically ───
  //
  // Editorial card: rating row → bold title → body in proper line-height →
  // author in tracked caps. Subtle border, lift on hover, accent edge on
  // the left to anchor the rhythm of stacked sections.
  private topicCardHtml(r: TopicReview): string {
    const author = (r.author_name || 'Cliente').split(' ')[0]
    const body = (r.body || '').replace(/\s+/g, ' ').trim()
    return `
<article class="t-card" role="listitem">
  <div class="t-stars">${this.starsHtml(r.rating)}</div>
  ${r.title ? `<h4 class="t-title">${escapeHtml(r.title)}</h4>` : ''}
  <p class="t-body">${escapeHtml(body)}</p>
  <div class="t-foot">
    <span class="t-avatar" aria-hidden="true">${escapeHtml(author.charAt(0).toUpperCase())}</span>
    <span class="t-author">${escapeHtml(author)}</span>
  </div>
</article>`
  }

  private renderTopics() {
    const sectionsHtml = this.topics.map((topic, idx) => {
      const stars = topic.stars_avg != null ? Number(topic.stars_avg) : null
      const headerStars = stars != null ? this.starsHtml(Math.round(stars)) : ''
      const avg = stars != null ? stars.toFixed(1) : ''
      const cards = topic.reviews.map(r => this.topicCardHtml(r)).join('')
      return `
<section class="topic" style="--delay:${idx * 0.06}s">
  <header class="topic-head">
    <div class="topic-rating">
      <span class="topic-stars">${headerStars}</span>
      ${avg ? `<span class="topic-avg">${avg}</span>` : ''}
    </div>
    <h3 class="topic-title">${escapeHtml(topic.title)}</h3>
    <span class="topic-count" aria-label="${topic.review_count} avaliações">${topic.review_count}</span>
  </header>
  ${topic.ai_summary ? `<p class="topic-summary">${escapeHtml(topic.ai_summary)}</p>` : ''}
  <div class="topic-scroller" role="list">${cards}</div>
</section>`
    }).join('')

    this.shadow.innerHTML = `
<style>
  :host {
    display: block;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #0f172a;
    margin: 40px 0;
    --accent: ${this.themeColor};
    --star: ${this.starColor};
  }
  * { box-sizing: border-box; }
  @keyframes ur-fade-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }

  /* ─── Section head ─────────────────────────────────────────────────────── */
  .head {
    margin: 0 0 28px;
    padding-bottom: 18px;
    border-bottom: 1px solid #e5e7eb;
  }
  .head h2 {
    font-size: 26px; font-weight: 700; letter-spacing: -0.02em;
    margin: 0; line-height: 1.15; color: #0f172a;
  }
  .head p {
    margin: 6px 0 0; font-size: 14px; color: #64748b;
  }

  /* ─── Topic section ────────────────────────────────────────────────────── */
  .topic {
    margin: 32px 0;
    animation: ur-fade-up 0.5s ease-out both;
    animation-delay: var(--delay);
  }
  .topic-head {
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    margin: 0 0 4px;
  }
  .topic-rating { display: inline-flex; align-items: center; gap: 6px; }
  .topic-stars { color: var(--star); font-size: 14px; letter-spacing: 1.5px; line-height: 1; white-space: nowrap; }
  .topic-stars .empty { color: #e2e8f0; }
  .topic-avg {
    font-size: 13px; font-weight: 700; color: #0f172a;
    font-variant-numeric: tabular-nums;
  }
  .topic-title {
    font-size: 19px; font-weight: 700; margin: 0;
    color: #0f172a; letter-spacing: -0.015em; line-height: 1.25;
    flex: 1; min-width: 0;
  }
  .topic-count {
    font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums;
    color: #475569; background: #f1f5f9; padding: 3px 10px; border-radius: 999px;
    letter-spacing: 0.02em; white-space: nowrap;
  }
  .topic-summary {
    margin: 4px 0 14px; font-size: 14px; line-height: 1.55;
    color: #475569; font-style: italic; max-width: 70ch;
  }

  /* ─── Scroller ─────────────────────────────────────────────────────────── */
  .topic-scroller {
    display: flex; gap: 14px;
    overflow-x: auto; overflow-y: visible;
    padding: 8px 2px 18px;
    scroll-snap-type: x mandatory;
    scrollbar-width: thin;
    scroll-padding-left: 2px;
    /* Soft fade on both edges to hint scrollability + tame the visual cut.
       Left edge fade kicks in only after the user scrolls — the initial
       paint shows cards flush to the left. */
    mask-image: linear-gradient(90deg, transparent, #000 24px, #000 calc(100% - 32px), transparent);
    -webkit-mask-image: linear-gradient(90deg, transparent, #000 24px, #000 calc(100% - 32px), transparent);
  }
  .topic-scroller::-webkit-scrollbar { height: 6px; }
  .topic-scroller::-webkit-scrollbar-track { background: transparent; }
  .topic-scroller::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 999px; }
  .topic-scroller::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

  /* ─── Card ─────────────────────────────────────────────────────────────── */
  .t-card {
    flex: 0 0 280px; scroll-snap-align: start;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 14px;
    padding: 18px 18px 16px;
    display: flex; flex-direction: column; gap: 8px;
    transition: transform .2s cubic-bezier(0.2, 0, 0.2, 1),
                border-color .2s ease,
                box-shadow .2s ease;
    position: relative;
    overflow: hidden;
  }
  .t-card::before {
    content: '';
    position: absolute;
    left: 0; top: 16px; bottom: 16px;
    width: 2px;
    background: linear-gradient(180deg, var(--accent), transparent);
    border-radius: 0 2px 2px 0;
    opacity: 0;
    transition: opacity .2s ease;
  }
  .t-card:hover {
    transform: translateY(-2px);
    border-color: var(--accent);
    box-shadow: 0 12px 28px -8px rgba(15, 23, 42, 0.12), 0 2px 4px rgba(15, 23, 42, 0.04);
  }
  .t-card:hover::before { opacity: 1; }

  .t-stars { color: var(--star); font-size: 12px; letter-spacing: 1.5px; line-height: 1; }
  .t-stars .empty { color: #e2e8f0; }
  .t-title {
    font-size: 14px; font-weight: 700; margin: 0;
    color: #0f172a; line-height: 1.35; letter-spacing: -0.005em;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .t-body {
    margin: 0; font-size: 13.5px; line-height: 1.55; color: #334155;
    display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden;
    flex: 1;
  }
  .t-foot {
    display: flex; align-items: center; gap: 8px;
    margin-top: 6px; padding-top: 10px;
    border-top: 1px solid #f1f5f9;
  }
  .t-avatar {
    width: 22px; height: 22px; border-radius: 50%;
    display: inline-flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 60%, #000));
    color: #fff; font-size: 10px; font-weight: 700; letter-spacing: 0;
    flex-shrink: 0;
  }
  .t-author {
    font-size: 12px; font-weight: 600; color: #475569;
    letter-spacing: 0.02em;
  }

  /* ─── Responsive ───────────────────────────────────────────────────────── */
  @media (max-width: 640px) {
    :host { margin: 28px 0; }
    .head h2 { font-size: 22px; }
    .head p { font-size: 13px; }
    .topic { margin: 26px 0; }
    .topic-title { font-size: 16px; }
    .topic-summary { font-size: 13px; }
    .t-card { flex-basis: 240px; padding: 16px; }
    .t-body { -webkit-line-clamp: 4; font-size: 13px; }
  }
</style>

<header class="head">
  <h2>${escapeHtml(this.titleText)}</h2>
  <p>${this.topics.length} ${this.topics.length === 1 ? 'tópico em destaque' : 'tópicos em destaque'}</p>
</header>
${sectionsHtml}
`
  }

  private starsHtml(rating: number): string {
    const full = Math.round(rating)
    let html = ''
    for (let i = 1; i <= 5; i++) {
      html += `<span class="s${i > full ? ' empty' : ''}">★</span>`
    }
    return html
  }

  private cardHtml(r: CarouselReview, idx: number): string {
    const media = r.primary_media
    const isVideo = media?.type === 'video'
    const thumb = media?.thumb_url || media?.url || (r.product?.image_url ?? '')
    const verified = r.is_verified_purchase ? '<span class="vbadge" title="Compra verificada">✓</span>' : ''
    const author = (r.author_name || 'Cliente').split(' ')[0]
    const snippet = (r.body || '').replace(/\s+/g, ' ').trim().slice(0, 110)

    return `
<button class="card" data-idx="${idx}" type="button" aria-label="Abrir avaliação de ${author}">
  <div class="media">
    ${thumb ? `<img class="thumb" loading="lazy" src="${thumb}" alt="" />` : `<div class="thumb placeholder"></div>`}
    ${isVideo ? `<div class="play" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="40" height="40"><circle cx="12" cy="12" r="11" fill="rgba(0,0,0,0.55)"/><path d="M10 8l6 4-6 4V8z" fill="#fff"/></svg>
    </div>` : ''}
    <div class="rating-pill">
      <span class="stars">${this.starsHtml(r.rating)}</span>
    </div>
  </div>
  <div class="body">
    <p class="snippet">${escapeHtml(snippet)}${snippet.length === 110 ? '…' : ''}</p>
    <div class="meta">
      <span class="author">${escapeHtml(author)} ${verified}</span>
    </div>
  </div>
</button>`
  }

  private modalHtml(r: CarouselReview): string {
    const allMedia = r.media || []
    const galleryHtml = allMedia.map(m => {
      if (m.type === 'video') {
        return `<video class="modal-media" src="${m.url}" controls playsinline preload="metadata" poster="${m.thumb_url || ''}"></video>`
      }
      return `<img class="modal-media" src="${m.url}" alt="" loading="lazy" />`
    }).join('')

    return `
<div class="modal-backdrop" data-close-modal>
  <div class="modal" role="dialog" aria-modal="true">
    <button class="modal-close" type="button" data-close-modal aria-label="Fechar">✕</button>
    <div class="modal-gallery">${galleryHtml}</div>
    <div class="modal-body">
      <div class="modal-stars">${this.starsHtml(r.rating)}</div>
      ${r.title ? `<h3 class="modal-title">${escapeHtml(r.title)}</h3>` : ''}
      <p class="modal-text">${escapeHtml(r.body || '').replace(/\n/g, '<br>')}</p>
      <div class="modal-meta">
        <strong>${escapeHtml(r.author_name || 'Cliente')}</strong>
        ${r.is_verified_purchase ? '<span class="vbadge">✓ Compra verificada</span>' : ''}
        <time>${formatDate(r.created_at)}</time>
      </div>
      ${r.product ? `<div class="modal-product">
        ${r.product.image_url ? `<img src="${r.product.image_url}" alt="" />` : ''}
        <span>${escapeHtml(r.product.title || '')}</span>
      </div>` : ''}
    </div>
  </div>
</div>`
  }

  private render() {
    const cards = this.reviews.map((r, i) => this.cardHtml(r, i)).join('')
    const modal = this.selected ? this.modalHtml(this.selected) : ''

    this.shadow.innerHTML = `
<style>
  :host { display: block; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #111827; margin: 32px 0; }
  * { box-sizing: border-box; }
  .head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin: 0 0 16px; }
  h2 { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; margin: 0; line-height: 1.2; }
  .count { font-size: 13px; color: #6b7280; }

  .scroller { display: flex; gap: 12px; overflow-x: auto; scroll-snap-type: x mandatory; padding: 4px 2px 16px; scrollbar-width: thin; }
  .scroller::-webkit-scrollbar { height: 6px; }
  .scroller::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 999px; }

  .card { flex: 0 0 220px; scroll-snap-align: start; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 0; overflow: hidden; cursor: pointer; text-align: left; font: inherit; color: inherit; transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease; }
  .card:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.08); border-color: ${this.themeColor}; }

  .media { position: relative; aspect-ratio: 3 / 4; background: #f3f4f6; }
  .thumb { width: 100%; height: 100%; object-fit: cover; display: block; }
  .thumb.placeholder { background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%); }
  .play { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; }
  .rating-pill { position: absolute; left: 8px; bottom: 8px; background: rgba(255,255,255,0.96); border-radius: 999px; padding: 4px 10px; }
  .stars { color: ${this.starColor}; font-size: 13px; letter-spacing: 1px; }
  .stars .empty { color: #e5e7eb; }

  .body { padding: 12px 14px 14px; }
  .snippet { margin: 0 0 8px; font-size: 13px; line-height: 1.45; color: #374151; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .meta { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #6b7280; }
  .author { font-weight: 600; color: #111827; }
  .vbadge { display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; border-radius: 999px; background: #10b981; color: #fff; font-size: 9px; }

  /* Modal */
  .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.65); display: flex; align-items: center; justify-content: center; z-index: 2147483646; padding: 16px; }
  .modal { background: #fff; border-radius: 16px; max-width: 640px; width: 100%; max-height: 90vh; overflow-y: auto; position: relative; }
  .modal-close { position: absolute; top: 12px; right: 12px; width: 32px; height: 32px; border-radius: 999px; border: 0; background: rgba(0,0,0,0.7); color: #fff; cursor: pointer; font-size: 14px; z-index: 1; }
  .modal-gallery { display: flex; flex-direction: column; gap: 4px; background: #000; }
  .modal-media { width: 100%; max-height: 60vh; object-fit: contain; display: block; }
  .modal-body { padding: 20px 24px 24px; }
  .modal-stars { color: ${this.starColor}; letter-spacing: 1px; font-size: 18px; margin: 0 0 8px; }
  .modal-stars .empty { color: #e5e7eb; }
  .modal-title { font-size: 18px; font-weight: 700; margin: 0 0 8px; }
  .modal-text { font-size: 15px; line-height: 1.6; color: #1f2937; margin: 0 0 14px; }
  .modal-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; font-size: 13px; color: #6b7280; padding-top: 12px; border-top: 1px solid #f3f4f6; }
  .modal-meta strong { color: #111827; }
  .modal-meta .vbadge { width: auto; height: auto; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .modal-product { display: flex; align-items: center; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #f3f4f6; font-size: 12px; color: #6b7280; }
  .modal-product img { width: 36px; height: 36px; border-radius: 8px; object-fit: cover; }

  @media (max-width: 640px) {
    .card { flex-basis: 160px; }
    h2 { font-size: 18px; }
    .snippet { -webkit-line-clamp: 2; }
  }
</style>

<div class="head">
  <h2>${escapeHtml(this.titleText)}</h2>
  <span class="count">${this.reviews.length} avaliações em destaque</span>
</div>
<div class="scroller" role="list">${cards}</div>
${modal}
`

    this.shadow.querySelectorAll('.card').forEach(el => {
      el.addEventListener('click', () => {
        const i = parseInt((el as HTMLElement).dataset.idx || '0', 10)
        this.selected = this.reviews[i] || null
        this.render()
      })
    })

    if (this.selected) {
      this.shadow.querySelectorAll('[data-close-modal]').forEach(el => {
        el.addEventListener('click', (e) => {
          if (e.target === el) { this.selected = null; this.render() }
        })
      })
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') { this.selected = null; this.render(); document.removeEventListener('keydown', onKey) }
      }
      document.addEventListener('keydown', onKey)
    }
  }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('pt-BR', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch { return '' }
}

if (!customElements.get('univer-ai-carousel')) {
  customElements.define('univer-ai-carousel', UniverAiCarousel)
}

export {}
