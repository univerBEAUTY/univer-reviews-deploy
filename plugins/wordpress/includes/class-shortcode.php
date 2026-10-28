<?php
/**
 * Shortcode: [univer_reviews product_id="123"]
 *
 * @package UniverReviews
 */

declare(strict_types=1);

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class Univer_Shortcode {

    public function __construct() {
        add_shortcode( 'univer_reviews',          [ $this, 'render' ] );
        add_shortcode( 'univer_featured_reviews', [ $this, 'render_featured' ] );
        add_shortcode( 'univer_reviews_summary',  [ $this, 'render_summary' ] );
        add_shortcode( 'univer_qa',               [ $this, 'render_qa' ] );
        add_shortcode( 'univer_rating',           [ $this, 'render_rating' ] );
        add_shortcode( 'univer_ai_carousel',      [ $this, 'render_ai_carousel' ] );

        // Also support Gutenberg block as a classic shortcode wrapper
        add_action( 'init', [ $this, 'register_block' ] );
    }

    /**
     * [univer_rating] — minimal inline star + review-count rating.
     *
     * Output example: ⭐⭐⭐⭐⭐ (48 avaliações)
     *
     * Server-side render — fetches /public/summary/:product_id, caches the
     * result in a WP transient (5 min) and outputs plain HTML. No widget
     * script load, no JS execution, no layout shift. Ideal for placing
     * directly under the product title.
     *
     * Attributes:
     *   product_id     UUID, handle/slug, or platform_product_id (defaults to current WC product)
     *   workspace_id   workspace UUID (defaults to plugin settings)
     *   api_url        override SaaS base URL (defaults to plugin settings)
     *   color          fill color for stars (defaults to widget theme_color)
     *   size           star size in px (default 16)
     *   show_count     'true' | 'false' — toggles the "(N avaliações)" suffix
     *   show_value     'true' | 'false' — show numeric avg (e.g. "4.8") before the stars
     *   label          custom label suffix (default "avaliações")
     *   link           URL to link the rating to (e.g. anchor to reviews section)
     *   class          extra CSS class
     */
    public function render_rating( array|string $atts, ?string $content = null ): string {
        $atts = shortcode_atts(
            [
                'product_id'   => '',
                'workspace_id' => get_option( 'univer_workspace_id', '' ),
                'api_url'      => get_option( 'univer_api_url', UNIVER_API_URL ),
                // Inline rating stars use the dedicated star_color setting,
                // NOT theme_color — otherwise picking a dark accent (e.g.
                // black for buttons) paints every rating star black too.
                'color'        => get_option( 'univer_widget_star_color', '#fbbf24' ),
                'size'         => '16',
                'show_count'   => 'true',
                'show_value'   => 'false',
                'label'        => 'avaliações',
                'link'         => '',
                'class'        => '',
            ],
            $atts,
            'univer_rating'
        );

        $product_id = sanitize_text_field( $atts['product_id'] );
        if ( empty( $product_id ) ) {
            $product_id = $this->get_current_product_id();
        }
        if ( empty( $product_id ) ) {
            return '';
        }

        $workspace_id = sanitize_text_field( $atts['workspace_id'] );
        $api_url      = esc_url_raw( $atts['api_url'] );
        if ( empty( $workspace_id ) || empty( $api_url ) ) {
            return '';
        }

        $summary = $this->fetch_summary( $api_url, $workspace_id, $product_id );

        // Surface nothing when the product has no reviews yet — avoids
        // showing "0 avaliações" on every product page.
        if ( ! $summary || ! isset( $summary['total_reviews'] ) || (int) $summary['total_reviews'] === 0 ) {
            return '';
        }

        $avg        = (float) ( $summary['avg_rating'] ?? 0 );
        $total      = (int) $summary['total_reviews'];
        $color      = sanitize_hex_color( $atts['color'] ) ?: '#d4a850';
        $size       = max( 8, min( 64, (int) $atts['size'] ) );
        $show_count = in_array( $atts['show_count'], [ 'true', '1', 'yes' ], true );
        $show_value = in_array( $atts['show_value'], [ 'true', '1', 'yes' ], true );
        $label      = sanitize_text_field( $atts['label'] );
        $extra_cls  = sanitize_html_class( $atts['class'] );
        $link       = esc_url( $atts['link'] );

        $stars_html = $this->render_stars_inline( $avg, $color, $size );

        $value_html = $show_value
            ? sprintf( '<span class="univer-rating-value" style="font-weight:600;color:#222;">%s</span>', esc_html( number_format( $avg, 1 ) ) )
            : '';

        $count_html = $show_count
            ? sprintf(
                '<span class="univer-rating-count" style="color:#666;font-size:%dpx;">(%d %s)</span>',
                max( 11, (int) ( $size * 0.85 ) ),
                $total,
                esc_html( $label )
            )
            : '';

        // Stars group has a tight 1px gap; the outer wrapper keeps a wider
        // gap between value / stars / count so the three blocks stay
        // visually separated without spacing the individual stars apart.
        $stars_group = sprintf(
            '<span class="univer-rating-stars" style="display:inline-flex;align-items:center;gap:1px;">%s</span>',
            $stars_html
        );

        $inner = sprintf(
            '<span class="univer-rating-inline %s" style="display:inline-flex;align-items:center;gap:6px;vertical-align:middle;line-height:1;">%s%s%s</span>',
            esc_attr( $extra_cls ),
            $value_html,
            $stars_group,
            $count_html
        );

        // Smart scroll + WC tab activation. Works for ANY hash href.
        // Default target is the AI summary block (#univer-ai-summary-anchor)
        // because Woo themes typically render the reviews wall inside a
        // collapsed product tab — landing the customer in the AI summary
        // (which sits above/outside the tabs) is the better UX. The
        // helper runtime falls back to #univer-reviews-anchor if the AI
        // summary block isn't present on the page, so existing stores
        // without [univer_ai_carousel] keep working.
        $href = ! empty( $link ) ? $link : '#univer-ai-summary-anchor';

        $this->ensure_rating_jump_script();

        return sprintf(
            '<a href="%s" class="univer-rating-link" style="text-decoration:none;color:inherit;cursor:pointer;" onclick="return window.UniverRatingJump&&window.UniverRatingJump(event)">%s</a>',
            esc_attr( $href ),
            $inner
        );
    }

    /**
     * Inject the smart-scroll helper exactly once per page. Lives in the
     * footer (after all DOM exists) and binds to window so any number of
     * [univer_rating] instances on the same page share one implementation.
     */
    private function ensure_rating_jump_script(): void {
        static $injected = false;
        if ( $injected ) {
            return;
        }
        $injected = true;
        add_action( 'wp_footer', static function (): void {
            ?>
<script>
(function(){
    if(window.UniverRatingJump){return;}
    window.UniverRatingJump=function(e){
        try{
            var a=e.currentTarget||e.target;
            while(a&&a.tagName!=='A'){a=a.parentNode;}
            if(!a){return true;}
            var href=a.getAttribute('href')||'';
            if(href.charAt(0)!=='#'||href.length<2){return true;}
            var target=null;
            try{target=document.querySelector(href);}catch(err){target=document.getElementById(href.slice(1));}
            // Fallback chain: AI summary anchor → reviews wall anchor →
            // any element with [data-univer-summary-anchor]. The default
            // shortcode href is now the AI summary; when a store hasn't
            // rendered [univer_ai_carousel] we still scroll the user to
            // the reviews block instead of doing nothing.
            if(!target&&href==='#univer-ai-summary-anchor'){
                target=document.getElementById('univer-reviews-anchor')
                     ||document.querySelector('[data-univer-summary-anchor]');
                if(target&&history.replaceState){
                    try{history.replaceState(null,'','#'+target.id);}catch(err){}
                }
            }
            if(!target){return true;}
            e.preventDefault();
            var panel=target.closest('.woocommerce-Tabs-panel, .wc-tab, [role=tabpanel]');
            var tabLink=null;
            if(panel&&panel.id){
                tabLink=document.querySelector(
                    '.woocommerce-tabs a[href="#'+panel.id+'"], '+
                    '.wc-tabs a[href="#'+panel.id+'"], '+
                    '.tabs a[href="#'+panel.id+'"], '+
                    '[role=tab][aria-controls="'+panel.id+'"]'
                );
            }
            if(!tabLink){
                tabLink=document.querySelector(
                    '.woocommerce-tabs li.univer-reviews_tab a, '+
                    '.woocommerce-tabs li.reviews_tab a, '+
                    '.wc-tabs li.univer-reviews_tab a, '+
                    '.wc-tabs li.reviews_tab a, '+
                    '.tabs li.univer-reviews_tab a, '+
                    '.tabs li.reviews_tab a'
                );
            }
            if(tabLink){try{tabLink.click();}catch(err){}}
            var delay=tabLink?200:0;
            setTimeout(function(){
                try{target.scrollIntoView({behavior:'smooth',block:'start'});}catch(err){target.scrollIntoView();}
                if(history.replaceState){try{history.replaceState(null,'',href);}catch(err){}}
            },delay);
            return false;
        }catch(err){return true;}
    };
})();
</script>
            <?php
        }, 5 );
    }

    /**
     * Render inline SVG stars with fractional fill support (4.5 → 4 full + half).
     */
    private function render_stars_inline( float $avg, string $color, int $size ): string {
        $avg = max( 0.0, min( 5.0, $avg ) );
        $stroke = '#cbd1d8';

        $stars = '';
        for ( $i = 1; $i <= 5; $i++ ) {
            $diff = $avg - ( $i - 1 );
            if ( $diff >= 1 ) {
                $fill_pct = 100;
            } elseif ( $diff > 0 ) {
                $fill_pct = (int) round( $diff * 100 );
            } else {
                $fill_pct = 0;
            }

            $grad_id = 'unvr-star-' . wp_generate_uuid4();
            $stars  .= sprintf(
                '<svg width="%1$d" height="%1$d" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;">'
                . '<defs><linearGradient id="%2$s" x1="0" x2="1" y1="0" y2="0">'
                . '<stop offset="%3$d%%" stop-color="%4$s"/>'
                . '<stop offset="%3$d%%" stop-color="transparent"/>'
                . '</linearGradient></defs>'
                . '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" '
                . 'fill="url(#%2$s)" stroke="%5$s" stroke-width="1" stroke-linejoin="round"/>'
                . '</svg>',
                $size,
                esc_attr( $grad_id ),
                $fill_pct,
                esc_attr( $color ),
                esc_attr( $stroke )
            );
        }

        return $stars;
    }

    /**
     * GET /api/v1/public/summary/:product_id with 5-min WP transient cache.
     * Cache key is per (workspace, product) so multiple workspaces share the
     * same WordPress install without leaking summaries.
     */
    private function fetch_summary( string $api_url, string $workspace_id, string $product_id ): ?array {
        $cache_key = 'univer_rating_' . md5( $workspace_id . ':' . $product_id );
        $cached    = get_transient( $cache_key );
        if ( false !== $cached ) {
            return is_array( $cached ) ? $cached : null;
        }

        $endpoint = rtrim( $api_url, '/' ) . '/api/v1/public/summary/' . rawurlencode( $product_id );
        $response = wp_remote_get(
            $endpoint,
            [
                'timeout' => 3,
                'headers' => [
                    'X-Univer-Domain'   => isset( $_SERVER['HTTP_HOST'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_HOST'] ) ) : '',
                    'X-Univer-Workspace' => $workspace_id,
                    'Accept'             => 'application/json',
                ],
            ]
        );

        if ( is_wp_error( $response ) ) {
            // Cache a short null result so a misconfigured product doesn't hammer the API.
            set_transient( $cache_key, 'null', 60 );
            return null;
        }

        $code = (int) wp_remote_retrieve_response_code( $response );
        if ( 200 !== $code ) {
            set_transient( $cache_key, 'null', 60 );
            return null;
        }

        $body = wp_remote_retrieve_body( $response );
        $json = json_decode( $body, true );
        $data = is_array( $json ) && isset( $json['data'] ) && is_array( $json['data'] ) ? $json['data'] : null;

        // Cache for 5 minutes — keeps the product page snappy without
        // showing stale review counts for too long.
        set_transient( $cache_key, $data ?: 'null', 5 * MINUTE_IN_SECONDS );

        return $data;
    }

    /**
     * [univer_qa] — Q&A panel only (no reviews, no rating summary).
     *
     * Same product-id resolution as [univer_reviews]: explicit attr →
     * current WC product → empty (admin-visible error). Renders the
     * <univer-reviews> custom element with show-reviews="false" so the
     * widget shell forces activeTab=qa and skips review/summary fetches.
     */
    public function render_qa( array|string $atts, ?string $content = null ): string {
        $atts = shortcode_atts(
            [
                'product_id'   => '',
                'workspace_id' => get_option( 'univer_workspace_id', '' ),
                'locale'       => get_option( 'univer_widget_locale', 'pt-BR' ),
                'theme_color'  => get_option( 'univer_widget_theme_color', '#d4a850' ),
                'api_url'      => get_option( 'univer_api_url', UNIVER_API_URL ),
                'class'        => '',
            ],
            $atts,
            'univer_qa'
        );

        $product_id = sanitize_text_field( $atts['product_id'] );
        if ( empty( $product_id ) ) {
            $product_id = $this->get_current_product_id();
        }

        if ( empty( $product_id ) ) {
            return current_user_can( 'edit_posts' )
                ? '<p style="color:#e53e3e;font-size:.85rem;">[univer_qa] — '
                    . esc_html__( 'Defina product_id ou use em uma página de produto.', 'univer-reviews' )
                    . '</p>'
                : '';
        }

        $workspace_id = sanitize_text_field( $atts['workspace_id'] );
        if ( empty( $workspace_id ) ) {
            return current_user_can( 'edit_posts' )
                ? '<p style="color:#e53e3e">[univer_qa] — workspace_id ausente.</p>'
                : '';
        }

        $locale       = in_array( $atts['locale'], [ 'pt-BR', 'en-US', 'es-AR' ], true ) ? $atts['locale'] : 'pt-BR';
        $theme_color  = sanitize_hex_color( $atts['theme_color'] ) ?: '#d4a850';
        $api_url      = esc_url( $atts['api_url'] );
        $extra_class  = sanitize_html_class( $atts['class'] );

        $this->ensure_widget_enqueued();

        return sprintf(
            '<div class="univer-reviews-wrapper univer-qa-only %s">
                <univer-reviews
                    workspace-id="%s"
                    product-id="%s"
                    api-url="%s"
                    locale="%s"
                    theme-color="%s"
                    show-reviews="false"
                    show-qa="true"
                ></univer-reviews>
            </div>',
            esc_attr( $extra_class ),
            esc_attr( $workspace_id ),
            esc_attr( $product_id ),
            esc_attr( $api_url ),
            esc_attr( $locale ),
            esc_attr( $theme_color )
        );
    }

    /**
     * [univer_featured_reviews] — wall of featured reviews across the workspace.
     * Use on a dedicated landing page to showcase social proof.
     */
    public function render_featured( array|string $atts, ?string $content = null ): string {
        $atts = shortcode_atts(
            [
                'workspace_id' => get_option( 'univer_workspace_id', '' ),
                'layout'       => 'grid',
                'locale'       => get_option( 'univer_widget_locale', 'pt-BR' ),
                'theme_color'  => get_option( 'univer_widget_theme_color', '#d4a850' ),
                'limit'        => '30',
                'min_rating'   => '4',
                'api_url'      => get_option( 'univer_api_url', UNIVER_API_URL ),
                'class'        => '',
            ],
            $atts,
            'univer_featured_reviews'
        );

        $workspace_id = sanitize_text_field( $atts['workspace_id'] );
        if ( empty( $workspace_id ) ) {
            return current_user_can( 'edit_posts' )
                ? '<p style="color:#e53e3e">[univer_featured_reviews] — workspace_id ausente.</p>'
                : '';
        }

        $this->ensure_widget_enqueued();

        return sprintf(
            '<div id="univer-reviews-anchor" class="univer-reviews-wrapper %s">
                <univer-reviews
                    workspace-id="%s"
                    featured="true"
                    limit="%d"
                    min-rating="%d"
                    api-url="%s"
                    layout="%s"
                    locale="%s"
                    theme-color="%s"
                    show-write-review="false"
                ></univer-reviews>
            </div>',
            esc_attr( sanitize_html_class( $atts['class'] ) ),
            esc_attr( $workspace_id ),
            (int) $atts['limit'],
            (int) $atts['min_rating'],
            esc_url( $atts['api_url'] ),
            esc_attr( $this->sanitize_layout( $atts['layout'] ) ),
            esc_attr( in_array( $atts['locale'], [ 'pt-BR', 'en-US', 'es-AR' ], true ) ? $atts['locale'] : 'pt-BR' ),
            esc_attr( sanitize_hex_color( $atts['theme_color'] ) ?: '#d4a850' )
        );
    }

    /**
     * [univer_reviews_summary] — compact "★ 4.8 (123)" snippet, ideal for
     * product cards in shop/category loops or hero CTAs.
     */
    public function render_summary( array|string $atts, ?string $content = null ): string {
        $atts = shortcode_atts(
            [
                'product_id'   => '',
                'workspace_id' => get_option( 'univer_workspace_id', '' ),
                'api_url'      => get_option( 'univer_api_url', UNIVER_API_URL ),
                'theme_color'  => get_option( 'univer_widget_theme_color', '#d4a850' ),
            ],
            $atts,
            'univer_reviews_summary'
        );

        $product_id = sanitize_text_field( $atts['product_id'] ) ?: (string) $this->get_current_product_id();
        if ( empty( $product_id ) ) {
            return '';
        }

        $this->ensure_widget_enqueued();

        return sprintf(
            '<univer-reviews-summary workspace-id="%s" product-id="%s" api-url="%s" theme-color="%s"></univer-reviews-summary>',
            esc_attr( sanitize_text_field( $atts['workspace_id'] ) ),
            esc_attr( $product_id ),
            esc_url( $atts['api_url'] ),
            esc_attr( sanitize_hex_color( $atts['theme_color'] ) ?: '#d4a850' )
        );
    }

    /**
     * [univer_ai_carousel] — "Veja o que estão falando" media-first carousel.
     *
     * Renders <univer-ai-carousel> which fetches the AI-scored best reviews
     * (video > photo > quality text) from /public/ai-carousel/:product_id and
     * displays them as horizontal-scroll cards. Click opens a modal with the
     * full review + media gallery.
     *
     * Attributes:
     *   product_id     UUID, handle/slug, or platform_product_id (defaults to current WC product)
     *   workspace_id   workspace UUID (defaults to plugin settings)
     *   api_url        override SaaS base URL (defaults to plugin settings)
     *   title          section heading (default "Veja o que estão falando")
     *   limit          number of cards (default 15, max 30)
     *   theme_color    hex used on hover accents (defaults to widget theme color)
     *   star_color     hex for rating stars (defaults to widget star color)
     *   class          extra CSS class
     */
    public function render_ai_carousel( array|string $atts, ?string $content = null ): string {
        $atts = shortcode_atts(
            [
                'product_id'   => '',
                'workspace_id' => get_option( 'univer_workspace_id', '' ),
                'api_url'      => get_option( 'univer_api_url', UNIVER_API_URL ),
                'title'        => 'Veja o que estão falando',
                'limit'        => '15',
                // preset = "auto" (default, picks topics when curated, else
                //                 falls back to media carousel)
                //          "carousel" (force media-first cards)
                //          "topics"   (force topical stacks, blank if none)
                'preset'       => 'auto',
                'theme_color'  => get_option( 'univer_widget_theme_color', '#d4a850' ),
                'star_color'   => get_option( 'univer_widget_star_color', '#fbbf24' ),
                'class'        => '',
            ],
            $atts,
            'univer_ai_carousel'
        );

        $product_id = sanitize_text_field( $atts['product_id'] );
        if ( empty( $product_id ) ) {
            $product_id = $this->get_current_product_id();
        }
        $workspace_id = sanitize_text_field( $atts['workspace_id'] );
        $api_url      = esc_url_raw( $atts['api_url'] );

        if ( empty( $product_id ) || empty( $workspace_id ) || empty( $api_url ) ) {
            return '';
        }

        $this->ensure_widget_enqueued();

        $limit  = max( 1, min( 30, (int) $atts['limit'] ) );
        $preset = in_array( $atts['preset'], [ 'auto', 'carousel', 'topics' ], true ) ? $atts['preset'] : 'auto';

        // Wrapper gets a stable anchor id so the inline rating shortcode
        // ([univer_rating]) can scroll a clicker directly to the AI
        // summary block on themes where the main reviews wall lives
        // inside a collapsed WC product tab. Stays first because Woo
        // typically renders [univer_ai_carousel] above the tabs.
        return sprintf(
            '<div id="univer-ai-summary-anchor" class="univer-ai-carousel-wrapper %s"><univer-ai-carousel workspace-id="%s" product-id="%s" api-url="%s" data-title="%s" limit="%d" preset="%s" theme-color="%s" star-color="%s"></univer-ai-carousel></div>',
            esc_attr( sanitize_html_class( $atts['class'] ) ),
            esc_attr( $workspace_id ),
            esc_attr( $product_id ),
            esc_url( $api_url ),
            esc_attr( $atts['title'] ),
            $limit,
            esc_attr( $preset ),
            esc_attr( sanitize_hex_color( $atts['theme_color'] ) ?: '#d4a850' ),
            esc_attr( sanitize_hex_color( $atts['star_color'] ) ?: '#fbbf24' )
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

    /**
     * Render the [univer_reviews] shortcode.
     *
     * @param array       $atts    Shortcode attributes
     * @param string|null $content Inner content (unused)
     * @return string             HTML output
     */
    public function render( array|string $atts, ?string $content = null ): string {
        // Sentinel '' for per_page: when the caller did NOT explicitly pass
        // it, we OMIT the `per-page` attribute on the rendered element so the
        // widget falls back to the workspace-level config served by the API
        // (`GET /api/v1/public/widget-config`). This makes the Rails admin
        // dashboard the single source of truth for pagination size — match-
        // ing how the merchant expects "save slider → render reflects" to
        // behave. Setting per_page="N" in the shortcode itself still wins
        // (per-attribute precedence inside the widget).
        $raw_atts = is_array( $atts ) ? $atts : [];
        $atts = shortcode_atts(
            [
                'product_id'        => '',
                'workspace_id'      => get_option( 'univer_workspace_id', '' ),
                'layout'            => get_option( 'univer_widget_layout', 'default' ),
                'locale'            => get_option( 'univer_widget_locale', 'pt-BR' ),
                'theme_color'       => get_option( 'univer_widget_theme_color', '#d4a850' ),
                'star_color'        => get_option( 'univer_widget_star_color', '#fbbf24' ),
                'star_shape'        => get_option( 'univer_widget_star_shape', 'star' ),
                'show_qa'           => (string) get_option( 'univer_widget_show_qa', '1' ) === '1' ? 'true' : 'false',
                'show_write_review' => (string) get_option( 'univer_widget_show_write_review', '1' ) === '1' ? 'true' : 'false',
                'per_page'          => '',
                'api_url'           => get_option( 'univer_api_url', UNIVER_API_URL ),
                'class'             => '',
            ],
            $atts,
            'univer_reviews'
        );
        $per_page_explicit = array_key_exists( 'per_page', $raw_atts ) && $raw_atts['per_page'] !== '';

        // Resolve product_id: use shortcode attr, fall back to current WooCommerce product
        $product_id = sanitize_text_field( $atts['product_id'] );
        if ( empty( $product_id ) ) {
            $product_id = $this->get_current_product_id();
        }

        if ( empty( $product_id ) ) {
            if ( current_user_can( 'edit_posts' ) ) {
                return '<p style="color:#e53e3e;font-size:.85rem;">[univer_reviews] — '
                    . esc_html__( 'Defina o atributo product_id ou use em uma página de produto.', 'univer-reviews' )
                    . '</p>';
            }
            return '';
        }

        $workspace_id  = sanitize_text_field( $atts['workspace_id'] );
        $layout        = $this->sanitize_layout( $atts['layout'] );
        $locale        = in_array( $atts['locale'], [ 'pt-BR', 'en-US', 'es-AR' ], true ) ? $atts['locale'] : 'pt-BR';
        $theme_color   = sanitize_hex_color( $atts['theme_color'] ) ?: '#d4a850';
        $star_color    = sanitize_hex_color( $atts['star_color'] ) ?: '#fbbf24';
        // Inline shape allow-list — keep in sync with widget StarShape type
        // and Univer_Admin::sanitize_star_shape().
        $valid_shapes  = [ 'star', 'heart', 'flame', 'thumb', 'diamond' ];
        $star_shape    = in_array( (string) $atts['star_shape'], $valid_shapes, true ) ? $atts['star_shape'] : 'star';
        $show_qa       = in_array( $atts['show_qa'], [ 'true', '1', 'yes' ], true ) ? 'true' : 'false';
        $show_wr       = in_array( $atts['show_write_review'], [ 'true', '1', 'yes' ], true ) ? 'true' : 'false';
        $per_page      = $per_page_explicit ? max( 1, min( 100, (int) $atts['per_page'] ) ) : null;
        $api_url       = esc_url( $atts['api_url'] );
        $extra_class   = sanitize_html_class( $atts['class'] );
        $custom_css    = (string) get_option( 'univer_widget_custom_css', '' );

        // Ensure widget script is loaded
        if ( ! wp_script_is( 'univer-reviews-widget', 'enqueued' ) ) {
            wp_enqueue_script(
                'univer-reviews-widget',
                UNIVER_WIDGET_CDN,
                [],
                UNIVER_VERSION,
                [ 'strategy' => 'defer', 'in_footer' => true ]
            );
        }

        // Custom CSS is rendered as a <template> child of the widget element.
        // The widget reads template.innerHTML in connectedCallback and injects
        // it into its shadow DOM. Using a template (instead of an attribute)
        // avoids HTML escaping issues for larger CSS blobs.
        $custom_css_html = '';
        if ( ! empty( $custom_css ) ) {
            $custom_css_html = sprintf(
                '<template data-custom-css>%s</template>',
                $custom_css // template content is parsed as raw, no escape needed
            );
        }

        // Only emit per-page="..." when the caller explicitly passed it in
        // the shortcode. Otherwise omit it so the widget falls back to the
        // workspace config served by the API. Same source-of-truth rule
        // could later be applied to theme_color/locale/etc — leaving those
        // hardcoded for now to avoid a wider behaviour change in this fix.
        $per_page_attr = $per_page === null ? '' : sprintf( 'per-page="%d"', $per_page );

        return sprintf(
            '<div id="univer-reviews-anchor" class="univer-reviews-wrapper %s">
                <univer-reviews
                    workspace-id="%s"
                    product-id="%s"
                    api-url="%s"
                    layout="%s"
                    locale="%s"
                    theme-color="%s"
                    star-color="%s"
                    star-shape="%s"
                    show-qa="%s"
                    show-write-review="%s"
                    %s
                >%s</univer-reviews>
            </div>',
            esc_attr( $extra_class ),
            esc_attr( $workspace_id ),
            esc_attr( $product_id ),
            esc_attr( $api_url ),
            esc_attr( $layout ),
            esc_attr( $locale ),
            esc_attr( $theme_color ),
            esc_attr( $star_color ),
            esc_attr( $star_shape ),
            esc_attr( $show_qa ),
            esc_attr( $show_wr ),
            $per_page_attr,
            $custom_css_html
        );
    }

    // ─── Block Registration ────────────────────────────────────────────────

    public function register_block(): void {
        if ( ! function_exists( 'register_block_type' ) ) {
            return;
        }

        register_block_type(
            'univer-reviews/widget',
            [
                'title'           => __( 'UniverReviews Widget', 'univer-reviews' ),
                'description'     => __( 'Exibe avaliações do produto com o widget UniverReviews.', 'univer-reviews' ),
                'category'        => 'widgets',
                'render_callback' => function ( array $attrs ): string {
                    $product_id = sanitize_text_field( $attrs['productId'] ?? '' );
                    $layout     = sanitize_text_field( $attrs['layout'] ?? 'default' );
                    $locale     = sanitize_text_field( $attrs['locale'] ?? '' );
                    $class      = sanitize_html_class( $attrs['className'] ?? '' );

                    $shortcode = sprintf(
                        '[univer_reviews product_id="%s" layout="%s" locale="%s" class="%s"]',
                        esc_attr( $product_id ),
                        esc_attr( $layout ),
                        esc_attr( $locale ),
                        esc_attr( $class )
                    );

                    return do_shortcode( $shortcode );
                },
                'attributes'      => [
                    'productId' => [ 'type' => 'string', 'default' => '' ],
                    'layout'    => [ 'type' => 'string', 'default' => 'default' ],
                    'locale'    => [ 'type' => 'string', 'default' => '' ],
                    'className' => [ 'type' => 'string', 'default' => '' ],
                ],
            ]
        );
    }

    // ─── Helpers ──────────────────────────────────────────────────────────

    /**
     * Attempt to get the current product ID from WooCommerce or post ID.
     */
    private function get_current_product_id(): string {
        if ( is_singular() ) {
            return (string) get_the_ID();
        }
        return '';
    }

    private function sanitize_layout( string $layout ): string {
        $valid = [ 'default', 'compact', 'grid', 'carousel', 'side-summary', 'showcase' ];
        return in_array( $layout, $valid, true ) ? $layout : 'default';
    }
}
