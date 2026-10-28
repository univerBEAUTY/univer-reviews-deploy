=== UniverReviews ===
Contributors: univerreviews
Tags: reviews, avaliações, woocommerce, ratings, ia, ai, product reviews, review widget
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 8.1
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Avaliações com IA para e-commerce que converte. Sincronize, modere e exiba reviews com um widget de alta performance.

== Description ==

O **UniverReviews** conecta sua loja WooCommerce à plataforma de reviews com IA mais avançada do mercado brasileiro.

**Recursos principais:**

* **Sincronização bidirecional** — novas avaliações WooCommerce são enviadas automaticamente para o UniverReviews, e reviews aprovadas voltam para o WordPress
* **Widget de alta performance** — < 20KB minificado, Web Component nativo, sem dependências de framework
* **5 layouts** — default, compact, grid, carousel, side-summary
* **Moderação com IA** — score de qualidade automático, detecção de fake reviews e conteúdo inadequado
* **Respostas sugeridas por IA** — gere respostas profissionais para cada avaliação com um clique
* **Importação em lote** — importe reviews de CSV, WooCommerce ou Shopify
* **Suporte a shortcode** — `[univer_reviews product_id="123"]`
* **Módulo Vitrine** — `[univer_vitrine]`, avaliações no estilo de loja com resumo, fotos e vídeos dos clientes, filtros por nota e "Carregar mais"
* **Bloco Gutenberg** — arraste e solte o widget na sua página de produto
* **Programa de recompensas** — ofereça cupons automáticos para quem deixar uma avaliação

**Compatível com:**

* WooCommerce 8.0+
* WordPress 6.0+
* PHP 8.1+
* Temas FSE e clássicos

== Installation ==

1. Faça upload do plugin para o diretório `/wp-content/plugins/`
2. Ative o plugin em "Plugins" no admin do WordPress
3. Acesse **UniverReviews → Configurações**
4. Insira sua **API Key** e **Workspace ID** (disponíveis no painel UniverReviews)
5. Adicione o shortcode `[univer_reviews]` na página de produto ou use o bloco Gutenberg

== Frequently Asked Questions ==

= Como obtenho minha API Key? =

Acesse [univerreviews.com](https://univerreviews.com), crie uma conta e vá em **Configurações → API Keys → Criar nova chave**.

= O plugin é compatível com temas de página construídos com Elementor ou Divi? =

Sim. O shortcode `[univer_reviews]` funciona em qualquer construtor de páginas que suporte shortcodes.

= O widget afeta o desempenho da minha loja? =

Não. O widget é carregado de forma assíncrona (`defer`) e tem menos de 20KB minificado. Ele não bloqueia o carregamento da página.

= Posso personalizar as cores do widget? =

Sim. Em **Configurações → Widget → Cor do tema** você define a cor principal do widget (estrelas, botões, destaques).

= O plugin funciona sem WooCommerce? =

Sim, mas alguns recursos (verificação de compra, sincronização automática de reviews de produto) dependem do WooCommerce.

= Como funciona a moderação com IA? =

Cada nova avaliação recebe um score de qualidade (0–100) calculado por IA. Reviews com score ≥ 70 são aprovadas automaticamente. Reviews com score < 30 ou sinais de fake são rejeitadas. As demais ficam em fila para revisão humana.

= Meus dados ficam armazenados onde? =

Avaliações são armazenadas na infraestrutura do UniverReviews (data centers no Brasil e EUA). O plugin WordPress é apenas um conector — os dados principais vivem na plataforma SaaS.

== Screenshots ==

1. Dashboard do plugin com estatísticas de sincronização
2. Lista de avaliações com status e notas
3. Página de configurações com API key e opções de widget
4. Widget em layout padrão exibido em página de produto WooCommerce
5. Widget em layout carousel

== Changelog ==

= 0.7.8 =
* Novo módulo Vitrine: shortcode `[univer_vitrine]` (alias `[univer_showcase]`) e opção de usá-lo na aba de avaliações do WooCommerce

= 0.1.0 =
* Lançamento inicial
* Sincronização bidirecional com a API UniverReviews
* Suporte a shortcode `[univer_reviews]`
* Bloco Gutenberg
* Página de configurações com teste de conexão
* Lista de avaliações no admin
* Importação via CSV
* Pull automático a cada hora via WP-Cron

== Upgrade Notice ==

= 0.1.0 =
Versão inicial. Não há atualizações anteriores.

== Privacy Policy ==

Este plugin envia dados de avaliações (nome do autor, e-mail, texto da avaliação, nota) para a API do UniverReviews (`api.univerreviews.com`). Os dados são processados de acordo com a [Política de Privacidade do UniverReviews](https://univerreviews.com/privacidade).

O plugin **não** armazena dados sensíveis localmente além dos metadados de sincronização (IDs de avaliações).
