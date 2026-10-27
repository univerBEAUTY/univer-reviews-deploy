# Conexão do workspace com o UniverCampus. Uma por workspace.
#
# O token (`ucrev_…`) é cifrado com Active Record Encryption. Se as chaves
# ACTIVE_RECORD_ENCRYPTION_* não estiverem no ambiente, o app sobe normal e
# só salvar uma conexão falha — com a mensagem de `ENCRYPTION_MISSING`, em
# vez de estourar ActiveRecord::Encryption::Errors::Configuration.
class UnivercampusConnection < ApplicationRecord
  STATUSES         = %w[active invalid].freeze
  DEFAULT_BASE_URL = "https://univercampus.cloud".freeze
  TOKEN_FORMAT     = /\Aucrev_[A-Za-z0-9_-]{20,}\z/
  PREFIX_LENGTH    = 12
  ENCRYPTION_MISSING = "Criptografia não configurada no servidor: defina ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY, " \
                       "ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY e ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT " \
                       "(gere com bin/rails db:encryption:init) e reinicie a API.".freeze

  belongs_to :workspace

  encrypts :api_token

  validates :workspace_id, uniqueness: true
  validates :base_url, presence: true, format: { with: %r{\Ahttps?://[^\s/]+}i, message: "deve começar com http:// ou https://" }
  validates :api_token, presence: true, format: { with: TOKEN_FORMAT, message: "deve ser o token ucrev_… gerado no UniverCampus" }
  validates :status, inclusion: { in: STATUSES }
  validate  :encryption_must_be_configured

  before_validation :normalize_base_url_attribute
  before_save :set_token_prefix, if: :will_save_change_to_api_token?

  scope :active, -> { where(status: "active") }

  # Remove espaços, barra final e um `/api/univerreview` colado por engano —
  # o client sempre acrescenta o prefixo da API.
  def self.normalize_base_url(url)
    url.to_s.strip.sub(%r{/+\z}, "").sub(%r{/api/univerreview\z}i, "")
  end

  def self.default_base_url
    normalize_base_url(ENV["UNIVERCAMPUS_API_URL"].presence || DEFAULT_BASE_URL)
  end

  def self.encryption_configured?
    config = ActiveRecord::Encryption.config
    [config.has_primary_key?, config.has_deterministic_key?, config.has_key_derivation_salt?].all?
  end

  def active? = status == "active"

  def client(**options)
    ::Integrations::Univercampus::Client.new(base_url: base_url, token: api_token, **options)
  end

  def record_verification!(owner:, schools:)
    update!(status: "active", verified_at: Time.current, owner_info: owner || {}, schools: Array(schools), last_error: nil)
  end

  def mark_invalid!(message)
    update!(status: "invalid", last_error: message.to_s.truncate(1000))
  end

  def record_error!(message)
    update!(last_error: message.to_s.truncate(1000))
  end

  # Payload do admin. Nunca inclui o token.
  def as_payload
    {
      connected:      true,
      status:         status,
      base_url:       base_url,
      token_prefix:   token_prefix,
      schools:        Array(schools),
      owner:          owner_info.presence || {},
      verified_at:    verified_at&.iso8601,
      last_synced_at: last_synced_at&.iso8601,
      last_pushed_at: last_pushed_at&.iso8601,
      last_error:     last_error
    }
  end

  private

  def normalize_base_url_attribute
    self.base_url = self.class.normalize_base_url(base_url) if base_url.present?
  end

  def set_token_prefix
    self.token_prefix = api_token.to_s[0, PREFIX_LENGTH]
  end

  def encryption_must_be_configured
    errors.add(:base, ENCRYPTION_MISSING) unless self.class.encryption_configured?
  end
end
