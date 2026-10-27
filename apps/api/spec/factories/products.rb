FactoryBot.define do
  factory :product do
    workspace
    title    { Faker::Commerce.product_name }
    handle   { title.downcase.gsub(/\s+/, "-") }
    platform { "woocommerce" }
    sequence(:platform_product_id) { |n| n.to_s }
    price    { Faker::Commerce.price(range: 10..500) }
    currency { "BRL" }
    active   { true }

    trait :univercampus do
      platform { "univercampus" }
      sequence(:platform_product_id) { |n| "cur_#{n}" }
    end
  end
end
