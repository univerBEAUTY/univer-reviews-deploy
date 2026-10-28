import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'

// Layout `showcase` (vitrine de e-commerce): resumo em card, faixa de mídia,
// chips com contagem e lista com "Carregar mais". A API é simulada por URL.

beforeAll(async () => {
  await import('../src/widget')
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

type Rv = Record<string, unknown>

function review(id: string, extra: Rv = {}): Rv {
  return {
    id, rating: 5, title: null, body: `Texto da avaliação ${id}`, author_name: `Cliente ${id}`,
    author_country: null, author_avatar_url: null, is_verified_purchase: false, is_featured: false,
    helpful_count: 0, unhelpful_count: 0, language: 'pt-BR', created_at: '2026-09-24T12:00:00Z',
    media: [], replies: [], is_synthetic: false, ...extra,
  }
}

function stubApi(opts: { summary: Rv; pages: Rv[][]; withMedia?: Rv[] }) {
  const calls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = new URL(String(input))
    calls.push(url.pathname + url.search)
    const json = (body: unknown) => ({ ok: true, json: async () => body })
    if (url.pathname.endsWith('/widget-config')) return json({ data: {} })
    if (url.pathname.includes('/public/summary/')) return json({ data: opts.summary })
    if (url.pathname.includes('/public/questions/')) return json({ data: [] })
    if (url.pathname.includes('/public/reviews/')) {
      if (url.searchParams.get('with_media') === 'true' && url.searchParams.get('per_page') === '12') {
        return json({ data: opts.withMedia ?? [], meta: { total_pages: 1, total_count: 0 } })
      }
      const page = Number(url.searchParams.get('page') || '1')
      return json({
        data: opts.pages[page - 1] ?? [],
        meta: { current_page: page, total_pages: opts.pages.length, total_count: opts.pages.flat().length },
      })
    }
    return { ok: false, json: async () => ({}) }
  }))
  return calls
}

const flush = () => new Promise(r => setTimeout(r, 0))

async function mount(): Promise<ShadowRoot> {
  const el = document.createElement('univer-reviews')
  el.setAttribute('product-id', 'p1')
  el.setAttribute('api-url', 'http://api.test')
  el.setAttribute('layout', 'showcase')
  el.setAttribute('show-qa', 'false')
  el.setAttribute('per-page', '2')
  document.body.appendChild(el)
  for (let i = 0; i < 5; i++) await flush()
  return el.shadowRoot!
}

const dist = (counts: Record<number, number>) =>
  [1, 2, 3, 4, 5].map(r => ({ rating: r, count: counts[r] ?? 0, percentage: 0 }))

describe('layout showcase', () => {
  it('mostra nota, % que recomenda, faixa de mídia e chips só das notas que existem', async () => {
    stubApi({
      summary: { product_id: 'p1', total_reviews: 3, avg_rating: 4.67, verified_count: 1, media_count: 1,
                 recommend_percentage: 100, rating_distribution: dist({ 5: 2, 4: 1 }) },
      pages: [[review('a'), review('b')], [review('c')]],
      withMedia: [review('m', { media: [{ type: 'image', url: 'https://cdn/x.jpg', thumb_url: 'https://cdn/x_t.jpg' }] })],
    })
    const root = await mount()

    expect(root.querySelector('.ur-sc-avg')?.textContent).toBe('4,7')
    expect(root.querySelector('.ur-sc-recommend')?.textContent).toContain('100%')
    // Só 1 de 3 é verificada: não pode dizer "3 avaliações verificadas".
    expect(root.querySelector('.ur-sc-count')?.textContent?.replace(/\s+/g, ' ')).toContain('3 avaliações · 1 verificadas')
    expect(root.querySelector('.ur-sc-note')).toBeNull()
    expect(root.querySelectorAll('.ur-sc-thumb')).toHaveLength(1)
    expect([...root.querySelectorAll('[data-star]')].map(b => (b as HTMLElement).dataset.star)).toEqual(['5', '4'])
    expect(root.querySelector('[data-media="with_media"] sup')?.textContent).toBe('1')
  })

  it('"Carregar mais" acrescenta a próxima página e some no fim', async () => {
    const calls = stubApi({
      summary: { product_id: 'p1', total_reviews: 3, avg_rating: 5, verified_count: 0, media_count: 0,
                 recommend_percentage: 100, rating_distribution: dist({ 5: 3 }) },
      pages: [[review('a'), review('b')], [review('c')]],
    })
    const root = await mount()
    expect(root.querySelectorAll('.ur-sc-card')).toHaveLength(2)
    expect(root.querySelector('.ur-sc-shown')?.textContent).toContain('2 de 3')

    ;(root.querySelector('[data-action="load-more"]') as HTMLButtonElement).click()
    for (let i = 0; i < 5; i++) await flush()

    expect(root.querySelectorAll('.ur-sc-card')).toHaveLength(3)
    expect(root.querySelector('[data-action="load-more"]')).toBeNull()
    expect(calls.some(c => c.includes('page=2'))).toBe(true)
  })

  it('selo de compra verificada só nas verificadas e rótulo de IA só nas sintéticas', async () => {
    stubApi({
      summary: { product_id: 'p1', total_reviews: 2, avg_rating: 5, verified_count: 1, media_count: 0,
                 recommend_percentage: 100, rating_distribution: dist({ 5: 2 }) },
      pages: [[review('real', { is_verified_purchase: true }), review('ia', { is_synthetic: true })]],
    })
    const root = await mount()
    const [real, ia] = [...root.querySelectorAll('.ur-sc-card')]

    expect(real.querySelector('.ur-sc-verified')?.textContent).toContain('Compra verificada')
    expect(real.querySelector('.ur-sc-ai')).toBeNull()
    expect(ia.querySelector('.ur-sc-verified')).toBeNull()
    expect(ia.querySelector('.ur-sc-ai')?.textContent).toBe('Avaliação de exemplo · gerada por IA')
  })

  it('diz "verificadas" no total e mostra o aviso só quando todas são verificadas', async () => {
    stubApi({
      summary: { product_id: 'p1', total_reviews: 2, avg_rating: 5, verified_count: 2, media_count: 0,
                 recommend_percentage: 100, rating_distribution: dist({ 5: 2 }) },
      pages: [[review('a', { is_verified_purchase: true }), review('b', { is_verified_purchase: true })]],
    })
    const root = await mount()
    expect(root.querySelector('.ur-sc-count')?.textContent?.replace(/\s+/g, ' ')).toContain('2 avaliações verificadas')
    expect(root.querySelector('.ur-sc-note')?.textContent).toBe('Exibindo avaliações de compras verificadas')
  })

  it('o chip de nota filtra pela API', async () => {
    const calls = stubApi({
      summary: { product_id: 'p1', total_reviews: 2, avg_rating: 4.5, verified_count: 0, media_count: 0,
                 recommend_percentage: 100, rating_distribution: dist({ 5: 1, 4: 1 }) },
      pages: [[review('a'), review('b', { rating: 4 })]],
    })
    const root = await mount()
    ;(root.querySelector('[data-star="4"]') as HTMLButtonElement).click()
    for (let i = 0; i < 5; i++) await flush()
    expect(calls.some(c => c.includes('rating=4'))).toBe(true)
    expect(root.querySelector('[data-star="4"]')?.classList.contains('active')).toBe(true)
  })
})
