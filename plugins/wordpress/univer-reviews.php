<?php
/**
 * Plugin Name:       UniverReviews
 * Plugin URI:        https://univerreviews.com
 * Description:       Integração com a plataforma UniverReviews — sincronize avaliações com IA, exiba o widget e gerencie respostas diretamente no WordPress.
 * Version:           0.7.8
 * Requires at least: 6.0
 * Requires PHP:      8.1
 * Author:            UniverReviews
 * Author URI:        https://univerreviews.com
 * License:           GPL v2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       univer-reviews
 * Domain Path:       /languages
 *
 * @package UniverReviews
 */

declare(strict_types=1);

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// ─── Constants ────────────────────────────────────────────────────────────────

define( 'UNIVER_VERSION',     '0.7.8' );
define( 'UNIVER_PLUGIN_DIR',  plugin_dir_path( __FILE__ ) );
define( 'UNIVER_PLUGIN_URL',  plugin_dir_url( __FILE__ ) );
define( 'UNIVER_API_URL',     'https://api.univerreviews.com' );
define( 'UNIVER_WIDGET_CDN',  'https://api.univerreviews.com/widget.js' );
define( 'UNIVER_MIN_PHP',     '8.1' );
define( 'UNIVER_MIN_WP',      '6.0' );

// ─── Compatibility check ──────────────────────────────────────────────────────

if ( version_compare( PHP_VERSION, UNIVER_MIN_PHP, '<' ) ) {
    add_action( 'admin_notices', function () {
        printf(
            '<div class="notice notice-error"><p>%s</p></div>',
            esc_html( sprintf(
                /* translators: %s: required PHP version */
                __( 'UniverReviews requer PHP %s ou superior.', 'univer-reviews' ),
                UNIVER_MIN_PHP
            ) )
        );
    } );
    return;
}

// ─── Autoload includes ────────────────────────────────────────────────────────

$includes = [
    'includes/class-univer-reviews.php',
    'includes/class-saas-sync.php',
    'includes/class-admin.php',
    'includes/class-shortcode.php',
    'includes/class-vitrine.php',
];

foreach ( $includes as $file ) {
    $path = UNIVER_PLUGIN_DIR . $file;
    if ( file_exists( $path ) ) {
        require_once $path;
    }
}

// ─── Activation / Deactivation Hooks ─────────────────────────────────────────

register_activation_hook( __FILE__, function () {
    if ( ! current_user_can( 'activate_plugins' ) ) {
        return;
    }

    // Schedule sync cron if not already scheduled
    if ( ! wp_next_scheduled( 'univer_sync_reviews' ) ) {
        wp_schedule_event( time(), 'hourly', 'univer_sync_reviews' );
    }

    // Store activation timestamp for onboarding
    add_option( 'univer_activated_at', time() );
    add_option( 'univer_version', UNIVER_VERSION );
    add_option( 'univer_api_url', UNIVER_API_URL );
    add_option( 'univer_widget_layout', 'default' );
    add_option( 'univer_widget_locale', get_locale() === 'pt_BR' ? 'pt-BR' : 'en-US' );
    add_option( 'univer_widget_theme_color', '#d4a850' );
    add_option( 'univer_sync_enabled', '1' );
    add_option( 'univer_auto_pull', '1' );
} );

register_deactivation_hook( __FILE__, function () {
    if ( ! current_user_can( 'deactivate_plugins' ) ) {
        return;
    }
    wp_clear_scheduled_hook( 'univer_sync_reviews' );
} );

register_uninstall_hook( __FILE__, 'univer_reviews_uninstall' );

function univer_reviews_uninstall(): void {
    if ( ! current_user_can( 'delete_plugins' ) ) {
        return;
    }

    // Remove all plugin options — only on full uninstall
    $options = [
        'univer_activated_at', 'univer_version', 'univer_api_url', 'univer_api_key',
        'univer_workspace_id', 'univer_widget_layout', 'univer_widget_locale',
        'univer_widget_theme_color', 'univer_sync_enabled', 'univer_auto_pull',
        'univer_last_pull_at', 'univer_last_push_at',
        'univer_vitrine_on_product_tab', 'univer_vitrine_per_page', 'univer_vitrine_show_write_review',
    ];

    foreach ( $options as $option ) {
        delete_option( $option );
    }

    wp_clear_scheduled_hook( 'univer_sync_reviews' );
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

add_action( 'plugins_loaded', function () {
    load_plugin_textdomain( 'univer-reviews', false, dirname( plugin_basename( __FILE__ ) ) . '/languages' );

    if ( class_exists( 'Univer_Reviews' ) ) {
        Univer_Reviews::get_instance();
    }
} );
