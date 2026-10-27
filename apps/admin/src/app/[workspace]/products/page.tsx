'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { Package, ExternalLink, RefreshCw, Loader2, Sparkles } from 'lucide-react'
import { ProductReviewActions } from '@/components/products/ProductReviewActions'
import { toast } from 'sonner'
import { PageHeader } from '@/components/godmode/PageHeader'
import { StatsBar } from '@/components/godmode/StatsBar'
import { Toolbar, SearchInput } from '@/components/godmode/Toolbar'
import { DataTable } from '@/components/godmode/DataTable'
import { Pagination } from '@/components/godmode/Pagination'
import { RatingStars } from '@/components/reviews/RatingStars'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { formatNumber } from '@/lib/utils'
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table'
import type { Product } from '@/types'

const col = createColumnHelper<Product>()

const columns = [
  col.accessor('name', {
    header: 'Produto',
    cell: (info) => (
      <div className="flex items-center gap-2.5">
        {info.row.original.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={info.row.original.image_url}
            alt=""
            className="w-8 h-8 rounded-lg object-cover"
            style={{ border: '1px solid var(--ur-border-strong)' }}
          />
        ) : (
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--ur-surface-soft)' }}
          >
            <Package className="w-4 h-4" style={{ color: 'var(--ur-text-muted)' }} />
          </div>
        )}
        <span className="ur-label" style={{ color: 'var(--ur-text)' }}>
          {info.getValue()}
        </span>
      </div>
    ),
  }),
  col.accessor('review_count', {
    header: 'Avaliações',
    cell: (info) => (
      <span className="ur-body tabular-nums">
        {formatNumber(info.getValue())}
      </span>
    ),
  }),
  col.accessor('avg_rating', {
    header: 'Nota média',
    cell: (info) => {
      const raw = info.getValue()
      const num = raw == null ? null : Number(raw)
      if (num === null || Number.isNaN(num)) {
        return <span style={{ color: 'var(--ur-text-muted)' }}>—</span>
      }
      return <RatingStars rating={num} size="xs" showValue />
    },
  }),
  col.accessor('price', {
    header: 'Preço',
    cell: (info) => {
      const raw = info.getValue()
      const num = raw == null ? null : Number(raw)
      if (num === null || Number.isNaN(num)) {
        return <span style={{ color: 'var(--ur-text-muted)' }}>—</span>
      }
      return (
        <span className="ur-body-soft tabular-nums">
          {info.row.original.currency} {num.toFixed(2)}
        </span>
      )
    },
  }),
  col.accessor('source', {
    header: 'Origem',
    cell: (info) => (
      <span
        className="ur-caption px-2 py-0.5 rounded-full"
        style={{ background: 'var(--ur-surface-soft)', border: '1px solid var(--ur-border)' }}
      >
        {info.getValue()}
      </span>
    ),
  }),
  col.display({
    id: 'actions',
    header: 'Ações',
    cell: ({ row }) => (
      <div className="flex items-center gap-2 justify-end">
        <ProductReviewActions product={row.original} />
        {row.original.external_id ? (
          <button
            type="button"
            className="p-1.5 rounded"
            style={{ color: 'var(--ur-text-muted)' }}
            aria-label={`Abrir ${row.original.name} no WooCommerce`}
            title="Abrir no WooCommerce"
          >
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    ),
  }),
]

export default function ProductsPage() {
  const params = useParams()
  const workspace = params?.workspace as string
  const { getToken, isAuthenticated } = useAuth()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [platform, setPlatform] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['products', workspace, page, search, platform],
    queryFn: () =>
      api.products.list(
        { page, per_page: 20, q: search || undefined, platform: platform || undefined },
        getToken()
      ),
    enabled: isAuthenticated,
  })

  // Inline sync so the merchant sees a concrete result instantly — synced N,
  // failed K — instead of "enqueued" and having to refresh. The shared
  // syncer service runs identically in both inline and background paths so
  // this stays consistent with the daily cron.
  const syncMutation = useMutation({
    mutationFn: () => api.products.sync(getToken(), { inline: true }),
    onSuccess: (res) => {
      // Narrow the response to the inline shape. The non-inline branch
      // returns `{ message: string }` and is never reached here.
      const r = res as Partial<{ ok: boolean; synced: number; failed: number; pages_fetched: number; total_fetched: number; stage: string; error: string }>
      if (r.stage) {
        const stageLabel = r.stage === 'auth' ? 'Autenticação' : r.stage === 'connection' ? 'Conexão' : 'Erro'
        toast.error(`${stageLabel}: ${r.error || 'Falha na sincronização'}`, { duration: 8000 })
        return
      }
      const synced = r.synced ?? 0
      const failed = r.failed ?? 0
      const total  = r.total_fetched ?? 0
      if (synced === 0 && total === 0) {
        toast.warning('Sincronização rodou mas WooCommerce retornou 0 produtos. Confira credenciais e se há produtos publicados.', { duration: 8000 })
      } else if (failed > 0) {
        toast.warning(`${synced} sincronizados, ${failed} com erro (de ${total}). Veja o console pra detalhes.`, { duration: 8000 })
      } else {
        toast.success(`${synced} produto${synced === 1 ? '' : 's'} sincronizado${synced === 1 ? '' : 's'} do WooCommerce.`)
      }
      queryClient.invalidateQueries({ queryKey: ['products', workspace] })
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Falha na sincronização'
      toast.error(msg)
    },
  })

  const bulkQaAllMutation = useMutation({
    mutationFn: () =>
      api.ai.bulkCreateQuestionsAll(
        { count_per_product: 10, status: 'published' },
        getToken(),
      ),
    onSuccess: (res) => {
      toast.success(
        `Q&A em massa iniciado para ${res.meta.products_queued} produtos (${res.meta.total_pairs_expected} pares esperados).`,
        { duration: 8000 },
      )
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Falha ao iniciar Q&A em massa'
      toast.error(msg)
    },
  })

  const confirmBulkQa = () => {
    const total = data?.meta.total_count ?? 0
    const ok = window.confirm(
      `Gerar 10 perguntas + respostas com IA para TODOS os ${total} produtos? ` +
        `Resultado: ~${total * 10} pares publicados direto. Roda em background, ` +
        `pode levar alguns minutos por produto. Custo de IA proporcional.`,
    )
    if (ok) bulkQaAllMutation.mutate()
  }

  const statsItems = [
    { label: 'Total de produtos', value: formatNumber(data?.meta.total_count ?? 0) },
    { label: 'Com avaliações', value: '—' },
    { label: 'Nota média', value: '—' },
    { label: 'Média de avaliações', value: '—' },
  ]

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        icon={<Package className="w-5 h-5" />}
        title="Produtos"
        subtitle="Gerencie seu catálogo e a saúde das avaliações"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={confirmBulkQa}
              disabled={bulkQaAllMutation.isPending || (data?.meta.total_count ?? 0) === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all min-h-[44px] sm:min-h-0"
              style={{
                background: 'linear-gradient(135deg, var(--ur-accent), var(--ur-accent-strong))',
                color: 'var(--ur-text-on-accent)',
              }}
              title="Gera 10 perguntas + respostas via Claude para cada produto, publicadas direto"
            >
              {bulkQaAllMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              Gerar Q&A em todos
            </button>
            <button
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all min-h-[44px] sm:min-h-0"
              style={{
                background: 'var(--ur-accent-soft)',
                border: '1px solid var(--ur-accent-soft-3)',
                color: 'var(--ur-accent)',
              }}
            >
              {syncMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Sincronizar do WooCommerce
            </button>
          </div>
        }
      />

      <StatsBar stats={statsItems} isLoading={isLoading} />

      <Toolbar
        left={
          <>
            <SearchInput
              value={search}
              onChange={(v) => { setSearch(v); setPage(1) }}
              placeholder="Buscar produtos…"
            />
            <select
              aria-label="Filtrar por plataforma"
              value={platform}
              onChange={(e) => { setPlatform(e.target.value); setPage(1) }}
              className="px-3 py-1.5 rounded-lg text-sm outline-none"
              style={{
                background: 'var(--ur-bg-soft)',
                border: '1px solid var(--ur-border)',
                color: 'var(--ur-text)',
              }}
            >
              <option value="">Todas as plataformas</option>
              <option value="woocommerce">WooCommerce</option>
              <option value="univercampus">UniverCampus</option>
              <option value="generic">Manual</option>
            </select>
          </>
        }
        right={
          <span className="ur-meta">
            {data?.meta.total_count ?? 0} produtos
          </span>
        }
      />

      <div className="flex-1 overflow-hidden flex flex-col">
        <DataTable
          data={data?.data ?? []}
          columns={columns as ColumnDef<Product, unknown>[]}
          isLoading={isLoading}
          getRowId={(row) => row.id}
        />
        {data && (
          <Pagination
            currentPage={data.meta.current_page}
            totalPages={data.meta.total_pages}
            totalCount={data.meta.total_count}
            perPage={data.meta.per_page}
            onPageChange={setPage}
          />
        )}
      </div>
    </div>
  )
}
