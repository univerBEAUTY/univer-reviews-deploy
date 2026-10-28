'use client'

/**
 * Settings → Aparência do Widget
 *
 * Visual customizer for the storefront `<univer-reviews>` web component.
 * Edits workspace-level defaults (layout, locale, colors, star shape,
 * Q&A toggle, write-review toggle, per-page, custom CSS) and previews
 * the result with a live mock that uses the same CSS variables the
 * widget itself reads.
 *
 * The form posts a flat payload to PATCH /api/v1/workspace. Per-element
 * HTML attributes on the storefront still override workspace defaults
 * at runtime — the widget enforces precedence (attribute > workspace
 * setting > built-in default).
 */

import { useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronDown, Loader2, Star, Upload, Trash2, Sparkles } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import type {
  Workspace,
  WidgetLayout,
  WidgetLocale,
  WidgetStarShape,
  WidgetUpdatePayload,
} from '@/types'

// ─── Constants ──────────────────────────────────────────────────────────────

const LAYOUTS: { id: WidgetLayout; label: string; sub: string }[] = [
  { id: 'default',  label: 'Padrão',    sub: 'Cards em coluna única.' },
  { id: 'compact',  label: 'Compacto',  sub: 'Lista densa, sem borda entre cards.' },
  { id: 'grid',     label: 'Grade',     sub: 'Cards em grid responsivo.' },
  { id: 'carousel', label: 'Carrossel', sub: 'Scroll horizontal com snap.' },
  { id: 'showcase', label: 'Vitrine',   sub: 'Resumo em card, fotos dos clientes, filtros e "Carregar mais".' },
]

const LOCALES: { id: WidgetLocale; label: string }[] = [
  { id: 'pt-BR', label: 'Português (Brasil)' },
  { id: 'en-US', label: 'English (US)' },
  { id: 'es-AR', label: 'Español (Argentina)' },
]

const STAR_SHAPES: { id: WidgetStarShape; label: string; glyph: string }[] = [
  { id: 'star',    label: 'Estrela',   glyph: '\u2605' },
  { id: 'heart',   label: 'Coração',   glyph: '\u2665' },
  { id: 'flame',   label: 'Chama',     glyph: '\uD83D\uDD25' },
  { id: 'thumb',   label: 'Joinha',    glyph: '\uD83D\uDC4D' },
  { id: 'diamond', label: 'Losango',   glyph: '\u2666' },
]

const HEX_RE = /^#(?:[0-9a-f]{6}|[0-9a-f]{3})$/i

function normalizeHex(value: string): string | null {
  const v = value.trim()
  if (!HEX_RE.test(v)) return null
  if (v.length === 4) {
    // expand #abc → #aabbcc
    return '#' + v.slice(1).split('').map((c) => c + c).join('').toLowerCase()
  }
  return v.toLowerCase()
}

// ─── Component ──────────────────────────────────────────────────────────────

export function AppearanceTab({ workspace }: { workspace: Workspace }) {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()

  // Source defaults: prefer the new widget payload, fall back to the legacy
  // top-level fields. This keeps the tab functional even before the API
  // round-trip starts returning the `widget` envelope.
  const initial = useMemo(() => ({
    layout: (workspace.widget?.layout ?? 'default') as WidgetLayout,
    locale: (workspace.widget?.locale ?? (workspace.default_locale as WidgetLocale) ?? 'pt-BR') as WidgetLocale,
    themeColor: workspace.widget?.theme_color ?? workspace.branding?.brand_color ?? '#d4a850',
    starColor: workspace.widget?.star_color ?? '#fbbf24',
    starShape: (workspace.widget?.star_shape ?? workspace.branding?.rating_icon ?? 'star') as WidgetStarShape,
    showQa: workspace.widget?.show_qa ?? true,
    showWriteReview: workspace.widget?.show_write_review ?? true,
    perPage: workspace.widget?.per_page ?? 5,
    customCss: workspace.widget?.custom_css ?? '',
  }), [workspace])

  const [layout,          setLayout]          = useState<WidgetLayout>(initial.layout)
  const [locale,          setLocale]          = useState<WidgetLocale>(initial.locale)
  const [themeColor,      setThemeColor]      = useState<string>(initial.themeColor)
  const [themeColorInput, setThemeColorInput] = useState<string>(initial.themeColor)
  const [starColor,       setStarColor]       = useState<string>(initial.starColor)
  const [starColorInput,  setStarColorInput]  = useState<string>(initial.starColor)
  const [starShape,       setStarShape]       = useState<WidgetStarShape>(initial.starShape)
  const [showQa,          setShowQa]          = useState<boolean>(initial.showQa)
  const [showWriteReview, setShowWriteReview] = useState<boolean>(initial.showWriteReview)
  const [perPage,         setPerPage]         = useState<number>(initial.perPage)
  const [customCss,       setCustomCss]       = useState<string>(initial.customCss)
  const [advancedOpen,    setAdvancedOpen]    = useState<boolean>(false)
  // Custom brand-icon URL is stored on the workspace and managed via a
  // dedicated multipart endpoint (the rest of this form is JSON-only). We
  // keep a local mirror so the live preview + remove button can react
  // without a refetch round-trip.
  const [starIconUrl, setStarIconUrl] = useState<string | null>(
    workspace.widget?.star_icon_url ?? null,
  )

  // Form-level validation surface (only color fields can be invalid here
  // — every other input is constrained at the widget level).
  const themeColorValid = HEX_RE.test(themeColorInput)
  const starColorValid  = HEX_RE.test(starColorInput)

  const mutation = useMutation({
    mutationFn: (payload: WidgetUpdatePayload) =>
      api.workspace.update(payload as Partial<Workspace>, getToken()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace'] })
      toast.success('Aparência salva')
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar aparência'
      const issues = (err as { issues?: string[] })?.issues
      toast.error(issues?.length ? `${msg}: ${issues.join(', ')}` : msg)
    },
  })

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const uploadIconMut = useMutation({
    mutationFn: (file: File) => api.workspace.uploadRatingIcon(file, getToken()),
    onSuccess: (res) => {
      setStarIconUrl(res.rating_icon_url)
      queryClient.invalidateQueries({ queryKey: ['workspace'] })
      toast.success('Ícone da marca atualizado')
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Falha ao enviar ícone'
      toast.error(msg)
    },
  })

  const removeIconMut = useMutation({
    mutationFn: () => api.workspace.removeRatingIcon(getToken()),
    onSuccess: () => {
      setStarIconUrl(null)
      queryClient.invalidateQueries({ queryKey: ['workspace'] })
      toast.success('Ícone removido — voltamos à forma preset.')
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Falha ao remover ícone'
      toast.error(msg)
    },
  })

  function handleIconPick(file: File | null) {
    if (!file) return
    if (!/^image\/(svg\+xml|png)$/.test(file.type)) {
      toast.error('Use SVG ou PNG.')
      return
    }
    if (file.size > 500_000) {
      toast.error('Arquivo acima de 500 KB.')
      return
    }
    uploadIconMut.mutate(file)
  }

  function onSave() {
    if (!themeColorValid) { toast.error('Cor da marca inválida (use #RRGGBB)'); return }
    if (!starColorValid)  { toast.error('Cor das estrelas inválida (use #RRGGBB)'); return }

    const payload: WidgetUpdatePayload = {
      brand_color:               normalizeHex(themeColorInput) ?? themeColor,
      default_locale:            locale,
      rating_icon_preset:        starShape,
      widget_default_layout:     layout,
      widget_star_color:         normalizeHex(starColorInput) ?? starColor,
      widget_show_qa:            showQa,
      widget_show_write_review:  showWriteReview,
      widget_per_page:           perPage,
      widget_custom_css:         customCss || '',
    }
    mutation.mutate(payload)
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_minmax(380px,520px)] gap-6 max-w-[1200px]">
      {/* ─── Form ─────────────────────────────────────────────────────────── */}
      <div className="space-y-6">
        {/* Layout */}
        <Section label="Layout" hint="Como os reviews são organizados na página do produto.">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {LAYOUTS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setLayout(opt.id)}
                className="flex flex-col items-start gap-2 p-3 rounded-xl text-left transition-all"
                style={{
                  background: layout === opt.id ? 'var(--ur-accent-soft)' : 'var(--ur-surface)',
                  border: `2px solid ${layout === opt.id ? 'var(--ur-accent)' : 'var(--ur-border)'}`,
                }}
              >
                <LayoutThumb id={opt.id} />
                <div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--ur-text)' }}>
                    {opt.label}
                  </div>
                  <div className="text-xs leading-snug" style={{ color: 'var(--ur-text-muted)' }}>
                    {opt.sub}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Section>

        {/* Locale */}
        <Section label="Idioma do widget" hint="Define os textos exibidos para o cliente final.">
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as WidgetLocale)}
            className="w-full max-w-sm px-3 py-2.5 rounded-lg text-sm outline-none"
            style={{
              background: 'var(--ur-bg-soft)',
              border: '1px solid var(--ur-surface-soft)',
              color: 'var(--ur-text)',
            }}
          >
            {LOCALES.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
        </Section>

        {/* Star shape */}
        <Section label="Forma das estrelas" hint="Símbolo usado em toda a UI de avaliação.">
          <div className="flex flex-wrap gap-2">
            {STAR_SHAPES.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setStarShape(opt.id)}
                className="flex flex-col items-center justify-center gap-1 w-20 h-20 rounded-xl transition-all"
                style={{
                  background: starShape === opt.id ? 'var(--ur-accent-soft)' : 'var(--ur-bg-soft)',
                  border: `2px solid ${starShape === opt.id ? 'var(--ur-accent)' : 'var(--ur-surface-soft)'}`,
                }}
                aria-label={opt.label}
              >
                <span
                  className="text-2xl leading-none"
                  style={{ color: starColor }}
                >
                  {opt.glyph}
                </span>
                <span className="text-[11px] font-medium" style={{ color: 'var(--ur-text-muted)' }}>
                  {opt.label}
                </span>
              </button>
            ))}
          </div>
        </Section>

        {/* Custom brand icon — overrides star shape on the storefront */}
        <Section
          label="Ícone da marca (opcional)"
          hint="Use o símbolo da sua marca como estrela — SVG ou PNG até 500 KB. Sobrescreve a forma preset acima."
        >
          <div className="flex items-center gap-4 flex-wrap">
            {/* Preview chip */}
            <div
              className="flex items-center gap-2 px-4 py-3 rounded-xl"
              style={{
                background: 'var(--ur-bg-soft)',
                border: '1px solid var(--ur-surface-soft)',
                minWidth: 200,
              }}
            >
              {starIconUrl ? (
                <span className="inline-flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <span
                      key={i}
                      aria-hidden
                      style={{
                        width: 22,
                        height: 22,
                        display: 'inline-block',
                        background: starColor,
                        // Tint the uploaded artwork with the configured star
                        // color via mask — works for both SVG and PNG with
                        // transparent backgrounds.
                        WebkitMaskImage: `url("${starIconUrl}")`,
                        maskImage: `url("${starIconUrl}")`,
                        WebkitMaskRepeat: 'no-repeat',
                        maskRepeat: 'no-repeat',
                        WebkitMaskPosition: 'center',
                        maskPosition: 'center',
                        WebkitMaskSize: 'contain',
                        maskSize: 'contain',
                      }}
                    />
                  ))}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1" aria-hidden>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star
                      key={i}
                      className="w-5 h-5"
                      style={{ color: starColor }}
                      fill={starColor}
                      stroke="none"
                    />
                  ))}
                </span>
              )}
              <span className="text-xs ml-1" style={{ color: 'var(--ur-text-muted)' }}>
                {starIconUrl ? 'Ícone personalizado' : 'Forma preset'}
              </span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/svg+xml,image/png"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                handleIconPick(f)
                if (e.target) e.target.value = ''
              }}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadIconMut.isPending}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-all disabled:opacity-50"
              style={{
                background: 'var(--ur-bg-soft)',
                color: 'var(--ur-text)',
                border: '1px solid var(--ur-surface-soft)',
              }}
              aria-label="Enviar ícone personalizado"
            >
              {uploadIconMut.isPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Upload className="w-4 h-4" />}
              {starIconUrl ? 'Trocar ícone' : 'Enviar ícone'}
            </button>

            {starIconUrl && (
              <button
                type="button"
                onClick={() => removeIconMut.mutate()}
                disabled={removeIconMut.isPending}
                className="inline-flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-all disabled:opacity-50"
                style={{
                  background: 'transparent',
                  color: 'var(--ur-danger)',
                  border: '1px solid var(--ur-border)',
                }}
                aria-label="Remover ícone personalizado"
              >
                {removeIconMut.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Trash2 className="w-4 h-4" />}
                Remover
              </button>
            )}
          </div>

          <p className="text-[11px] mt-3 flex items-start gap-1.5" style={{ color: 'var(--ur-text-faint)' }}>
            <Sparkles className="w-3 h-3 mt-0.5 shrink-0" />
            <span>
              Dica: use SVG monocromático com fundo transparente. A cor é
              aplicada automaticamente via CSS mask — funciona em PNG
              transparente também. Scripts em SVG são bloqueados.
            </span>
          </p>
        </Section>

        {/* Theme color */}
        <Section label="Cor da marca" hint="Acentua botão principal, abas, badges.">
          <ColorPicker
            color={themeColor}
            input={themeColorInput}
            valid={themeColorValid}
            onColorChange={(c) => { setThemeColor(c); setThemeColorInput(c) }}
            onInputChange={(v) => {
              setThemeColorInput(v)
              const n = normalizeHex(v)
              if (n) setThemeColor(n)
            }}
          />
        </Section>

        {/* Star color */}
        <Section label="Cor das estrelas" hint="Aplica-se a estrelas, distribuição de notas e seletor.">
          <ColorPicker
            color={starColor}
            input={starColorInput}
            valid={starColorValid}
            onColorChange={(c) => { setStarColor(c); setStarColorInput(c) }}
            onInputChange={(v) => {
              setStarColorInput(v)
              const n = normalizeHex(v)
              if (n) setStarColor(n)
            }}
          />
        </Section>

        {/* Show Q&A */}
        <Section label="Aba de Perguntas e Respostas" hint="Quando desligada, o widget esconde a tab inteira.">
          <Toggle checked={showQa} onChange={setShowQa} label={showQa ? 'Ativada' : 'Desativada'} />
        </Section>

        {/* Show write review */}
        <Section label="Botão de escrever avaliação" hint="Esconde o CTA principal sem desativar o widget.">
          <Toggle
            checked={showWriteReview}
            onChange={setShowWriteReview}
            label={showWriteReview ? 'Visível' : 'Escondido'}
          />
        </Section>

        {/* Per page — gratuito em todos os planos. Slider granular 1-100
           pra cada loja escolher o ritmo de scroll que combina com o
           tema (mobile-heavy → 5, desktop landing → 20+). Padrão 5
           combina com Judge.me/Yotpo. */}
        <Section
          label="Reviews por página"
          hint="De 1 a 100 reviews por página. Padrão 5 — leve no mobile, sem scroll infinito."
        >
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={1}
              max={100}
              step={1}
              value={perPage}
              onChange={(e) => setPerPage(parseInt(e.target.value, 10))}
              className="flex-1 max-w-sm accent-current"
              style={{ accentColor: 'var(--ur-accent)' }}
              aria-label="Reviews por página"
            />
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={100}
                value={perPage}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10)
                  if (!Number.isNaN(n)) setPerPage(Math.max(1, Math.min(100, n)))
                }}
                className="w-16 px-2 py-1.5 rounded-md text-sm font-mono tabular-nums text-right outline-none"
                style={{
                  background: 'var(--ur-bg-soft)',
                  border: '1px solid var(--ur-surface-soft)',
                  color: 'var(--ur-text)',
                }}
              />
              <span className="text-xs" style={{ color: 'var(--ur-text-muted)' }}>
                /página
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            {[5, 10, 20, 50].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setPerPage(preset)}
                className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
                style={{
                  background: perPage === preset ? 'var(--ur-accent-soft)' : 'var(--ur-bg-soft)',
                  color: perPage === preset ? 'var(--ur-accent)' : 'var(--ur-text-soft)',
                  border: `1px solid ${perPage === preset ? 'var(--ur-accent-soft-3)' : 'var(--ur-border)'}`,
                }}
              >
                {preset}
              </button>
            ))}
          </div>
        </Section>

        {/* Advanced — Custom CSS */}
        <div className="rounded-xl" style={{ background: 'var(--ur-surface)', border: '1px solid var(--ur-border)' }}>
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
            aria-expanded={advancedOpen}
          >
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--ur-text)' }}>Avançado</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--ur-text-muted)' }}>
                CSS personalizado injetado no Shadow DOM do widget. Sobrescreve qualquer estilo padrão.
              </p>
            </div>
            <ChevronDown
              className="w-4 h-4 shrink-0 transition-transform"
              style={{
                color: 'var(--ur-text-muted)',
                transform: advancedOpen ? 'rotate(180deg)' : 'none',
              }}
            />
          </button>
          {advancedOpen && (
            <div className="px-4 pb-4">
              <textarea
                value={customCss}
                onChange={(e) => setCustomCss(e.target.value)}
                rows={10}
                spellCheck={false}
                placeholder={`/* Exemplo */
.ur-card { border-radius: 4px; }
.ur-write-btn { text-transform: none; }`}
                className="w-full px-3 py-2.5 rounded-lg text-xs font-mono outline-none resize-y"
                style={{
                  background: 'var(--ur-bg)',
                  border: '1px solid var(--ur-surface-soft)',
                  color: 'var(--ur-text)',
                  lineHeight: 1.6,
                  minHeight: 200,
                }}
              />
              <p className="text-[11px] mt-2" style={{ color: 'var(--ur-text-faint)' }}>
                Aplicado depois do CSS padrão. Use seletores como <code>.ur-card</code>,{' '}
                <code>.ur-write-btn</code>, <code>.ur-summary</code>.
              </p>
            </div>
          )}
        </div>

        {/* Save */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onSave}
            disabled={mutation.isPending}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium disabled:opacity-40 transition-all"
            style={{
              background: 'linear-gradient(135deg, var(--ur-accent), var(--ur-accent-strong))',
              color: 'var(--ur-text-on-accent)',
            }}
          >
            {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Salvar aparência
          </button>
          <span className="text-xs" style={{ color: 'var(--ur-text-faint)' }}>
            Alterações são aplicadas no próximo carregamento do widget.
          </span>
        </div>
      </div>

      {/* ─── Live preview ─────────────────────────────────────────────────── */}
      <div className="xl:sticky xl:top-4 self-start">
        <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--ur-text-muted)' }}>
          Pré-visualização
        </div>
        <WidgetPreview
          themeColor={themeColor}
          starColor={starColor}
          starShape={starShape}
          starIconUrl={starIconUrl}
          showWriteReview={showWriteReview}
          locale={locale}
          customCss={customCss}
        />
      </div>
    </div>
  )
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function Section({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--ur-surface)', border: '1px solid var(--ur-border)' }}>
      <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--ur-text)' }}>
        {label}
      </h3>
      {hint && (
        <p className="text-xs mb-3" style={{ color: 'var(--ur-text-muted)' }}>
          {hint}
        </p>
      )}
      {children}
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
}) {
  return (
    <label className="inline-flex items-center gap-3 cursor-pointer select-none">
      <span
        className="relative inline-flex w-10 h-6 rounded-full transition-colors"
        style={{
          background: checked ? 'var(--ur-accent)' : 'var(--ur-surface-soft)',
        }}
      >
        <span
          className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
          style={{
            left: checked ? '18px' : '2px',
            background: 'var(--ur-text-on-accent)',
            boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
          }}
        />
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="opacity-0 absolute inset-0 cursor-pointer"
        />
      </span>
      {label && (
        <span className="text-sm" style={{ color: 'var(--ur-text)' }}>
          {label}
        </span>
      )}
    </label>
  )
}

function ColorPicker({
  color,
  input,
  valid,
  onColorChange,
  onInputChange,
}: {
  color: string
  input: string
  valid: boolean
  onColorChange: (v: string) => void
  onInputChange: (v: string) => void
}) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={color}
          onChange={(e) => onColorChange(e.target.value)}
          className="w-12 h-10 rounded-lg cursor-pointer"
          style={{
            background: 'none',
            border: '1px solid var(--ur-surface-soft)',
            padding: '2px',
          }}
        />
        <input
          type="text"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder="#d4a850"
          className="flex-1 max-w-[180px] px-3 py-2.5 rounded-lg text-sm font-mono outline-none"
          style={{
            background: 'var(--ur-bg-soft)',
            border: `1px solid ${valid ? 'var(--ur-surface-soft)' : 'var(--ur-danger)'}`,
            color: 'var(--ur-text)',
          }}
        />
        <div
          className="h-8 flex-1 rounded-lg"
          style={{ background: color, border: '1px solid var(--ur-surface-soft)' }}
        />
      </div>
      {!valid && (
        <p className="text-xs mt-1.5" style={{ color: 'var(--ur-danger)' }}>
          Formato inválido. Use #RRGGBB ou #RGB.
        </p>
      )}
    </div>
  )
}

// Tiny visual thumbnail of each layout, drawn in pure HTML/CSS so it stays
// in sync with how the widget actually arranges its cards.
function LayoutThumb({ id }: { id: WidgetLayout }) {
  const cardBase: React.CSSProperties = {
    background: 'var(--ur-bg-soft)',
    border: '1px solid var(--ur-border-soft)',
    borderRadius: 4,
  }
  if (id === 'default') {
    return (
      <div className="w-full h-14 flex flex-col gap-1 p-1.5 rounded" style={{ background: 'var(--ur-bg)' }}>
        <div className="flex-1" style={cardBase} />
        <div className="flex-1" style={cardBase} />
        <div className="flex-1" style={cardBase} />
      </div>
    )
  }
  if (id === 'compact') {
    return (
      <div className="w-full h-14 flex flex-col p-1.5 rounded" style={{ background: 'var(--ur-bg)' }}>
        <div className="flex-1 border-b" style={{ borderColor: 'var(--ur-border-soft)' }} />
        <div className="flex-1 border-b" style={{ borderColor: 'var(--ur-border-soft)' }} />
        <div className="flex-1 border-b" style={{ borderColor: 'var(--ur-border-soft)' }} />
        <div className="flex-1" />
      </div>
    )
  }
  if (id === 'showcase') {
    return (
      <div className="w-full h-14 flex flex-col gap-1 p-1.5 rounded" style={{ background: 'var(--ur-bg)' }}>
        <div className="flex gap-1 h-5 p-0.5" style={cardBase}>
          <div className="w-2/5 rounded-sm" style={{ background: 'var(--ur-border-soft)' }} />
          <div className="flex-1 rounded-sm" style={{ background: 'var(--ur-border-soft)' }} />
        </div>
        <div className="flex gap-0.5">
          <div className="h-1.5 w-3 rounded-full" style={{ background: 'var(--ur-text)' }} />
          <div className="h-1.5 w-3 rounded-full" style={cardBase} />
          <div className="h-1.5 w-3 rounded-full" style={cardBase} />
        </div>
        <div className="flex-1" style={cardBase} />
        <div className="flex-1" style={cardBase} />
      </div>
    )
  }
  if (id === 'grid') {
    return (
      <div className="w-full h-14 grid grid-cols-2 gap-1 p-1.5 rounded" style={{ background: 'var(--ur-bg)' }}>
        <div style={cardBase} />
        <div style={cardBase} />
        <div style={cardBase} />
        <div style={cardBase} />
      </div>
    )
  }
  return (
    <div className="w-full h-14 flex gap-1 p-1.5 rounded overflow-hidden" style={{ background: 'var(--ur-bg)' }}>
      <div className="w-1/3 shrink-0" style={cardBase} />
      <div className="w-1/3 shrink-0" style={cardBase} />
      <div className="w-1/3 shrink-0" style={cardBase} />
      <div className="w-1/3 shrink-0 opacity-50" style={cardBase} />
    </div>
  )
}

// Static mock of the widget hero (rating + distribution + write button +
// one card) themed with the live form state via inline CSS variables. We
// re-inject the workspace `customCss` inside a scoped <style> with a
// `.ur-preview` ancestor so the same selectors that target the widget
// also reach the preview without leaking into the rest of the admin UI.
function WidgetPreview({
  themeColor,
  starColor,
  starShape,
  starIconUrl,
  showWriteReview,
  locale,
  customCss,
}: {
  themeColor: string
  starColor: string
  starShape: WidgetStarShape
  starIconUrl: string | null
  showWriteReview: boolean
  locale: WidgetLocale
  customCss: string
}) {
  const t = useMemo(() => {
    if (locale === 'en-US') {
      return {
        reviews: 'Reviews',
        write_review: 'WRITE A REVIEW',
        verified: 'Verified Purchase',
        sample_title: 'Excellent product',
        sample_body: 'Beautiful finish and ships fast. Highly recommended.',
        sample_author: 'Sarah K.',
        showing: 'Showing 1–10 of 248',
      }
    }
    if (locale === 'es-AR') {
      return {
        reviews: 'Reseñas',
        write_review: 'ESCRIBIR UNA RESEÑA',
        verified: 'Compra verificada',
        sample_title: 'Excelente producto',
        sample_body: 'Excelente terminación y entrega rápida. Lo recomiendo.',
        sample_author: 'Sofía M.',
        showing: 'Mostrando 1–10 de 248',
      }
    }
    return {
      reviews: 'Avaliações',
      write_review: 'ESCREVER UM COMENTÁRIO',
      verified: 'Compra verificada',
      sample_title: 'Produto excelente',
      sample_body: 'Acabamento lindo e chegou rápido. Recomendo demais.',
      sample_author: 'Mariana S.',
      showing: 'Mostrando 1–10 de 248',
    }
  }, [locale])

  const glyph =
    starShape === 'heart'   ? '\u2665' :
    starShape === 'flame'   ? '\uD83D\uDD25' :
    starShape === 'thumb'   ? '\uD83D\uDC4D' :
    starShape === 'diamond' ? '\u2666' :
                              '\u2605'

  const stars = (n: number) => (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = i <= n
        if (starIconUrl) {
          return (
            <span
              key={i}
              aria-hidden
              style={{
                width: 14,
                height: 14,
                display: 'inline-block',
                background: filled ? starColor : 'var(--ur-border)',
                WebkitMaskImage: `url("${starIconUrl}")`,
                maskImage: `url("${starIconUrl}")`,
                WebkitMaskRepeat: 'no-repeat',
                maskRepeat: 'no-repeat',
                WebkitMaskPosition: 'center',
                maskPosition: 'center',
                WebkitMaskSize: 'contain',
                maskSize: 'contain',
              }}
            />
          )
        }
        return (
          <span
            key={i}
            style={{
              color: filled ? starColor : 'var(--ur-border)',
              fontSize: 14,
              lineHeight: 1,
            }}
          >
            {glyph}
          </span>
        )
      })}
    </span>
  )

  // Distribution rows mock — fixed so the preview always looks healthy.
  const dist = [
    { rating: 5, count: 198, pct: 80 },
    { rating: 4, count:  32, pct: 13 },
    { rating: 3, count:  12, pct: 5  },
    { rating: 2, count:   4, pct: 2  },
    { rating: 1, count:   2, pct: 1  },
  ]

  return (
    <div
      className="ur-preview rounded-xl overflow-hidden"
      style={{
        background: 'var(--ur-bg)',
        border: '1px solid var(--ur-border)',
        // Expose the same vars the storefront widget reads so an author's
        // custom CSS targeting --ur-accent / --ur-star works here too.
        ['--ur-accent' as never]: themeColor,
        ['--ur-star' as never]: starColor,
      }}
    >
      <div className="px-5 py-4">
        <div className="grid grid-cols-[minmax(120px,160px)_1fr_auto] gap-4 items-center pb-4 border-b" style={{ borderColor: 'var(--ur-border-soft)' }}>
          <div>
            <div className="text-4xl font-bold leading-none" style={{ color: 'var(--ur-text)' }}>
              4.8
            </div>
            <div className="mt-1.5">{stars(5)}</div>
            <div className="text-xs mt-1" style={{ color: 'var(--ur-text-soft)' }}>
              248 {t.reviews.toLowerCase()}
            </div>
          </div>
          <div className="space-y-1">
            {dist.map((r) => (
              <div key={r.rating} className="grid grid-cols-[20px_1fr_28px] gap-2 items-center text-xs" style={{ color: 'var(--ur-text-soft)' }}>
                <span className="flex items-center gap-0.5">
                  {r.rating}
                  <span style={{ color: starColor, fontSize: 10 }}>{glyph}</span>
                </span>
                <span className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--ur-border-soft)' }}>
                  <span className="block h-full" style={{ background: starColor, width: `${r.pct}%` }} />
                </span>
                <span className="tabular-nums text-right">{r.count}</span>
              </div>
            ))}
          </div>
          {showWriteReview && (
            <button
              type="button"
              className="ur-write-btn px-5 py-3 rounded-md text-xs font-bold tracking-wider whitespace-nowrap"
              style={{ background: themeColor, color: '#fff', letterSpacing: '0.04em' }}
            >
              {t.write_review}
            </button>
          )}
        </div>

        <div className="text-xs py-3" style={{ color: 'var(--ur-text-soft)' }}>
          {t.showing}
        </div>

        <article
          className="ur-card rounded-xl p-4 flex flex-col gap-2.5"
          style={{ background: 'var(--ur-surface)', border: '1px solid var(--ur-border)' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold"
              style={{ background: '#9333ea' }}
            >
              {t.sample_author[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--ur-text)' }}>
                {t.sample_author}
                <span
                  className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[8px] text-white"
                  style={{ background: 'var(--ur-success)' }}
                  title={t.verified}
                >
                  <Star className="w-2 h-2" fill="white" stroke="none" />
                </span>
              </div>
              <div className="text-[11px]" style={{ color: 'var(--ur-text-muted)' }}>
                3 dias atrás
              </div>
            </div>
          </div>
          {stars(5)}
          <h4 className="text-sm font-semibold m-0" style={{ color: 'var(--ur-text)' }}>
            {t.sample_title}
          </h4>
          <p className="text-sm m-0" style={{ color: 'var(--ur-text)' }}>
            {t.sample_body}
          </p>
        </article>
      </div>

      {customCss && (
        <style
          // We scope every workspace selector under .ur-preview so the
          // workspace's `.ur-card { border-radius: 4px }` reaches *this*
          // mock and nothing else in the admin UI. We don't render this
          // style on the storefront — there the widget itself injects the
          // CSS unscoped, as the workspace wrote it.
          dangerouslySetInnerHTML={{
            __html: customCss
              .replace(/<\/style>/gi, '<\\/style>')
              .replace(/(^|\})\s*([^{}@]+?)\s*\{/g, (_m, brace: string, sel: string) => {
                const scoped = sel
                  .split(',')
                  .map((s: string) => `.ur-preview ${s.trim()}`)
                  .join(', ')
                return `${brace}${brace ? ' ' : ''}${scoped} {`
              }),
          }}
        />
      )}
    </div>
  )
}
