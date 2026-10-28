<?php
/**
 * Bootstrap / Orchestrator
 *
 * @package UniverReviews
 */

declare(strict_types=1);

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

final class Univer_Reviews {

    private static ?self $instance = null;

    private Univer_SaaS_Sync $sync;
    private Univer_Admin $admin;
    private Univer_Shortcode $shortcode;
    private Univer_Vitrine $vitrine;

    // ─── Singleton ────────────────────────────────────────────────────────────

    private function __construct() {
        $this->sync      = new Univer_SaaS_Sync();
        $this->shortcode = new Univer_Shortcode();
        $this->vitrine   = new Univer_Vitrine();

        if ( is_admin() ) {
            $this->admin = new Univer_Admin();
        }

        $this->register_hooks();
    }

    public static function get_instance(): self {
        if ( null === self::$instance ) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    // ─── Hooks ───────────────────────────────────────────────────────────────

    private function register_hooks(): void {
        // Cron: pull reviews from SaaS hourly
        add_action( 'univer_sync_reviews', [ $this->sync, 'pull_reviews' ] );

        // Enqueue widget script on front-end when shortcode is present
        add_action( 'wp_enqueue_scripts', [ $this, 'maybe_enqueue_widget' ] );

        // REST API endpoint for webhook push from SaaS
        add_action( 'rest_api_init', [ $this, 'register_rest_routes' ] );

        // Add "Settings" link on plugins page
        add_filter( 'plugin_action_links_' . plugin_basename( UNIVER_PLUGIN_DIR . 'univer-reviews.php' ), [ $this, 'plugin_action_links' ] );

        // ─── WooCommerce integration ─────────────────────────────────────────
        // Declare HPOS compatibility (WC 7.1+ High-Performance Order Storage).
        add_action( 'before_woocommerce_init', [ $this, 'declare_hpos_compat' ] );

        // Only wire WC-specific hooks when WooCommerce is actually loaded.
        add_action( 'plugins_loaded', [ $this, 'maybe_register_woocommerce_hooks' ], 20 );
    }

    public function declare_hpos_compat(): void {
        if ( class_exists( '\Automattic\WooCommerce\Utilities\FeaturesUtil' ) ) {
            \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility(
                'custom_order_tables',
                UNIVER_PLUGIN_DIR . 'univer-reviews.php',
                true
            );
        }
    }

    public function maybe_register_woocommerce_hooks(): void {
        if ( ! class_exists( 'WooCommerce' ) ) {
            return;
        }

        // Only enable replacements when admin opted in (default: on).
        $auto_tab    = (string) get_option( 'univer_auto_tab', '1' ) === '1';
        $auto_loop   = (string) get_option( 'univer_auto_loop_rating', '1' ) === '1';
        $replace_def = (string) get_option( 'univer_replace_default_reviews', '1' ) === '1';

        if ( $auto_tab ) {
            // Replace the native WooCommerce "Reviews" tab with our widget tab.
            add_filter( 'woocommerce_product_tabs', [ $this, 'register_reviews_tab' ], 98 );
            add_action( 'wp_enqueue_scripts', [ $this, 'enqueue_widget_on_woo_product' ] );
        }

        if ( $auto_loop ) {
            // Inject summary star rating under each product card on shop/category.
            add_action( 'woocommerce_after_shop_loop_item_title', [ $this, 'render_loop_rating' ], 6 );
        }

        if ( $replace_def ) {
            // Strip the native review form/list so we are the only review surface.
            add_filter( 'comments_template', [ $this, 'noop_default_reviews' ], 99 );
        }
    }

    public function register_reviews_tab( array $tabs ): array {
        // Remove WooCommerce's built-in tab and replace with ours so we are
        // the single source of truth on the product page.
        unset( $tabs['reviews'] );

        $tabs['univer_reviews'] = [
            'title'    => __( 'Avaliações', 'univer-reviews' ),
            'priority' => 30,
            'callback' => function () {
                global $product;
                if ( ! $product ) {
                    return;
                }
                // Módulo Vitrine ligado → a aba usa o layout de loja.
                echo do_shortcode( sprintf(
                    '[%s product_id="%d"]',
                    Univer_Vitrine::on_product_tab() ? Univer_Vitrine::SHORTCODE : 'univer_reviews',
                    (int) $product->get_id()
                ) );
            },
        ];
        return $tabs;
    }

    public function enqueue_widget_on_woo_product(): void {
        if ( ! function_exists( 'is_product' ) || ! is_product() ) {
            return;
        }
        wp_enqueue_script(
            'univer-reviews-widget',
            UNIVER_WIDGET_CDN,
            [],
            UNIVER_VERSION,
            [ 'strategy' => 'defer', 'in_footer' => true ]
        );
    }

    public function render_loop_rating(): void {
        global $product;
        if ( ! $product ) {
            return;
        }
        $workspace_id = get_option( 'univer_workspace_id', '' );
        if ( empty( $workspace_id ) ) {
            return;
        }
        $api_url     = get_option( 'univer_api_url', UNIVER_API_URL );
        $theme_color = get_option( 'univer_widget_theme_color', '#d4a850' );

        wp_enqueue_script(
            'univer-reviews-widget',
            UNIVER_WIDGET_CDN,
            [],
            UNIVER_VERSION,
            [ 'strategy' => 'defer', 'in_footer' => true ]
        );

        printf(
            '<div class="univer-loop-rating"><univer-reviews-summary workspace-id="%s" product-id="%d" api-url="%s" theme-color="%s"></univer-reviews-summary></div>',
            esc_attr( $workspace_id ),
            (int) $product->get_id(),
            esc_url( $api_url ),
            esc_attr( $theme_color )
        );
    }

    public function noop_default_reviews( string $template ): string {
        // Returning a minimal template suppresses the native review section.
        $blank = UNIVER_PLUGIN_DIR . 'templates/empty-comments.php';
        if ( ! file_exists( $blank ) ) {
            // Fallback: write an empty file lazily.
            @mkdir( dirname( $blank ), 0755, true );
            @file_put_contents( $blank, "<?php // intentionally empty — UniverReviews replaces native reviews.\n" );
        }
        return $blank;
    }

    // ─── Widget Enqueue ───────────────────────────────────────────────────────

    public function maybe_enqueue_widget(): void {
        global $post;

        if ( ! is_singular() || ! isset( $post->post_content ) ) {
            return;
        }

        // Only load widget script if page contains one of the widget shortcodes
        $has_widget = false;
        foreach ( [ 'univer_reviews', Univer_Vitrine::SHORTCODE, 'univer_showcase' ] as $tag ) {
            if ( has_shortcode( $post->post_content, $tag ) ) {
                $has_widget = true;
                break;
            }
        }
        if ( ! $has_widget ) {
            return;
        }

        wp_enqueue_script(
            'univer-reviews-widget',
            UNIVER_WIDGET_CDN,
            [],
            UNIVER_VERSION,
            [ 'strategy' => 'defer', 'in_footer' => true ]
        );
    }

    // ─── REST Routes ──────────────────────────────────────────────────────────

    public function register_rest_routes(): void {
        register_rest_route(
            'univer-reviews/v1',
            '/webhook',
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'callback'            => [ $this, 'handle_webhook' ],
                'permission_callback' => [ $this, 'verify_webhook_signature' ],
            ]
        );
    }

    public function verify_webhook_signature( WP_REST_Request $request ): bool {
        $signature = $request->get_header( 'X-Univer-Signature' );
        $api_key   = get_option( 'univer_api_key', '' );

        if ( empty( $signature ) || empty( $api_key ) ) {
            return false;
        }

        $body     = $request->get_body();
        $expected = 'sha256=' . hash_hmac( 'sha256', $body, $api_key );

        return hash_equals( $expected, $signature );
    }

    public function handle_webhook( WP_REST_Request $request ): WP_REST_Response {
        $payload = $request->get_json_params();
        $event   = $payload['event'] ?? '';

        switch ( $event ) {
            case 'review.approved':
                $this->sync->handle_review_approved( $payload['data'] ?? [] );
                break;
            case 'review.rejected':
                $this->sync->handle_review_rejected( $payload['data'] ?? [] );
                break;
            case 'review.replied':
                $this->sync->handle_review_replied( $payload['data'] ?? [] );
                break;
        }

        return new WP_REST_Response( [ 'received' => true ], 200 );
    }

    // ─── Plugin Action Links ───────────────────────────────────────────────────

    public function plugin_action_links( array $links ): array {
        $settings_link = sprintf(
            '<a href="%s">%s</a>',
            esc_url( admin_url( 'admin.php?page=univer-reviews-settings' ) ),
            __( 'Configurações', 'univer-reviews' )
        );
        array_unshift( $links, $settings_link );
        return $links;
    }
}
