'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import {
  GraduationCap,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Send,
  Trash2,
  AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { PageHeader } from '@/components/godmode/PageHeader'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import type { UnivercampusSchool, UnivercampusSyncResult, UnivercampusTestResult } from '@/types'

const inputClass = 'w-full px-4 py-2.5 rounded-lg text-sm outline-none transition-all'
const inputStyle: React.CSSProperties = {
  background: 'var(--ur-bg-soft)',
  border: '1px solid var(--ur-surface-soft)',
  color: 'var(--ur-text)',
}
const cardStyle: React.CSSProperties = {
  background: 'var(--ur-surface)',
  border: '1px solid var(--ur-border)',
}
const buttonClass =
  'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all min-h-[44px] sm:min-h-0 disabled:opacity-60 disabled:cursor-not-allowed'
const primaryButtonStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, var(--ur-accent), var(--ur-accent-strong))',
  color: 'var(--ur-text-on-accent)',
}
const secondaryButtonStyle: React.CSSProperties = {
  background: 'var(--ur-accent-soft)',
  border: '1px solid var(--ur-accent-soft-3)',
  color: 'var(--ur-accent)',
}
const dangerButtonStyle: React.CSSProperties = {
  background: 'var(--ur-danger-bg)',
  border: '1px solid var(--ur-danger-bg)',
  color: 'var(--ur-danger)',
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback
}

function relative(iso?: string | null) {
  if (!iso) return 'nunca'
  return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR })
}

function SchoolList({ schools }: { schools: UnivercampusSchool[] }) {
  if (schools.length === 0) {
    return (
      <p className="text-xs" style={{ color: 'var(--ur-text-muted)' }}>
        Este token não é dono de nenhuma escola no momento.
      </p>
    )
  }
  return (
    <ul className="space-y-2">
      {schools.map((school) => (
        <li
          key={school.id}
          className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
          style={{ background: 'var(--ur-bg-soft)', border: '1px solid var(--ur-surface-soft)' }}
        >
          <div className="min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: 'var(--ur-text)' }}>
              {school.nome}
            </p>
            <p className="text-xs truncate" style={{ color: 'var(--ur-text-muted)' }}>
              {school.url}
            </p>
          </div>
          {typeof school.course_count === 'number' && (
            <span className="text-xs shrink-0" style={{ color: 'var(--ur-text-soft)' }}>
              {school.course_count} curso{school.course_count === 1 ? '' : 's'}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

export default function UnivercampusPage() {
  const params = useParams()
  const workspace = params?.workspace as string
  const { getToken, isAuthenticated, isLoading: authLoading } = useAuth()
  const queryClient = useQueryClient()
  const queryKey = ['univercampus-config', workspace]

  const { data: config, isLoading } = useQuery({
    queryKey,
    queryFn: () => api.integrations.univercampus.get(getToken()),
    enabled: isAuthenticated,
    retry: false,
  })

  // null = ainda não editado → usa a URL salva (ou a padrão do servidor).
  const [baseUrl, setBaseUrl] = useState<string | null>(null)
  const [token, setToken] = useState('')
  const [tested, setTested] = useState<UnivercampusTestResult | null>(null)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  const connected = Boolean(config?.connected)
  const active = connected && config?.status === 'active'
  const effectiveBaseUrl = baseUrl ?? config?.base_url ?? ''
  const credentials = { base_url: effectiveBaseUrl, api_token: token || undefined }
  const refresh = () => queryClient.invalidateQueries({ queryKey })

  const testMutation = useMutation({
    mutationFn: () => api.integrations.univercampus.test(credentials, getToken()),
    onSuccess: (result) => {
      setTested(result)
      if (result.success) toast.success(result.message)
      else toast.error(result.message)
    },
    onError: (err: unknown) => {
      setTested(null)
      toast.error(errorMessage(err, 'Falha ao testar a conexão'))
    },
  })

  const saveMutation = useMutation({
    mutationFn: () => api.integrations.univercampus.save(credentials, getToken()),
    onSuccess: (result) => {
      if (result.probe && !result.probe.success) {
        toast.error(`Salvo, mas o UniverCampus recusou: ${result.probe.error ?? 'verifique o token'}`, { duration: 8000 })
      } else {
        toast.success('UniverCampus conectado — sincronização dos cursos iniciada')
      }
      setToken('')
      setTested(null)
      refresh()
    },
    onError: (err: unknown) => {
      const issues = (err as { issues?: string[] })?.issues
      const msg = errorMessage(err, 'Falha ao salvar a conexão')
      toast.error(issues?.length ? `${msg}: ${issues.join(', ')}` : msg, { duration: 8000 })
    },
  })

  const syncMutation = useMutation({
    mutationFn: () => api.integrations.univercampus.sync(getToken(), { inline: true }),
    onSuccess: (res) => {
      const r = res as Partial<UnivercampusSyncResult>
      if (r.stage) {
        const label = r.stage === 'auth' ? 'Token recusado' : 'Conexão'
        toast.error(`${label}: ${r.error ?? 'falha na sincronização'}`, { duration: 8000 })
      } else if ((r.failed ?? 0) > 0) {
        toast.warning(`${r.synced ?? 0} cursos sincronizados, ${r.failed} com erro.`, { duration: 8000 })
      } else {
        const n = r.synced ?? 0
        toast.success(`${n} curso${n === 1 ? '' : 's'} sincronizado${n === 1 ? '' : 's'}.`)
      }
      refresh()
    },
    onError: (err: unknown) => toast.error(errorMessage(err, 'Falha na sincronização')),
  })

  const pushMutation = useMutation({
    mutationFn: () => api.integrations.univercampus.pushAll(getToken()),
    onSuccess: (result) => {
      toast.success(`${result.count} avaliaç${result.count === 1 ? 'ão' : 'ões'} na fila de envio para o UniverCampus`)
      refresh()
    },
    onError: (err: unknown) => toast.error(errorMessage(err, 'Falha ao reenviar avaliações')),
  })

  const disconnectMutation = useMutation({
    mutationFn: () => api.integrations.univercampus.disconnect(getToken()),
    onSuccess: () => {
      toast.success('UniverCampus desconectado')
      setConfirmDisconnect(false)
      setBaseUrl(null)
      refresh()
    },
    onError: (err: unknown) => toast.error(errorMessage(err, 'Falha ao desconectar')),
  })

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--ur-accent)' }} />
      </div>
    )
  }

  const canSubmit = Boolean(token) || connected

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        icon={<GraduationCap className="w-5 h-5" />}
        title="UniverCampus"
        subtitle={connected ? 'Cursos como produtos, avaliações publicadas na página de venda' : 'Conecte suas escolas'}
        breadcrumbs={[
          { label: 'Integrações', href: `/${workspace}/integrations` },
          { label: 'UniverCampus' },
        ]}
      />

      <div className="flex-1 overflow-y-auto p-5">
        <div className="max-w-2xl mx-auto space-y-5">
          {connected && config && (
            <section className="rounded-xl p-5" style={cardStyle} aria-labelledby="uc-status-title">
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: active ? 'var(--ur-success-bg)' : 'var(--ur-danger-bg)' }}
                >
                  {active ? (
                    <CheckCircle2 className="w-5 h-5" style={{ color: 'var(--ur-success)' }} aria-hidden="true" />
                  ) : (
                    <XCircle className="w-5 h-5" style={{ color: 'var(--ur-danger)' }} aria-hidden="true" />
                  )}
                </div>
                <div className="min-w-0">
                  <h2 id="uc-status-title" className="text-sm font-semibold" style={{ color: 'var(--ur-text)' }}>
                    {active ? 'Conexão ativa' : 'Token inválido'}
                  </h2>
                  <p className="text-xs truncate" style={{ color: 'var(--ur-text-muted)' }}>
                    Token {config.token_prefix}…
                    {config.owner?.nome ? ` · dono: ${config.owner.nome}` : ''}
                  </p>
                </div>
              </div>

              <dl className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-4">
                {[
                  ['Cursos', (config.course_count ?? 0).toLocaleString('pt-BR')],
                  ['Escolas', (config.school_count ?? 0).toLocaleString('pt-BR')],
                  ['Avaliações publicadas', (config.review_count ?? 0).toLocaleString('pt-BR')],
                  ['Último sync', relative(config.last_synced_at)],
                  ['Último envio', relative(config.last_pushed_at)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs" style={{ color: 'var(--ur-text-muted)' }}>{label}</dt>
                    <dd className="text-sm font-semibold" style={{ color: 'var(--ur-text)' }}>{value}</dd>
                  </div>
                ))}
              </dl>

              {config.last_error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg px-3 py-2 mb-4 text-xs"
                  style={{ background: 'var(--ur-danger-bg)', color: 'var(--ur-danger)' }}
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{config.last_error}</span>
                </div>
              )}

              <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--ur-text-muted)' }}>
                Escolas cobertas pelo token
              </h3>
              <SchoolList schools={config.schools ?? []} />

              <div className="flex flex-wrap gap-3 mt-5">
                <button
                  type="button"
                  onClick={() => syncMutation.mutate()}
                  disabled={!active || syncMutation.isPending}
                  className={buttonClass}
                  style={secondaryButtonStyle}
                >
                  {syncMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <RefreshCw className="w-4 h-4" aria-hidden="true" />
                  )}
                  Sincronizar agora
                </button>
                <button
                  type="button"
                  onClick={() => pushMutation.mutate()}
                  disabled={!active || pushMutation.isPending}
                  className={buttonClass}
                  style={secondaryButtonStyle}
                >
                  {pushMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Send className="w-4 h-4" aria-hidden="true" />
                  )}
                  Reenviar avaliações
                </button>
              </div>
            </section>
          )}

          <section className="rounded-xl p-5" style={cardStyle} aria-labelledby="uc-form-title">
            <h2 id="uc-form-title" className="text-sm font-semibold mb-1" style={{ color: 'var(--ur-text)' }}>
              {connected ? 'Trocar URL ou token' : 'Conectar ao UniverCampus'}
            </h2>
            <p className="text-xs mb-4 leading-relaxed" style={{ color: 'var(--ur-text-soft)' }}>
              No UniverCampus, abra Configurações → UniverReview e gere um token. Ele vale para
              todas as escolas em que você é dono. Os cursos e as próprias escolas viram produtos
              aqui; as avaliações aprovadas aparecem como estrelas e depoimentos na página de venda
              do curso ou na página da escola.
            </p>

            <label htmlFor="uc-base-url" className="block text-xs font-medium mb-1.5" style={{ color: 'var(--ur-text-muted)' }}>
              URL do UniverCampus
            </label>
            <input
              id="uc-base-url"
              type="url"
              value={effectiveBaseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://univercampus.cloud"
              className={`${inputClass} mb-4`}
              style={inputStyle}
            />

            <label htmlFor="uc-token" className="block text-xs font-medium mb-1.5" style={{ color: 'var(--ur-text-muted)' }}>
              Token de API
            </label>
            <input
              id="uc-token"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={token}
              onChange={(e) => setToken(e.target.value.trim())}
              placeholder={connected ? `Token salvo (${config?.token_prefix ?? ''}…) — cole outro para trocar` : 'ucrev_…'}
              className={inputClass}
              style={inputStyle}
            />

            {tested && (
              <div
                role="status"
                className="mt-4 rounded-lg p-3"
                style={{
                  background: tested.success ? 'var(--ur-success-bg)' : 'var(--ur-danger-bg)',
                }}
              >
                <p
                  className="text-sm font-medium mb-2"
                  style={{ color: tested.success ? 'var(--ur-success)' : 'var(--ur-danger)' }}
                >
                  {tested.message}
                </p>
                {tested.success && <SchoolList schools={tested.schools ?? []} />}
              </div>
            )}

            <div className="flex flex-wrap gap-3 mt-5">
              <button
                type="button"
                onClick={() => testMutation.mutate()}
                disabled={!canSubmit || testMutation.isPending}
                className={buttonClass}
                style={secondaryButtonStyle}
              >
                {testMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                Testar conexão
              </button>
              <button
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={!canSubmit || saveMutation.isPending}
                className={buttonClass}
                style={primaryButtonStyle}
              >
                {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                Salvar e sincronizar
              </button>
            </div>
          </section>

          {connected && (
            <section
              className="rounded-xl p-5"
              style={{ background: 'var(--ur-danger-bg)', border: '1px solid var(--ur-danger-bg)' }}
              aria-labelledby="uc-danger-title"
            >
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4" style={{ color: 'var(--ur-danger)' }} aria-hidden="true" />
                <h2 id="uc-danger-title" className="text-sm font-semibold" style={{ color: 'var(--ur-danger)' }}>
                  Zona de perigo
                </h2>
              </div>
              <p className="text-xs mb-4" style={{ color: 'var(--ur-text-soft)' }}>
                Desconectar para a sincronização e o envio de avaliações. Os cursos continuam como
                produtos aqui e as avaliações já publicadas continuam no UniverCampus.
              </p>
              <div className="flex flex-wrap gap-3">
                {confirmDisconnect ? (
                  <>
                    <button
                      type="button"
                      onClick={() => disconnectMutation.mutate()}
                      disabled={disconnectMutation.isPending}
                      className={buttonClass}
                      style={dangerButtonStyle}
                    >
                      {disconnectMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      )}
                      Confirmar desconexão
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDisconnect(false)}
                      className={buttonClass}
                      style={{ background: 'var(--ur-bg)', border: '1px solid var(--ur-border)', color: 'var(--ur-text-soft)' }}
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDisconnect(true)}
                    className={buttonClass}
                    style={dangerButtonStyle}
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                    Desconectar
                  </button>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
