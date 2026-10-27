require "ipaddr"
require "resolv"
require "uri"

module Integrations
  # SSRF guard shared by integrations that make HTTP calls to a URL typed by
  # the merchant (WooCommerce, UniverCampus). Extracted verbatim from
  # WooCommerceAdapter#validate_store_url! — same checks, same messages.
  #
  # Without it an adapter happily connects to cloud metadata endpoints
  # (169.254.169.254), internal services (127.0.0.1:6379), link-local
  # addresses, and any RFC1918 range.
  module UrlGuard
    PRIVATE_IP_RANGES = [
      IPAddr.new("10.0.0.0/8"),
      IPAddr.new("127.0.0.0/8"),
      IPAddr.new("169.254.0.0/16"), # AWS / GCP / Azure metadata
      IPAddr.new("172.16.0.0/12"),
      IPAddr.new("192.168.0.0/16"),
      IPAddr.new("::1/128"),
      IPAddr.new("fc00::/7"),       # Unique local addresses
      IPAddr.new("fe80::/10"),      # Link-local
    ].freeze

    module_function

    # Returns `url` when it is safe; raises `error_class` otherwise.
    # `allow_private: true` skips the private-range checks — only meant for
    # development/test (e.g. a local UniverCampus on localhost:3000).
    def validate!(url, error_class:, field: "url", allow_private: false)
      uri = URI.parse(url)
      unless %w[http https].include?(uri.scheme)
        raise error_class, "#{field} must use http or https"
      end
      # Block http:// outside of dev/test to prevent downgrade and
      # MITM-able requests carrying credentials.
      if uri.scheme == "http" && !(Rails.env.development? || Rails.env.test?)
        raise error_class, "#{field} must use https"
      end
      host = uri.host.to_s.downcase
      raise error_class, "#{field} must include a host" if host.empty?
      return url if allow_private

      # DNS resolution + private-range check. We only block when DNS resolves
      # AND any returned address is in a private range. If resolution fails or
      # returns nothing (test fixtures, ephemeral hostnames), we let the request
      # proceed and rely on Faraday's normal connection failure path.
      addrs =
        begin
          Resolv.getaddresses(host)
        rescue Resolv::ResolvError, StandardError
          []
        end

      addrs.each do |addr|
        begin
          ip = IPAddr.new(addr)
        rescue IPAddr::InvalidAddressError
          next
        end
        if PRIVATE_IP_RANGES.any? { |range| range.include?(ip) }
          raise error_class, "#{field} resolves to a private/loopback address (#{addr})"
        end
      end

      # Also reject when the host LITERALLY is a private IP (Resolv may or may
      # not return it depending on platform/resolver config).
      begin
        literal_ip = IPAddr.new(host)
        if PRIVATE_IP_RANGES.any? { |range| range.include?(literal_ip) }
          raise error_class, "#{field} points at a private/loopback address (#{host})"
        end
      rescue IPAddr::InvalidAddressError
        # not a literal IP, that's fine
      end

      url
    end
  end
end
