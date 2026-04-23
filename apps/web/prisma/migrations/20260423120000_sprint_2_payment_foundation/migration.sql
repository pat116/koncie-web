-- Sprint 2: payment foundation — Upsell, Transaction v2, TrustLedgerEntry, SavedCard
-- Hand-written migration (prisma migrate dev blocked in CI sandbox).
-- Apply with: pnpm --filter @koncie/web exec prisma migrate dev

-- ─── New enums ────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "UpsellCategory" AS ENUM ('ACTIVITY', 'TRANSFER', 'SPA', 'DINING', 'OTHER');

-- CreateEnum
CREATE TYPE "UpsellStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('pending', 'authorized', 'captured', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "PaymentProviderName" AS ENUM ('KOVENA_MOCK', 'KOVENA_LIVE', 'STRIPE');

-- CreateEnum
CREATE TYPE "TrustLedgerEventType" AS ENUM ('COLLECTED', 'HELD', 'PAID_OUT', 'REFUNDED');

-- ─── upsells ──────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "upsells" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "category" "UpsellCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price_minor" INTEGER NOT NULL,
    "price_currency" CHAR(3) NOT NULL,
    "provider_payout_pct" DECIMAL(4,2) NOT NULL,
    "image_url" TEXT NOT NULL,
    "status" "UpsellStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "upsells_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_upsells_property_status" ON "upsells" ("property_id", "status");

-- AddForeignKey
ALTER TABLE "upsells" ADD CONSTRAINT "upsells_property_id_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── trust_ledger_entries ─────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "trust_ledger_entries" (
    "id" UUID NOT NULL,
    "event_type" "TrustLedgerEventType" NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "trust_account_id" TEXT NOT NULL,
    "external_ref" TEXT,
    "occurred_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trust_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_trust_ledger_account_occurred" ON "trust_ledger_entries" ("trust_account_id", "occurred_at");

-- ─── saved_cards ──────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "saved_cards" (
    "id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "provider_token" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "last4" CHAR(4) NOT NULL,
    "expiry_month" INTEGER NOT NULL,
    "expiry_year" INTEGER NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "saved_cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_saved_cards_guest" ON "saved_cards" ("guest_id");

-- AddForeignKey
ALTER TABLE "saved_cards" ADD CONSTRAINT "saved_cards_guest_id_fkey"
    FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── transactions ─────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "upsell_id" UUID NOT NULL,
    "saved_card_id" UUID,
    "mcc" CHAR(4) NOT NULL,
    "status" "TransactionStatus" NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "provider_payout_minor" INTEGER NOT NULL,
    "koncie_fee_minor" INTEGER NOT NULL,
    "guest_display_currency" CHAR(3) NOT NULL,
    "guest_display_amount_minor" INTEGER NOT NULL,
    "fx_rate_at_purchase" DECIMAL(12,6) NOT NULL,
    "payment_provider" "PaymentProviderName" NOT NULL,
    "provider_payment_ref" TEXT NOT NULL,
    "trust_ledger_id" UUID,
    "captured_at" TIMESTAMPTZ,
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transactions_trust_ledger_id_key" ON "transactions" ("trust_ledger_id");

-- CreateIndex
CREATE INDEX "idx_transactions_guest_createdAt" ON "transactions" ("guest_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_transactions_provider_payment_ref" ON "transactions" ("provider_payment_ref");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_guest_id_fkey"
    FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_upsell_id_fkey"
    FOREIGN KEY ("upsell_id") REFERENCES "upsells"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_saved_card_id_fkey"
    FOREIGN KEY ("saved_card_id") REFERENCES "saved_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_trust_ledger_id_fkey"
    FOREIGN KEY ("trust_ledger_id") REFERENCES "trust_ledger_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Sprint 2 MoR invariants ──────────────────────────────────────────────────
-- Prisma doesn't model CHECK constraints natively;
-- these are hand-written and must survive `prisma migrate reset`.

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_mcc_4722_check"
  CHECK ("mcc" = '4722');

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_fee_split_check"
  CHECK ("amount_minor" = "provider_payout_minor" + "koncie_fee_minor");

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_capture_has_ledger_check"
  CHECK (
    ("status" = 'captured' AND "trust_ledger_id" IS NOT NULL)
    OR ("status" <> 'captured')
  );

-- One default card per guest.
CREATE UNIQUE INDEX "saved_cards_guest_default_unique"
  ON "saved_cards" ("guest_id")
  WHERE "is_default" = true;
