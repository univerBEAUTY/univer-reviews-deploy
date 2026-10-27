'use client'

import { GraduationCap, Plug } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { PageHeader } from '@/components/godmode/PageHeader'
import { IntegrationCard } from '@/components/integrations/IntegrationCard'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'

type StaticIntegration = {
  id: string
  name: string
  description: string
  status: 'coming_soon' | 'not_connected'
  logo: React.ReactElement
  href?: string
}

// Static catalog: only logo/copy/href live here. Real status + stats come from API.
const staticIntegrations: StaticIntegration[] = [
  {
    id: 'shopify',
    name: 'Shopify',
    description:
      'Conecte sua loja Shopify para coletar avaliações automaticamente após a compra.',
    status: 'coming_soon' as const,
    logo: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="#96bf48">
        <path d="M15.3 3.5c-.1 0-.2 0-.3.1-.7 2.1-2.1 2.6-2.6 2.6H9.7c-.9 0-1.6.7-1.6 1.6v11.6c0 .9.7 1.6 1.6 1.6h6.6c.9 0 1.6-.7 1.6-1.6V5.1c0-.9-.7-1.6-1.6-1.6z" />
      </svg>
    ),
  },
  {
    id: 'nuvemshop',
    name: 'Nuvemshop',
    description:
      'Integre com a Nuvemshop (Tiendanube) para coletar avaliações de clientes latino-americanos.',
    status: 'coming_soon' as const,
    logo: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="#005cff">
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12l2.5 2.5L16 9" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'mercadolivre',
    name: 'Mercado Livre',
    description:
      'Importe e gerencie automaticamente avaliações do maior marketplace do Brasil.',
    status: 'coming_soon' as const,
    logo: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="#ffe600">
        <rect x="2" y="6" width="20" height="12" rx="3" />
        <path d="M8 12l2 2 4-4" stroke="#333" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'zapier',
    name: 'Zapier',
    description:
      'Conecte o UniverReviews a mais de 5.000 apps via Zapier para fluxos de automação personalizados.',
    status: 'coming_soon' as const,
    logo: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="#ff4a00">
        <polygon points="12,2 22,7 22,17 12,22 2,17 2,7" />
      </svg>
    ),
  },
  {
    id: 'webhooks',
    name: 'Webhooks',
    description:
      'Envie eventos em tempo real para seus próprios endpoints quando avaliações forem criadas ou atualizadas.',
    status: 'coming_soon' as const,
    logo: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--ur-text-soft)" strokeWidth="1.5">
        <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
]

const wooLogo = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="#7f54b3">
    <path d="M3.1 8.7c-.3-.4-.3-1 .1-1.4C4 6.5 5 6 6.2 6h11.6c1.2 0 2.2.5 2.9 1.4.7.9.9 2 .6 3.1l-2.1 8c-.3 1.3-1.5 2.3-2.8 2.3H7.6c-1.3 0-2.5-1-2.8-2.3l-2.1-8c-.1-.7 0-1.3.4-1.8z" />
    <circle cx="9" cy="19.5" r="1.5" fill="#fff" />
    <circle cx="15" cy="19.5" r="1.5" fill="#fff" />
  </svg>
)

const univercampusLogo = (
  <GraduationCap className="w-5 h-5" style={{ color: 'var(--ur-accent)' }} aria-hidden="true" />
)

export default function IntegrationsPage() {
  const params = useParams()
  const workspace = params?.workspace as string
  const { getToken, isAuthenticated } = useAuth()

  const { data: wooConfig } = useQuery({
    queryKey: ['woocommerce-config', workspace],
    queryFn: () => api.integrations.woocommerce.get(getToken()),
    enabled: isAuthenticated,
    retry: false,
  })

  const { data: ucConfig } = useQuery({
    queryKey: ['univercampus-config', workspace],
    queryFn: () => api.integrations.univercampus.get(getToken()),
    enabled: isAuthenticated,
    retry: false,
  })

  const ucConnected = Boolean(ucConfig?.connected) && ucConfig?.status === 'active'
  const ucStats = ucConfig?.connected
    ? [
        { label: 'Cursos', value: (ucConfig.course_count ?? 0).toLocaleString('pt-BR') },
        { label: 'Avaliações publicadas', value: (ucConfig.review_count ?? 0).toLocaleString('pt-BR') },
        ...(ucConfig.status === 'invalid' ? [{ label: 'Atenção', value: 'Token inválido' }] : []),
      ]
    : undefined

  const wooConnected = Boolean(wooConfig?.connected)
  const wooStats = wooConnected
    ? [
        {
          label: 'Produtos',
          value: (wooConfig?.product_count ?? 0).toLocaleString('pt-BR'),
        },
        {
          label: 'Avaliações sincronizadas',
          value: (wooConfig?.review_count ?? 0).toLocaleString('pt-BR'),
        },
      ]
    : undefined

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        icon={<Plug className="w-5 h-5" />}
        title="Integrações"
        subtitle="Conecte sua loja e automatize a coleta de avaliações"
      />

      <div className="flex-1 overflow-y-auto p-5">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--ur-text-muted)' }}>
              Integrações disponíveis
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <IntegrationCard
              name="WooCommerce"
              description="Sincronize produtos, importe avaliações de clientes e automatize a coleta de avaliações da sua loja WooCommerce."
              status={wooConnected ? 'connected' : 'not_connected'}
              logo={wooLogo}
              href="integrations/woocommerce"
              stats={wooStats}
            />

            <IntegrationCard
              name="UniverCampus"
              description="Traga os cursos das suas escolas como produtos, gere avaliações com o contexto real de cada curso e publique estrelas e depoimentos na página de venda."
              status={ucConnected ? 'connected' : 'not_connected'}
              logo={univercampusLogo}
              href="integrations/univercampus"
              stats={ucStats}
            />

            {staticIntegrations.map((integration) => (
              <IntegrationCard
                key={integration.id}
                name={integration.name}
                description={integration.description}
                status={integration.status}
                logo={integration.logo}
                href={integration.href}
              />
            ))}
          </div>

          <div
            className="mt-8 rounded-xl p-5"
            style={{ background: 'var(--ur-surface)', border: '1px solid var(--ur-border)' }}
          >
            <div className="flex items-start gap-4">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'var(--ur-accent-soft)', border: '1px solid var(--ur-accent-soft-2)' }}
              >
                <Plug className="w-5 h-5" style={{ color: 'var(--ur-accent)' }} />
              </div>
              <div>
                <h3 className="text-sm font-semibold" style={{ color: 'var(--ur-text)' }}>
                  Solicitar uma integração
                </h3>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--ur-text-soft)' }}>
                  Não encontrou sua plataforma? Lançamos integrações rápido. Entre em
                  contato e vamos priorizar conforme a demanda.
                </p>
                <a
                  href="mailto:integrations@univerreviews.com?subject=Solicita%C3%A7%C3%A3o%20de%20integra%C3%A7%C3%A3o&body=Olá%2C%20gostaria%20de%20solicitar%20a%20integra%C3%A7%C3%A3o%20com%3A%20%5Bplataforma%5D"
                  className="mt-3 inline-block text-xs font-medium transition-colors"
                  style={{ color: 'var(--ur-accent)' }}
                >
                  Solicitar integração →
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
