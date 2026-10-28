<?php
/**
 * Admin pages: Settings, Reviews list, Import
 *
 * @package UniverReviews
 */

declare(strict_types=1);

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class Univer_Admin {

    public function __construct() {
        add_action( 'admin_menu', [ $this, 'register_menus' ] );
        add_action( 'admin_init', [ $this, 'register_settings' ] );
        add_action( 'admin_enqueue_scripts', [ $this, 'enqueue_assets' ] );
        add_action( 'admin_notices', [ $this, 'show_notices' ] );

        // AJAX: trigger manual pull
        add_action( 'wp_ajax_univer_manual_pull', [ $this, 'ajax_manual_pull' ] );

        // AJAX: test API connection
        add_action( 'wp_ajax_univer_test_connection', [ $this, 'ajax_test_connection' ] );
    }

    // ─── Menus ───────────────────────────────────────────────────────────────

    public function register_menus(): void {
        add_menu_page(
            __( 'UniverReviews', 'univer-reviews' ),
            __( 'UniverReviews', 'univer-reviews' ),
            'manage_options',
            'univer-reviews',
            [ $this, 'page_dashboard' ],
            $this->get_menu_icon(),
            56
        );

        add_submenu_page(
            'univer-reviews',
            __( 'Dashboard', 'univer-reviews' ),
            __( 'Dashboard', 'univer-reviews' ),
            'manage_options',
            'univer-reviews',
            [ $this, 'page_dashboard' ]
        );

        add_submenu_page(
            'univer-reviews',
            __( 'Avaliações', 'univer-reviews' ),
            __( 'Avaliações', 'univer-reviews' ),
            'edit_posts',
            'univer-reviews-list',
            [ $this, 'page_reviews' ]
        );

        add_submenu_page(
            'univer-reviews',
            __( 'Importar', 'univer-reviews' ),
            __( 'Importar', 'univer-reviews' ),
            'manage_options',
            'univer-reviews-import',
            [ $this, 'page_import' ]
        );

        add_submenu_page(
            'univer-reviews',
            __( 'Configurações', 'univer-reviews' ),
            __( 'Configurações', 'univer-reviews' ),
            'manage_options',
            'univer-reviews-settings',
            [ $this, 'page_settings' ]
        );
    }

    // ─── Settings Registration ────────────────────────────────────────────────

    public function register_settings(): void {
        $settings = [
            'univer_api_key'                  => [ 'sanitize_callback' => 'sanitize_text_field' ],
            'univer_workspace_id'             => [ 'sanitize_callback' => 'sanitize_text_field' ],
            'univer_api_url'                  => [ 'sanitize_callback' => 'esc_url_raw', 'default' => UNIVER_API_URL ],
            'univer_widget_layout'            => [ 'sanitize_callback' => [ $this, 'sanitize_layout' ] ],
            'univer_widget_locale'            => [ 'sanitize_callback' => 'sanitize_text_field' ],
            'univer_widget_theme_color'       => [ 'sanitize_callback' => 'sanitize_hex_color' ],
            'univer_widget_star_color'        => [ 'sanitize_callback' => 'sanitize_hex_color' ],
            'univer_widget_star_shape'        => [ 'sanitize_callback' => [ $this, 'sanitize_star_shape' ] ],
            'univer_widget_show_qa'           => [ 'sanitize_callback' => 'sanitize_text_field' ],
            'univer_widget_show_write_review' => [ 'sanitize_callback' => 'sanitize_text_field' ],
            'univer_widget_per_page'          => [ 'sanitize_callback' => 'absint' ],
            'univer_widget_custom_css'        => [ 'sanitize_callback' => [ $this, 'sanitize_custom_css' ] ],
            'univer_sync_enabled'             => [ 'sanitize_callback' => 'sanitize_text_field' ],
            'univer_auto_pull'                => [ 'sanitize_callback' => 'sanitize_text_field' ],
            // ── WooCommerce auto-integration toggles ─────────────────────────
            'univer_auto_tab'                 => [ 'sanitize_callback' => 'sanitize_text_field' ],
            'univer_auto_loop_rating'         => [ 'sanitize_callback' => 'sanitize_text_field' ],
            'univer_replace_default_reviews'  => [ 'sanitize_callback' => 'sanitize_text_field' ],
            // ── Módulo Vitrine ───────────────────────────────────────────────
            'univer_vitrine_on_product_tab'    => [ 'sanitize_callback' => 'sanitize_text_field' ],
            'univer_vitrine_show_write_review' => [ 'sanitize_callback' => 'sanitize_text_field' ],
            'univer_vitrine_per_page'          => [ 'sanitize_callback' => 'absint' ],
        ];

        foreach ( $settings as $option => $args ) {
            register_setting( 'univer_reviews_settings', $option, $args );
        }
    }

    public function sanitize_layout( string $layout ): string {
        // Keep this list in sync with apps/widget/src/widget.ts → type Layout.
        $valid = [ 'default', 'compact', 'grid', 'carousel', 'showcase' ];
        return in_array( $layout, $valid, true ) ? $layout : 'default';
    }

    public function sanitize_star_shape( string $shape ): string {
        $valid = [ 'star', 'heart', 'flame', 'thumb', 'diamond' ];
        return in_array( $shape, $valid, true ) ? $shape : 'star';
    }

    /**
     * Allow CSS but strip the most obvious exfiltration vectors. The widget
     * sandbox-renders this inside its shadow DOM, so the blast radius is
     * already small — this just keeps a confused admin from pasting hostile
     * payloads from random tutorials.
     */
    public function sanitize_custom_css( string $css ): string {
        // Drop <script> / <style> tags and javascript: URLs.
        $css = preg_replace( '/<\/?(script|style)[^>]*>/i', '', $css );
        $css = preg_replace( '/javascript\s*:/i', '', $css );
        // Cap at 20 KB to keep stylesheet bloat in check.
        return substr( $css, 0, 20000 );
    }

    private function star_shape_choices(): array {
        return [
            'star'    => '★ Estrela',
            'heart'   => '♥ Coração',
            'flame'   => '🔥 Chama',
            'thumb'   => '👍 Curtir',
            'diamond' => '◆ Diamante',
        ];
    }

    /**
     * Layout options with PT-BR labels and short descriptions for the
     * settings UI. Adding a key here AND in sanitize_layout() above is
     * enough to expose a new layout — keep this synced with the widget.
     */
    private function layout_choices(): array {
        return [
            'default'  => [
                'label' => __( 'Padrão (lista vertical)', 'univer-reviews' ),
                'hint'  => __( 'Avaliações empilhadas em coluna única — formato tradicional.', 'univer-reviews' ),
            ],
            'compact'  => [
                'label' => __( 'Compacto (lista densa)', 'univer-reviews' ),
                'hint'  => __( 'Mesma estrutura vertical do padrão, sem espaçamento entre cards.', 'univer-reviews' ),
            ],
            'grid'     => [
                'label' => __( 'Grade (4 colunas desktop, 1 no mobile)', 'univer-reviews' ),
                'hint'  => __( 'Recomendado para páginas de produto: 4 colunas no desktop, 2 no tablet, 1 no celular.', 'univer-reviews' ),
            ],
            'carousel' => [
                'label' => __( 'Carrossel (scroll horizontal)', 'univer-reviews' ),
                'hint'  => __( 'Cards rolam horizontalmente — bom para destacar reviews em landing pages.', 'univer-reviews' ),
            ],
            'showcase' => [
                'label' => __( 'Vitrine (estilo loja)', 'univer-reviews' ),
                'hint'  => __( 'Resumo em card com % que recomenda, fotos e vídeos dos clientes, filtros por nota e botão "Carregar mais".', 'univer-reviews' ),
            ],
        ];
    }

    // ─── Assets ──────────────────────────────────────────────────────────────

    public function enqueue_assets( string $hook ): void {
        if ( strpos( $hook, 'univer-reviews' ) === false ) {
            return;
        }

        wp_enqueue_style(
            'univer-admin',
            UNIVER_PLUGIN_URL . 'assets/admin.css',
            [],
            UNIVER_VERSION
        );
    }

    // ─── Notices ─────────────────────────────────────────────────────────────

    public function show_notices(): void {
        $screen = get_current_screen();
        if ( ! $screen || strpos( $screen->id, 'univer-reviews' ) === false ) {
            return;
        }

        $api_key      = get_option( 'univer_api_key', '' );
        $workspace_id = get_option( 'univer_workspace_id', '' );

        if ( empty( $api_key ) || empty( $workspace_id ) ) {
            printf(
                '<div class="notice notice-warning is-dismissible"><p>%s <a href="%s">%s</a></p></div>',
                esc_html__( 'UniverReviews não está configurado.', 'univer-reviews' ),
                esc_url( admin_url( 'admin.php?page=univer-reviews-settings' ) ),
                esc_html__( 'Configure agora →', 'univer-reviews' )
            );
        }
    }

    // ─── Dashboard Page ───────────────────────────────────────────────────────

    public function page_dashboard(): void {
        $api_key      = get_option( 'univer_api_key', '' );
        $workspace_id = get_option( 'univer_workspace_id', '' );
        $last_pull    = get_option( 'univer_last_pull_at', '' );
        $last_push    = get_option( 'univer_last_push_at', '' );
        ?>
        <div class="wrap">
            <h1><?php esc_html_e( 'UniverReviews', 'univer-reviews' ); ?></h1>

            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;margin-top:20px">
                <?php $this->stat_card( __( 'Status', 'univer-reviews' ), $api_key ? '🟢 ' . __( 'Conectado', 'univer-reviews' ) : '🔴 ' . __( 'Desconectado', 'univer-reviews' ) ); ?>
                <?php $this->stat_card( __( 'Workspace ID', 'univer-reviews' ), $workspace_id ? esc_html( $workspace_id ) : '—' ); ?>
                <?php $this->stat_card( __( 'Última sincronização', 'univer-reviews' ), $last_pull ? esc_html( human_time_diff( strtotime( $last_pull ), time() ) . ' atrás' ) : '—' ); ?>
            </div>

            <div style="margin-top:24px">
                <button class="button button-primary" id="univer-manual-pull">
                    <?php esc_html_e( 'Sincronizar agora', 'univer-reviews' ); ?>
                </button>
                <span id="univer-pull-status" style="margin-left:12px;color:#666"></span>
            </div>

            <script>
            document.getElementById('univer-manual-pull')?.addEventListener('click', function() {
                const btn = this;
                const status = document.getElementById('univer-pull-status');
                btn.disabled = true;
                status.textContent = '<?php echo esc_js( __( 'Sincronizando…', 'univer-reviews' ) ); ?>';

                fetch(ajaxurl, {
                    method: 'POST',
                    body: new URLSearchParams({
                        action: 'univer_manual_pull',
                        nonce: '<?php echo esc_js( wp_create_nonce( 'univer_manual_pull' ) ); ?>'
                    })
                }).then(r => r.json()).then(d => {
                    status.textContent = d.success ? '<?php echo esc_js( __( 'Sincronizado com sucesso!', 'univer-reviews' ) ); ?>' : '<?php echo esc_js( __( 'Erro ao sincronizar.', 'univer-reviews' ) ); ?>';
                    btn.disabled = false;
                }).catch(() => {
                    status.textContent = '<?php echo esc_js( __( 'Erro de conexão.', 'univer-reviews' ) ); ?>';
                    btn.disabled = false;
                });
            });
            </script>
        </div>
        <?php
    }

    private function stat_card( string $label, string $value ): void {
        printf(
            '<div style="background:#fff;border:1px solid #ddd;border-radius:6px;padding:16px">
                <div style="font-size:.75rem;color:#888;font-weight:600;text-transform:uppercase;margin-bottom:6px">%s</div>
                <div style="font-size:1rem;font-weight:600">%s</div>
            </div>',
            esc_html( $label ),
            $value // already escaped by caller
        );
    }

    // ─── Reviews List Page ────────────────────────────────────────────────────

    public function page_reviews(): void {
        $paged   = max( 1, (int) ( $_GET['paged'] ?? 1 ) );
        $per_page = 20;

        $comments = get_comments( [
            'type'    => 'review',
            'number'  => $per_page,
            'offset'  => ( $paged - 1 ) * $per_page,
            'status'  => 'all',
            'orderby' => 'comment_date',
            'order'   => 'DESC',
        ] );

        $total = get_comments( [
            'type'   => 'review',
            'count'  => true,
            'status' => 'all',
        ] );
        ?>
        <div class="wrap">
            <h1><?php esc_html_e( 'Avaliações', 'univer-reviews' ); ?></h1>

            <table class="wp-list-table widefat fixed striped" style="margin-top:16px">
                <thead>
                    <tr>
                        <th><?php esc_html_e( 'Autor', 'univer-reviews' ); ?></th>
                        <th><?php esc_html_e( 'Avaliação', 'univer-reviews' ); ?></th>
                        <th><?php esc_html_e( 'Nota', 'univer-reviews' ); ?></th>
                        <th><?php esc_html_e( 'Produto', 'univer-reviews' ); ?></th>
                        <th><?php esc_html_e( 'Status', 'univer-reviews' ); ?></th>
                        <th><?php esc_html_e( 'Data', 'univer-reviews' ); ?></th>
                        <th><?php esc_html_e( 'UniverReviews', 'univer-reviews' ); ?></th>
                    </tr>
                </thead>
                <tbody>
                    <?php if ( empty( $comments ) ) : ?>
                        <tr><td colspan="7"><?php esc_html_e( 'Nenhuma avaliação encontrada.', 'univer-reviews' ); ?></td></tr>
                    <?php else : ?>
                        <?php foreach ( $comments as $comment ) :
                            $rating       = (int) get_comment_meta( $comment->comment_ID, 'rating', true );
                            $univer_id    = get_comment_meta( $comment->comment_ID, '_univer_review_id', true );
                            $product      = get_post( (int) $comment->comment_post_ID );
                            $stars        = str_repeat( '★', $rating ) . str_repeat( '☆', 5 - $rating );
                            $status_map   = [
                                '1'     => '<span style="color:#2d8a4e">● Aprovada</span>',
                                '0'     => '<span style="color:#e6a817">● Pendente</span>',
                                'spam'  => '<span style="color:#e53e3e">● Spam</span>',
                                'trash' => '<span style="color:#999">● Lixo</span>',
                            ];
                            $status_html  = $status_map[ $comment->comment_approved ] ?? '<span>—</span>';
                        ?>
                        <tr>
                            <td>
                                <strong><?php echo esc_html( $comment->comment_author ); ?></strong><br>
                                <small><?php echo esc_html( $comment->comment_author_email ); ?></small>
                            </td>
                            <td><?php echo esc_html( wp_trim_words( $comment->comment_content, 12, '…' ) ); ?></td>
                            <td style="color:#d4a850"><?php echo esc_html( $stars ); ?></td>
                            <td><?php echo $product ? esc_html( get_the_title( $product ) ) : '—'; ?></td>
                            <td><?php echo $status_html; /* already escaped */ ?></td>
                            <td><?php echo esc_html( wp_date( 'd/m/Y', strtotime( $comment->comment_date ) ) ); ?></td>
                            <td>
                                <?php if ( $univer_id ) : ?>
                                    <small style="color:#2d8a4e">✓ <?php echo esc_html( substr( $univer_id, 0, 8 ) . '…' ); ?></small>
                                <?php else : ?>
                                    <small style="color:#999">—</small>
                                <?php endif; ?>
                            </td>
                        </tr>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </tbody>
            </table>

            <?php
            $total_pages = (int) ceil( (int) $total / $per_page );
            if ( $total_pages > 1 ) :
                echo '<div style="margin-top:16px">';
                echo paginate_links( [
                    'base'      => add_query_arg( 'paged', '%#%' ),
                    'format'    => '',
                    'current'   => $paged,
                    'total'     => $total_pages,
                ] );
                echo '</div>';
            endif;
            ?>
        </div>
        <?php
    }

    // ─── Import Page ──────────────────────────────────────────────────────────

    public function page_import(): void {
        ?>
        <div class="wrap">
            <h1><?php esc_html_e( 'Importar Avaliações', 'univer-reviews' ); ?></h1>
            <p style="color:#666;margin-top:8px">
                <?php esc_html_e( 'Importe avaliações de um arquivo CSV ou sincronize via API.', 'univer-reviews' ); ?>
            </p>

            <div style="background:#fff;border:1px solid #ddd;border-radius:6px;padding:24px;max-width:600px;margin-top:20px">
                <h2 style="font-size:1rem;margin-bottom:16px"><?php esc_html_e( 'Importar via CSV', 'univer-reviews' ); ?></h2>

                <form method="post" enctype="multipart/form-data">
                    <?php wp_nonce_field( 'univer_import_csv', 'univer_import_nonce' ); ?>

                    <table class="form-table" role="presentation">
                        <tr>
                            <th scope="row"><label for="univer-csv"><?php esc_html_e( 'Arquivo CSV', 'univer-reviews' ); ?></label></th>
                            <td>
                                <input type="file" id="univer-csv" name="univer_csv_file" accept=".csv" required>
                                <p class="description">
                                    <?php esc_html_e( 'Colunas obrigatórias: rating, body, author_name, author_email, product_id', 'univer-reviews' ); ?>
                                </p>
                            </td>
                        </tr>
                    </table>

                    <?php submit_button( __( 'Importar', 'univer-reviews' ) ); ?>
                </form>

                <hr style="margin:24px 0">

                <h2 style="font-size:1rem;margin-bottom:8px"><?php esc_html_e( 'Sincronizar WooCommerce existente', 'univer-reviews' ); ?></h2>
                <p class="description"><?php esc_html_e( 'Envia todas as avaliações WooCommerce existentes para o UniverReviews.', 'univer-reviews' ); ?></p>
                <button class="button" id="univer-sync-woo" style="margin-top:12px">
                    <?php esc_html_e( 'Sincronizar avaliações WooCommerce', 'univer-reviews' ); ?>
                </button>
            </div>
        </div>
        <?php
    }

    // ─── Settings Page ────────────────────────────────────────────────────────

    public function page_settings(): void {
        $api_key            = get_option( 'univer_api_key', '' );
        $workspace_id       = get_option( 'univer_workspace_id', '' );
        $api_url            = get_option( 'univer_api_url', UNIVER_API_URL );
        $layout             = get_option( 'univer_widget_layout', 'default' );
        $locale             = get_option( 'univer_widget_locale', 'pt-BR' );
        $theme_color        = get_option( 'univer_widget_theme_color', '#d4a850' );
        $star_color         = get_option( 'univer_widget_star_color', '#fbbf24' );
        $star_shape         = get_option( 'univer_widget_star_shape', 'star' );
        $show_qa            = (string) get_option( 'univer_widget_show_qa', '1' );
        $show_write_review  = (string) get_option( 'univer_widget_show_write_review', '1' );
        $per_page           = (int) get_option( 'univer_widget_per_page', 5 );
        $custom_css         = (string) get_option( 'univer_widget_custom_css', '' );
        $sync_enabled       = get_option( 'univer_sync_enabled', '1' );
        $auto_pull          = get_option( 'univer_auto_pull', '1' );
        ?>
        <div class="wrap">
            <h1><?php esc_html_e( 'Configurações — UniverReviews', 'univer-reviews' ); ?></h1>

            <form method="post" action="options.php">
                <?php settings_fields( 'univer_reviews_settings' ); ?>

                <h2><?php esc_html_e( 'Credenciais da API', 'univer-reviews' ); ?></h2>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="univer_api_key"><?php esc_html_e( 'API Key', 'univer-reviews' ); ?></label></th>
                        <td>
                            <input type="password" id="univer_api_key" name="univer_api_key" value="<?php echo esc_attr( $api_key ); ?>" class="regular-text" autocomplete="off">
                            <p class="description"><?php esc_html_e( 'Encontre sua API Key no painel UniverReviews → Configurações → API Keys.', 'univer-reviews' ); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="univer_workspace_id"><?php esc_html_e( 'Workspace ID', 'univer-reviews' ); ?></label></th>
                        <td>
                            <input type="text" id="univer_workspace_id" name="univer_workspace_id" value="<?php echo esc_attr( $workspace_id ); ?>" class="regular-text">
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="univer_api_url"><?php esc_html_e( 'URL da API', 'univer-reviews' ); ?></label></th>
                        <td>
                            <input type="url" id="univer_api_url" name="univer_api_url" value="<?php echo esc_attr( $api_url ); ?>" class="regular-text">
                        </td>
                    </tr>
                </table>

                <p>
                    <button type="button" class="button" id="univer-test-connection">
                        <?php esc_html_e( 'Testar conexão', 'univer-reviews' ); ?>
                    </button>
                    <span id="univer-connection-status" style="margin-left:10px;font-weight:600"></span>
                </p>

                <hr>

                <?php $this->render_appearance_section( $layout, $locale, $theme_color, $star_color, $star_shape ); ?>

                <?php $this->render_display_section( $show_qa, $show_write_review, $per_page ); ?>

                <?php $this->render_vitrine_section(); ?>

                <?php $this->render_custom_css_section( $custom_css ); ?>

                <hr>
                <h2><?php esc_html_e( 'WooCommerce', 'univer-reviews' ); ?></h2>
                <table class="form-table" role="presentation">
                    <?php
                    $auto_tab     = (string) get_option( 'univer_auto_tab', '1' );
                    $auto_loop    = (string) get_option( 'univer_auto_loop_rating', '1' );
                    $replace_def  = (string) get_option( 'univer_replace_default_reviews', '1' );
                    ?>
                    <tr>
                        <th scope="row"><?php esc_html_e( 'Aba automática', 'univer-reviews' ); ?></th>
                        <td>
                            <label>
                                <input type="checkbox" name="univer_auto_tab" value="1" <?php checked( $auto_tab, '1' ); ?>>
                                <?php esc_html_e( 'Adicionar aba "Avaliações" automaticamente nas páginas de produto', 'univer-reviews' ); ?>
                            </label>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><?php esc_html_e( 'Estrelas no catálogo', 'univer-reviews' ); ?></th>
                        <td>
                            <label>
                                <input type="checkbox" name="univer_auto_loop_rating" value="1" <?php checked( $auto_loop, '1' ); ?>>
                                <?php esc_html_e( 'Exibir nota média e contagem em listagens (loja, categorias, busca)', 'univer-reviews' ); ?>
                            </label>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><?php esc_html_e( 'Substituir avaliações nativas', 'univer-reviews' ); ?></th>
                        <td>
                            <label>
                                <input type="checkbox" name="univer_replace_default_reviews" value="1" <?php checked( $replace_def, '1' ); ?>>
                                <?php esc_html_e( 'Ocultar o formulário e a lista nativos do WooCommerce/WordPress', 'univer-reviews' ); ?>
                            </label>
                        </td>
                    </tr>
                </table>

                <hr>
                <h2><?php esc_html_e( 'Sincronização', 'univer-reviews' ); ?></h2>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><?php esc_html_e( 'Sincronização automática', 'univer-reviews' ); ?></th>
                        <td>
                            <label>
                                <input type="checkbox" name="univer_sync_enabled" value="1" <?php checked( $sync_enabled, '1' ); ?>>
                                <?php esc_html_e( 'Enviar novas avaliações para o UniverReviews automaticamente', 'univer-reviews' ); ?>
                            </label>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><?php esc_html_e( 'Pull automático', 'univer-reviews' ); ?></th>
                        <td>
                            <label>
                                <input type="checkbox" name="univer_auto_pull" value="1" <?php checked( $auto_pull, '1' ); ?>>
                                <?php esc_html_e( 'Buscar avaliações aprovadas do UniverReviews a cada hora', 'univer-reviews' ); ?>
                            </label>
                        </td>
                    </tr>
                </table>

                <?php submit_button(); ?>
            </form>
        </div>

        <script>
        document.getElementById('univer-test-connection')?.addEventListener('click', function() {
            const status = document.getElementById('univer-connection-status');
            status.textContent = '<?php echo esc_js( __( 'Testando…', 'univer-reviews' ) ); ?>';
            status.style.color = '#666';

            fetch(ajaxurl, {
                method: 'POST',
                body: new URLSearchParams({
                    action: 'univer_test_connection',
                    nonce: '<?php echo esc_js( wp_create_nonce( 'univer_test_connection' ) ); ?>',
                    api_key: document.getElementById('univer_api_key').value,
                    workspace_id: document.getElementById('univer_workspace_id').value,
                })
            }).then(r => r.json()).then(d => {
                if (d.success) {
                    status.textContent = '✓ <?php echo esc_js( __( 'Conexão bem-sucedida!', 'univer-reviews' ) ); ?>';
                    status.style.color = '#2d8a4e';
                } else {
                    status.textContent = '✕ ' + (d.data?.message || '<?php echo esc_js( __( 'Falha na conexão', 'univer-reviews' ) ); ?>');
                    status.style.color = '#e53e3e';
                }
            });
        });
        </script>
        <?php
    }

    // ─── AJAX ─────────────────────────────────────────────────────────────────

    public function ajax_manual_pull(): void {
        check_ajax_referer( 'univer_manual_pull', 'nonce' );

        if ( ! current_user_can( 'manage_options' ) ) {
            wp_send_json_error( [ 'message' => __( 'Permissão negada.', 'univer-reviews' ) ] );
        }

        do_action( 'univer_sync_reviews' );
        wp_send_json_success( [ 'message' => __( 'Sincronizado.', 'univer-reviews' ) ] );
    }

    public function ajax_test_connection(): void {
        check_ajax_referer( 'univer_test_connection', 'nonce' );

        if ( ! current_user_can( 'manage_options' ) ) {
            wp_send_json_error( [ 'message' => __( 'Permissão negada.', 'univer-reviews' ) ] );
        }

        $api_key      = sanitize_text_field( $_POST['api_key'] ?? '' );
        $workspace_id = sanitize_text_field( $_POST['workspace_id'] ?? '' );
        $api_url      = get_option( 'univer_api_url', UNIVER_API_URL );

        if ( empty( $api_key ) || empty( $workspace_id ) ) {
            wp_send_json_error( [ 'message' => __( 'Preencha API Key e Workspace ID.', 'univer-reviews' ) ] );
        }

        $response = wp_remote_get(
            rtrim( $api_url, '/' ) . '/api/v1/wp/ping',
            [
                'timeout' => 10,
                'headers' => [
                    'Authorization'  => 'Bearer ' . $api_key,
                    'X-Workspace-ID' => $workspace_id,
                ],
            ]
        );

        if ( is_wp_error( $response ) ) {
            wp_send_json_error( [ 'message' => $response->get_error_message() ] );
        }

        $code = wp_remote_retrieve_response_code( $response );
        if ( 200 === $code ) {
            wp_send_json_success( [ 'message' => __( 'OK', 'univer-reviews' ) ] );
        } else {
            wp_send_json_error( [ 'message' => sprintf( __( 'HTTP %d', 'univer-reviews' ), $code ) ] );
        }
    }

    // ─── Settings sections (rendered HTML) ──────────────────────────────────

    /**
     * Personalização visual — layout + paleta + ícone das estrelas.
     * Renderiza um card com 3 sub-grupos para evitar a sensação de um
     * único "tema" que muda tudo de uma vez.
     */
    private function render_appearance_section(
        string $layout,
        string $locale,
        string $theme_color,
        string $star_color,
        string $star_shape
    ): void {
        $layouts        = $this->layout_choices();
        $star_shapes    = $this->star_shape_choices();
        $layout_hints   = array_map( function ( $o ) { return $o['hint']; }, $layouts );
        ?>
        <div class="univer-section-card" style="background:#fff;border:1px solid #dcdcde;border-radius:8px;padding:20px 24px;margin:16px 0;">
            <h2 style="margin-top:0;border-bottom:1px solid #f0f0f1;padding-bottom:12px;"><?php esc_html_e( 'Aparência do widget', 'univer-reviews' ); ?></h2>
            <p class="description" style="margin-bottom:20px;">
                <?php esc_html_e( 'Cada item controla uma parte específica do visual. As cores são independentes — alterar a cor primária não afeta as estrelas.', 'univer-reviews' ); ?>
            </p>

            <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:#646970;margin:0 0 12px;"><?php esc_html_e( 'Layout e idioma', 'univer-reviews' ); ?></h3>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="univer_widget_layout"><?php esc_html_e( 'Layout das avaliações', 'univer-reviews' ); ?></label></th>
                    <td>
                        <select id="univer_widget_layout" name="univer_widget_layout" style="min-width:340px;">
                            <?php foreach ( $layouts as $id => $opt ) : ?>
                                <option value="<?php echo esc_attr( $id ); ?>" <?php selected( $layout, $id ); ?>>
                                    <?php echo esc_html( $opt['label'] ); ?>
                                </option>
                            <?php endforeach; ?>
                        </select>
                        <p class="description" id="univer-layout-hint">
                            <?php echo esc_html( $layouts[ $layout ]['hint'] ?? $layouts['default']['hint'] ); ?>
                        </p>
                        <script>
                        (function(){
                            var hints = <?php echo wp_json_encode( $layout_hints ); ?>;
                            var sel = document.getElementById('univer_widget_layout');
                            var hint = document.getElementById('univer-layout-hint');
                            if (sel && hint) sel.addEventListener('change', function(){ hint.textContent = hints[sel.value] || ''; });
                        })();
                        </script>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="univer_widget_locale"><?php esc_html_e( 'Idioma', 'univer-reviews' ); ?></label></th>
                    <td>
                        <select id="univer_widget_locale" name="univer_widget_locale">
                            <option value="pt-BR" <?php selected( $locale, 'pt-BR' ); ?>>Português (Brasil)</option>
                            <option value="en-US" <?php selected( $locale, 'en-US' ); ?>>English (US)</option>
                            <option value="es-AR" <?php selected( $locale, 'es-AR' ); ?>>Español (Argentina)</option>
                        </select>
                    </td>
                </tr>
            </table>

            <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:#646970;margin:24px 0 12px;"><?php esc_html_e( 'Cores', 'univer-reviews' ); ?></h3>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="univer_widget_theme_color"><?php esc_html_e( 'Cor primária', 'univer-reviews' ); ?></label></th>
                    <td>
                        <input type="color" id="univer_widget_theme_color" name="univer_widget_theme_color" value="<?php echo esc_attr( $theme_color ); ?>">
                        <p class="description"><?php esc_html_e( 'Usada em botões, links, foco e elementos de destaque do widget. NÃO afeta as estrelas.', 'univer-reviews' ); ?></p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="univer_widget_star_color"><?php esc_html_e( 'Cor das estrelas', 'univer-reviews' ); ?></label></th>
                    <td>
                        <input type="color" id="univer_widget_star_color" name="univer_widget_star_color" value="<?php echo esc_attr( $star_color ); ?>">
                        <p class="description"><?php esc_html_e( 'Controla apenas o preenchimento dos ícones de avaliação. Padrão dourado #fbbf24 funciona bem com a maioria dos temas.', 'univer-reviews' ); ?></p>
                    </td>
                </tr>
            </table>

            <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:#646970;margin:24px 0 12px;"><?php esc_html_e( 'Ícones', 'univer-reviews' ); ?></h3>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label><?php esc_html_e( 'Formato das estrelas', 'univer-reviews' ); ?></label></th>
                    <td>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;">
                            <?php foreach ( $star_shapes as $id => $label ) : ?>
                                <label style="display:flex;align-items:center;gap:6px;padding:8px 14px;border:2px solid <?php echo $star_shape === $id ? '#d4a850' : '#dcdcde'; ?>;border-radius:6px;background:<?php echo $star_shape === $id ? '#fef9ea' : '#fff'; ?>;cursor:pointer;">
                                    <input type="radio" name="univer_widget_star_shape" value="<?php echo esc_attr( $id ); ?>" <?php checked( $star_shape, $id ); ?> style="margin:0;">
                                    <span style="font-size:16px;"><?php echo esc_html( $label ); ?></span>
                                </label>
                            <?php endforeach; ?>
                        </div>
                        <p class="description" style="margin-top:10px;"><?php esc_html_e( 'Define o glifo usado em todos os indicadores de nota — distribuição, header, lista, formulário.', 'univer-reviews' ); ?></p>
                    </td>
                </tr>
            </table>
        </div>
        <?php
    }

    /**
     * Exibição — toggles que mudam o conteúdo do widget (Q&A, escrever review,
     * paginação). Mantido em card separado para reduzir ruído visual.
     */
    private function render_display_section(
        string $show_qa,
        string $show_write_review,
        int $per_page
    ): void {
        ?>
        <div class="univer-section-card" style="background:#fff;border:1px solid #dcdcde;border-radius:8px;padding:20px 24px;margin:16px 0;">
            <h2 style="margin-top:0;border-bottom:1px solid #f0f0f1;padding-bottom:12px;"><?php esc_html_e( 'Exibição', 'univer-reviews' ); ?></h2>
            <p class="description" style="margin-bottom:20px;">
                <?php esc_html_e( 'Decide o que aparece no widget. Cada toggle pode ser sobrescrito por atributo no shortcode.', 'univer-reviews' ); ?>
            </p>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><?php esc_html_e( 'Aba "Perguntas e respostas"', 'univer-reviews' ); ?></th>
                    <td>
                        <label>
                            <input type="checkbox" name="univer_widget_show_qa" value="1" <?php checked( $show_qa, '1' ); ?>>
                            <?php esc_html_e( 'Exibir aba Q&A junto com as avaliações', 'univer-reviews' ); ?>
                        </label>
                        <p class="description"><?php esc_html_e( 'Quando ativo, o widget mostra tabs "Avaliações | Perguntas". Para Q&A standalone use o shortcode [univer_qa].', 'univer-reviews' ); ?></p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><?php esc_html_e( 'Botão "Escrever avaliação"', 'univer-reviews' ); ?></th>
                    <td>
                        <label>
                            <input type="checkbox" name="univer_widget_show_write_review" value="1" <?php checked( $show_write_review, '1' ); ?>>
                            <?php esc_html_e( 'Permitir que clientes enviem novas avaliações pelo widget', 'univer-reviews' ); ?>
                        </label>
                        <p class="description"><?php esc_html_e( 'Desative se as avaliações são coletadas exclusivamente por email/WhatsApp.', 'univer-reviews' ); ?></p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="univer_widget_per_page"><?php esc_html_e( 'Avaliações por página', 'univer-reviews' ); ?></label></th>
                    <td>
                        <input type="number" id="univer_widget_per_page" name="univer_widget_per_page" min="1" max="100" value="<?php echo esc_attr( (string) $per_page ); ?>" class="small-text">
                        <p class="description"><?php esc_html_e( 'Quantidade exibida por carregamento. Mínimo 1, máximo 100. Padrão 10.', 'univer-reviews' ); ?></p>
                    </td>
                </tr>
            </table>
        </div>
        <?php
    }

    /**
     * Módulo Vitrine — bloco de avaliações estilo loja, com shortcode próprio
     * ([univer_vitrine]) e opção de assumir a aba de avaliações do WooCommerce.
     */
    private function render_vitrine_section(): void {
        $on_tab   = (string) get_option( 'univer_vitrine_on_product_tab', '0' );
        $show_wr  = (string) get_option( 'univer_vitrine_show_write_review', '1' );
        $per_page = (int) get_option( 'univer_vitrine_per_page', 0 );
        ?>
        <div class="univer-section-card" style="background:#fff;border:1px solid #dcdcde;border-radius:8px;padding:20px 24px;margin:16px 0;">
            <h2 style="margin-top:0;border-bottom:1px solid #f0f0f1;padding-bottom:12px;"><?php esc_html_e( 'Módulo Vitrine', 'univer-reviews' ); ?></h2>
            <p class="description" style="margin-bottom:20px;">
                <?php esc_html_e( 'Avaliações no estilo de loja: card de resumo com % que recomenda, fotos e vídeos dos clientes, filtros por nota, selo de compra verificada e botão "Carregar mais". Funciona sozinho, sem mudar o layout escolhido em Aparência.', 'univer-reviews' ); ?>
            </p>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><?php esc_html_e( 'Shortcode', 'univer-reviews' ); ?></th>
                    <td>
                        <code style="display:inline-block;background:#f0f0f1;padding:4px 8px;border-radius:3px;font-size:13px;">[<?php echo esc_html( Univer_Vitrine::SHORTCODE ); ?>]</code>
                        <p class="description"><?php esc_html_e( 'Cole em qualquer página. Em página de produto o produto é detectado sozinho; fora dela use product_id="123". Atributos opcionais: per_page, show_write_review, locale, theme_color, star_color, class.', 'univer-reviews' ); ?></p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><?php esc_html_e( 'Aba do produto', 'univer-reviews' ); ?></th>
                    <td>
                        <label>
                            <input type="checkbox" name="univer_vitrine_on_product_tab" value="1" <?php checked( $on_tab, '1' ); ?>>
                            <?php esc_html_e( 'Usar a Vitrine na aba "Avaliações" do WooCommerce', 'univer-reviews' ); ?>
                        </label>
                        <p class="description"><?php esc_html_e( 'Requer "Aba automática" ligada na seção WooCommerce.', 'univer-reviews' ); ?></p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><?php esc_html_e( 'Botão "Escrever avaliação"', 'univer-reviews' ); ?></th>
                    <td>
                        <label>
                            <input type="checkbox" name="univer_vitrine_show_write_review" value="1" <?php checked( $show_wr, '1' ); ?>>
                            <?php esc_html_e( 'Mostrar o botão no card de resumo da Vitrine', 'univer-reviews' ); ?>
                        </label>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="univer_vitrine_per_page"><?php esc_html_e( 'Avaliações por carregamento', 'univer-reviews' ); ?></label></th>
                    <td>
                        <input type="number" id="univer_vitrine_per_page" name="univer_vitrine_per_page" min="0" max="100" value="<?php echo esc_attr( (string) $per_page ); ?>" class="small-text">
                        <p class="description"><?php esc_html_e( 'Quantas aparecem de início e a cada "Carregar mais". 0 usa a configuração do painel UniverReviews.', 'univer-reviews' ); ?></p>
                    </td>
                </tr>
            </table>
        </div>
        <?php
    }

    /**
     * CSS customizado — fechado por padrão (collapsible).
     */
    private function render_custom_css_section( string $custom_css ): void {
        ?>
        <div class="univer-section-card" style="background:#fff;border:1px solid #dcdcde;border-radius:8px;padding:20px 24px;margin:16px 0;">
            <details>
                <summary style="cursor:pointer;font-size:1.3em;font-weight:600;padding:0;outline:none;">
                    <?php esc_html_e( 'CSS customizado (avançado)', 'univer-reviews' ); ?>
                </summary>
                <p class="description" style="margin:12px 0;">
                    <?php esc_html_e( 'Sobrescreve estilos do widget. O CSS é injetado dentro do shadow DOM — afeta apenas o widget, não o resto da página. Variáveis disponíveis:', 'univer-reviews' ); ?>
                    <code style="display:inline-block;background:#f0f0f1;padding:2px 6px;border-radius:3px;font-size:12px;">--ur-accent</code>
                    <code style="display:inline-block;background:#f0f0f1;padding:2px 6px;border-radius:3px;font-size:12px;">--ur-star</code>
                    <code style="display:inline-block;background:#f0f0f1;padding:2px 6px;border-radius:3px;font-size:12px;">--ur-text</code>
                    <code style="display:inline-block;background:#f0f0f1;padding:2px 6px;border-radius:3px;font-size:12px;">--ur-surface</code>
                </p>
                <textarea name="univer_widget_custom_css" rows="10" style="width:100%;font-family:Monaco,Consolas,monospace;font-size:13px;" placeholder=".ur-card { border-radius: 16px; }&#10;.ur-write-btn { text-transform: uppercase; }"><?php echo esc_textarea( $custom_css ); ?></textarea>
                <p class="description" style="margin-top:8px;"><?php esc_html_e( 'Máximo 20 KB. Tags <script> e <style> e URLs javascript: são removidas no save.', 'univer-reviews' ); ?></p>
            </details>
        </div>
        <?php
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private function get_menu_icon(): string {
        // Inline SVG star icon as data URI for the admin menu
        return 'data:image/svg+xml;base64,' . base64_encode(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>'
        );
    }
}
