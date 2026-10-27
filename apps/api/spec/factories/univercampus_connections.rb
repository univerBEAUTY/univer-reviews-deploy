FactoryBot.define do
  factory :univercampus_connection do
    workspace
    base_url  { "https://campus.example.com" }
    api_token { "ucrev_#{SecureRandom.urlsafe_base64(32)}" }
    status    { "active" }
    schools do
      [{ "id" => "esc_1", "slug" => "escola-um", "nome" => "Escola Um", "url" => "https://campus.example.com/s/escola-um" }]
    end
    owner_info  { { "id" => "usr_1", "nome" => "Dona", "email" => "dona@example.com" } }
    verified_at { Time.current }

    trait :invalid do
      status     { "invalid" }
      last_error { "HTTP 401: token revogado" }
    end
  end
end
