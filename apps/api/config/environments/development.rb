require "active_support/core_ext/integer/time"

Rails.application.configure do
  config.enable_reloading = true
  config.eager_load = false
  config.consider_all_requests_local = true
  config.server_timing = true

  # Logging
  config.log_level = :debug
  config.log_tags = [:request_id]

  # Action Mailer (not used directly, using Resend SDK)
  config.action_mailer.raise_delivery_errors = false
  config.action_mailer.perform_caching = false

  # Active Record
  config.active_record.verbose_query_logs = true
  config.active_record.migration_error = :page_load

  # Fallback local para Active Record Encryption quando o .env não define
  # ACTIVE_RECORD_ENCRYPTION_*. Valores só de desenvolvimento.
  config.active_record.encryption.primary_key         ||= "dev0" * 8
  config.active_record.encryption.deterministic_key   ||= "ddet" * 8
  config.active_record.encryption.key_derivation_salt ||= "dslt" * 8

  # Bullet for N+1 detection
  config.after_initialize do
    Bullet.enable        = true
    Bullet.rails_logger  = true
    Bullet.add_footer    = false
  end
end
