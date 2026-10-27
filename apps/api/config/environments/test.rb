require "active_support/core_ext/integer/time"

Rails.application.configure do
  config.enable_reloading = false
  config.eager_load = false
  config.consider_all_requests_local = true
  config.cache_store = :null_store
  config.action_dispatch.show_exceptions = :none
  config.active_record.maintain_test_schema = true
  config.active_record.migration_error = :page_load
  config.log_level = :warn

  # Chaves fixas de teste para Active Record Encryption (não são segredo).
  config.active_record.encryption.primary_key         = "test" * 8
  config.active_record.encryption.deterministic_key   = "tdet" * 8
  config.active_record.encryption.key_derivation_salt = "salt" * 8
end
