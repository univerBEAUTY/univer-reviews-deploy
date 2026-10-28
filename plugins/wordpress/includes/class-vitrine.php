<?php
/**
 * Módulo Vitrine: [univer_vitrine product_id="123"]
 *
 * Bloco de avaliações no estilo de loja: card de resumo com nota e
 * "% recomendam", faixa de fotos e vídeos dos clientes, filtros por nota,
 * cards em coluna única com selo de compra verificada e botão
 * "Carregar mais". Renderiza o <univer-reviews> com layout="showcase",
 * independente do layout escolhido em Aparência, então a loja pode usar
 * a Vitrine numa página e outro layout no resto do site.
 *
 * @package UniverReviews
 */

declare(strict_types=1);

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class Univer_Vitrine {

    public const SHORTCODE = 'univer_vitrine';

    public function __construct() {
        add_shortcode( self::SHORTCODE, [ $this, 'render' ] );
        // Alias em inglês, igual ao id do layout no widget.
        add_shortcode( 'univer_showcase', [ $this, 'render' ] );
    }

    /**
     * Quando ligado, a aba "Avaliações" do WooCommerce usa a Vitrine em vez
     * do widget com o layout de Aparência.
     */
    public static function on_product_tab(): bool {
        return (string) get_option( 'univer_vitrine_on_product_tab', '0' ) === '1';
    }

    /**
     * Attributes:
     *   product_id         UUID, handle/slug, or platform_product_id (defaults to current WC product)
     *   workspace_id       workspace UUID (defaults to plugin settings)
     *   api_url            override SaaS base URL (defaults to plugin settings)
     *   locale             pt-BR | en-US | es-AR
     *   theme_color        hex usado em links e foco
     *   star_color         hex das estrelas
     *   star_shape         star | heart | flame | thumb | diamond
     *   per_page           avaliações por carregamento (default: módulo, depois workspace)
     *   show_write_review  'true' | 'false' — botão preto "Escrever avaliação"
     *   class              extra CSS class
     */
    public function render( array|string $atts, ?string $content = null, string $tag = self::SHORTCODE ): string {
        $raw_atts = is_array( $atts ) ? $atts : [];
        $atts = shortcode_atts(
            [
                'product_id'        => '',
                'workspace_id'      => get_option( 'univer_workspace_id', '' ),
                'api_url'           => get_option( 'univer_api_url', UNIVER_API_URL ),
                'locale'            => get_option( 'univer_widget_locale', 'pt-BR' ),
                'theme_color'       => get_option( 'univer_widget_theme_color', '#d4a850' ),
                'star_color'        => get_option( 'univer_widget_star_color', '#fbbf24' ),
                'star_shape'        => get_option( 'univer_widget_star_shape', 'star' ),
                'per_page'          => '',
                'show_write_review' => (string) get_option( 'univer_vitrine_show_write_review', '1' ) === '1' ? 'true' : 'false',
                'class'             => '',
            ],
            $atts,
            $tag
        );

        $product_id = sanitize_text_field( $atts['product_id'] );
        if ( empty( $product_id ) && is_singular() ) {
            $product_id = (string) get_the_ID();
        }

        if ( empty( $product_id ) ) {
            return current_user_can( 'edit_posts' )
                ? '<p style="color:#e53e3e;font-size:.85rem;">[' . esc_html( $tag ) . '] — '
                    . esc_html__( 'Defina o atributo product_id ou use em uma página de produto.', 'univer-reviews' )
                    . '</p>'
                : '';
        }

        $workspace_id = sanitize_text_field( $atts['workspace_id'] );
        if ( empty( $workspace_id ) ) {
            return current_user_can( 'edit_posts' )
                ? '<p style="color:#e53e3e">[' . esc_html( $tag ) . '] — workspace_id ausente.</p>'
                : '';
        }

        $locale      = in_array( $atts['locale'], [ 'pt-BR', 'en-US', 'es-AR' ], true ) ? $atts['locale'] : 'pt-BR';
        $theme_color = sanitize_hex_color( $atts['theme_color'] ) ?: '#d4a850';
        $star_color  = sanitize_hex_color( $atts['star_color'] ) ?: '#fbbf24';
        // Keep in sync with Univer_Admin::sanitize_star_shape().
        $star_shape  = in_array( (string) $atts['star_shape'], [ 'star', 'heart', 'flame', 'thumb', 'diamond' ], true ) ? $atts['star_shape'] : 'star';
        $show_wr     = in_array( $atts['show_write_review'], [ 'true', '1', 'yes' ], true ) ? 'true' : 'false';
        $extra_class = sanitize_html_class( $atts['class'] );
        $custom_css  = (string) get_option( 'univer_widget_custom_css', '' );

        // Mesma precedência do [univer_reviews]: atributo do shortcode >
        // ajuste do módulo > configuração do workspace servida pela API.
        $per_page = null;
        if ( array_key_exists( 'per_page', $raw_atts ) && $raw_atts['per_page'] !== '' ) {
            $per_page = (int) $atts['per_page'];
        } elseif ( (int) get_option( 'univer_vitrine_per_page', 0 ) > 0 ) {
            $per_page = (int) get_option( 'univer_vitrine_per_page', 0 );
        }
        $per_page_attr = $per_page === null ? '' : sprintf( 'per-page="%d"', max( 1, min( 100, $per_page ) ) );

        $custom_css_html = $custom_css !== ''
            ? sprintf( '<template data-custom-css>%s</template>', $custom_css )
            : '';

        $this->ensure_widget_enqueued();

        // show-qa="false": a Vitrine é só avaliações; Q&A segue no
        // [univer_qa]. O id de âncora é o mesmo do [univer_reviews] para o
        // [univer_rating] continuar rolando até aqui.
        return sprintf(
            '<div id="univer-reviews-anchor" class="univer-reviews-wrapper univer-vitrine %s">
                <univer-reviews
                    workspace-id="%s"
                    product-id="%s"
                    api-url="%s"
                    layout="showcase"
                    locale="%s"
                    theme-color="%s"
                    star-color="%s"
                    star-shape="%s"
                    show-qa="false"
                    show-write-review="%s"
                    %s
                >%s</univer-reviews>
            </div>',
            esc_attr( $extra_class ),
            esc_attr( $workspace_id ),
            esc_attr( $product_id ),
            esc_url( $atts['api_url'] ),
            esc_attr( $locale ),
            esc_attr( $theme_color ),
            esc_attr( $star_color ),
            esc_attr( $star_shape ),
            esc_attr( $show_wr ),
            $per_page_attr,
            $custom_css_html
        );
    }

    private function ensure_widget_enqueued(): void {
        if ( ! wp_script_is( 'univer-reviews-widget', 'enqueued' ) ) {
            wp_enqueue_script(
                'univer-reviews-widget',
                UNIVER_WIDGET_CDN,
                [],
                UNIVER_VERSION,
                [ 'strategy' => 'defer', 'in_footer' => true ]
            );
        }
    }
}
