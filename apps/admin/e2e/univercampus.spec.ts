import { test, expect, type Page, type Route } from '@playwright/test'

/**
 * Integração UniverCampus no admin.
 *
 * - Smoke (sempre roda): visitante anônimo não fica na página.
 * - Fluxo logado (CI_E2E_FULL=1): precisa de um usuário Better Auth real com
 *   acesso ao workspace FULL_E2E_WORKSPACE_SLUG. A API Rails da integração é
 *   mockada com page.route, então não depende de um UniverCampus de verdade.
 */

const API = /\/api\/v1\/integrations\/univercampus(\/[a-z_]+)?(\?.*)?$/

const schools = [
  { id: 'esc_1', slug: 'escola-um', nome: 'Escola Um', url: 'https://campus.example.com/s/escola-um' },
]

function connectedPayload() {
  return {
    connected: true,
    status: 'active',
    base_url: 'https://univercampus.cloud',
    token_prefix: 'ucrev_aaaaaa',
    owner: { id: 'usr_1', nome: 'Dona', email: 'dona@example.com' },
    schools: schools.map((s) => ({ ...s, course_count: 3 })),
    verified_at: new Date().toISOString(),
    last_synced_at: new Date().toISOString(),
    last_pushed_at: null,
    last_error: null,
    course_count: 3,
    review_count: 7,
  }
}

async function mockUnivercampusApi(page: Page, opts: { connected?: boolean } = {}) {
  let connected = Boolean(opts.connected)
  await page.route(API, async (route: Route) => {
    const req = route.request()
    const action = new URL(req.url()).pathname.split('/univercampus')[1] ?? ''
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

    if (req.method() === 'GET' && action === '') {
      return json(connected ? connectedPayload() : { connected: false, base_url: 'https://univercampus.cloud' })
    }
    if (req.method() === 'POST' && action === '/test') {
      return json({ success: true, message: 'Conectado como Dona — 1 escola(s)', owner: { nome: 'Dona' }, schools })
    }
    if (req.method() === 'POST' && action === '') {
      connected = true
      return json({ ...connectedPayload(), probe: { success: true } }, 201)
    }
    if (req.method() === 'POST' && action === '/sync') {
      return json({ ok: true, total_fetched: 3, synced: 3, failed: 0, deactivated: 0, errors: [] })
    }
    if (req.method() === 'POST' && action === '/push_all') {
      return json({ message: 'Reenvio de avaliações enfileirado', count: 7 })
    }
    if (req.method() === 'DELETE') {
      connected = false
      return route.fulfill({ status: 204, body: '' })
    }
    return route.continue()
  })
}

test.describe('UniverCampus — superfície fechada', () => {
  test('visitante anônimo não fica na página da integração', async ({ page }) => {
    await page.goto('/qualquer-workspace/integrations/univercampus', { waitUntil: 'domcontentloaded' })
    expect(page.url()).not.toMatch(/\/integrations\/univercampus\/?$/)
  })
})

test.describe('UniverCampus — conectar com API mockada', () => {
  test.skip(
    process.env.CI_E2E_FULL !== '1',
    'Defina CI_E2E_FULL=1 e FULL_E2E_MERCHANT_EMAIL/PASSWORD + FULL_E2E_WORKSPACE_SLUG',
  )

  const email = process.env.FULL_E2E_MERCHANT_EMAIL ?? 'lojista@example.com'
  const password = process.env.FULL_E2E_MERCHANT_PASSWORD ?? 'lojista-pwd-1!'
  const slug = process.env.FULL_E2E_WORKSPACE_SLUG ?? 'demo'

  async function login(page: Page) {
    await page.goto('/login')
    await page.getByPlaceholder(/e-mail/i).fill(email)
    await page.getByPlaceholder(/senha/i).fill(password)
    await page.getByRole('button', { name: /entrar/i }).click()
    await page.waitForURL((url) => !url.pathname.startsWith('/login'))
  }

  test('testa o token, vê as escolas e salva', async ({ page }) => {
    await mockUnivercampusApi(page)
    await login(page)
    await page.goto(`/${slug}/integrations/univercampus`)

    await expect(page.getByLabel('URL do UniverCampus')).toHaveValue('https://univercampus.cloud')
    await page.getByLabel('Token de API').fill(`ucrev_${'a'.repeat(43)}`)
    await page.getByRole('button', { name: 'Testar conexão' }).click()
    await expect(page.getByRole('status').getByText('Escola Um')).toBeVisible()

    await page.getByRole('button', { name: 'Salvar e sincronizar' }).click()
    await expect(page.getByRole('heading', { name: 'Conexão ativa' })).toBeVisible()
    await expect(page.getByText('Token ucrev_aaaaaa…')).toBeVisible()
    await expect(page.getByText('3 cursos')).toBeVisible()
  })

  test('sincroniza e reenvia avaliações de uma conexão ativa', async ({ page }) => {
    await mockUnivercampusApi(page, { connected: true })
    await login(page)
    await page.goto(`/${slug}/integrations/univercampus`)

    await page.getByRole('button', { name: 'Sincronizar agora' }).click()
    await expect(page.getByText('3 cursos sincronizados.')).toBeVisible()

    await page.getByRole('button', { name: 'Reenviar avaliações' }).click()
    await expect(page.getByText(/7 avaliações na fila de envio/)).toBeVisible()
  })
})
