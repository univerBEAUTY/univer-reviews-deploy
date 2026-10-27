require "rails_helper"

RSpec.describe Review, type: :model do
  describe "validations" do
    it { is_expected.to validate_presence_of(:rating) }

    it "rejects rating below 1" do
      expect(build(:review, rating: 0)).not_to be_valid
    end

    it "rejects rating above 5" do
      expect(build(:review, rating: 6)).not_to be_valid
    end

    it "accepts valid ratings" do
      (1..5).each do |r|
        expect(build(:review, rating: r)).to be_valid
      end
    end
  end

  describe "scopes" do
    let!(:approved_review) { create(:review, :approved) }
    let!(:pending_review)  { create(:review) }

    it ".approved returns only approved reviews" do
      expect(Review.approved).to include(approved_review)
      expect(Review.approved).not_to include(pending_review)
    end
  end

  describe "#approve!" do
    it "sets status to approved and sets approved_at" do
      review = create(:review)
      review.approve!
      expect(review.reload.status).to eq("approved")
      expect(review.approved_at).to be_present
    end
  end

  describe "#has_photo?" do
    it "returns false when no media" do
      review = create(:review)
      expect(review.has_photo?).to be false
    end
  end

  describe "push para o UniverCampus (after_commit)" do
    let(:workspace) { create(:workspace) }
    let(:course)    { create(:product, :univercampus, workspace: workspace) }
    let(:woo)       { create(:product, workspace: workspace) }

    before { allow(UnivercampusPushJob).to receive(:enqueue_debounced) }

    def expect_push(product, upsert: [], delete: [])
      expect(UnivercampusPushJob).to have_received(:enqueue_debounced)
        .with(workspace_id: workspace.id, product_id: product.id, upsert_ids: upsert, delete_ids: delete)
    end

    it "enfileira upsert ao criar review de curso do UniverCampus" do
      review = create(:review, workspace: workspace, product: course)
      expect_push(course, upsert: [review.id])
    end

    it "não enfileira para produto de outra plataforma" do
      review = create(:review, workspace: workspace, product: woo)
      review.update!(status: "approved")
      expect(UnivercampusPushJob).not_to have_received(:enqueue_debounced)
    end

    it "enfileira de novo quando muda algo visível (status, texto, nota, destaque, autor)" do
      review = create(:review, workspace: workspace, product: course)
      review.update!(status: "approved")
      review.update!(body: "Novo texto")
      review.update!(is_featured: true)
      review.update!(author_name: "Bia")
      expect(UnivercampusPushJob).to have_received(:enqueue_debounced).exactly(5).times
    end

    it "ignora mudanças que não aparecem no UniverCampus" do
      review = create(:review, workspace: workspace, product: course)
      review.update!(language: "en-US", ai_sentiment: "positive")
      expect(UnivercampusPushJob).to have_received(:enqueue_debounced).once
    end

    it "enfileira delete ao apagar" do
      review = create(:review, workspace: workspace, product: course)
      review.destroy!
      expect_push(course, delete: [review.id])
    end

    it "ao mover para outro curso remove do antigo e envia para o novo" do
      other  = create(:product, :univercampus, workspace: workspace)
      review = create(:review, workspace: workspace, product: course)
      review.update!(product: other)
      expect_push(course, delete: [review.id])
      expect_push(other, upsert: [review.id])
    end

    it "falha ao enfileirar nunca derruba o save" do
      allow(UnivercampusPushJob).to receive(:enqueue_debounced).and_raise(StandardError, "boom")
      expect { create(:review, workspace: workspace, product: course) }.not_to raise_error
    end
  end
end
