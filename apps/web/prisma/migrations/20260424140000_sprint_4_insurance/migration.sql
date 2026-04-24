-- Sprint 4: CoverMore insurance foundation — InsuranceQuote + InsurancePolicy + Guest.insurance_last_synced_at
-- Hand-written migration (prisma migrate dev blocked in CI sandbox).
-- Apply with: pnpm --filter @koncie/web exec prisma migrate dev

-- ─── enums ────────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "InsuranceTier" AS ENUM ('ESSENTIALS', 'COMPREHENSIVE', 'COMPREHENSIVE_PLUS');

-- CreateEnum
CREATE TYPE "InsurancePolicyStatus" AS ENUM ('PENDING', 'ACTIVE', 'FAILED', 'CANCELLED');

-- ─── insurance_quotes ─────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "insurance_quotes" (
    "id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "flight_booking_id" UUID,
    "provider" TEXT NOT NULL,
    "provider_ref" TEXT NOT NULL,
    "tier" "InsuranceTier" NOT NULL,
    "premium_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "commission_pct" DECIMAL(5,2) NOT NULL,
    "commission_minor" INTEGER NOT NULL,
    "coverage_summary" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "insurance_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "insurance_quotes_guest_id_provider_ref_key" ON "insurance_quotes" ("guest_id", "provider_ref");

-- CreateIndex
CREATE INDEX "insurance_quotes_guest_id_expires_at_idx" ON "insurance_quotes" ("guest_id", "expires_at");

-- CreateIndex
CREATE INDEX "insurance_quotes_flight_booking_id_idx" ON "insurance_quotes" ("flight_booking_id");

-- AddForeignKey
ALTER TABLE "insurance_quotes" ADD CONSTRAINT "insurance_quotes_guest_id_fkey"
    FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_quotes" ADD CONSTRAINT "insurance_quotes_flight_booking_id_fkey"
    FOREIGN KEY ("flight_booking_id") REFERENCES "flight_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── insurance_policies ───────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "insurance_policies" (
    "id" UUID NOT NULL,
    "quote_id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "mcc" CHAR(4) NOT NULL,
    "status" "InsurancePolicyStatus" NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "provider_payout_minor" INTEGER NOT NULL,
    "koncie_fee_minor" INTEGER NOT NULL,
    "payment_provider" "PaymentProviderName" NOT NULL,
    "provider_payment_ref" TEXT NOT NULL,
    "trust_ledger_id" UUID,
    "policy_number" TEXT,
    "captured_at" TIMESTAMPTZ,
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "insurance_policies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "insurance_policies_mcc_check" CHECK ("mcc" = '4722')
);

-- CreateIndex
CREATE UNIQUE INDEX "insurance_policies_quote_id_key" ON "insurance_policies" ("quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_policies_trust_ledger_id_key" ON "insurance_policies" ("trust_ledger_id");

-- CreateIndex
CREATE INDEX "insurance_policies_guest_id_captured_at_idx" ON "insurance_policies" ("guest_id", "captured_at");

-- CreateIndex
CREATE INDEX "insurance_policies_provider_payment_ref_idx" ON "insurance_policies" ("provider_payment_ref");

-- AddForeignKey
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_quote_id_fkey"
    FOREIGN KEY ("quote_id") REFERENCES "insurance_quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_guest_id_fkey"
    FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_trust_ledger_id_fkey"
    FOREIGN KEY ("trust_ledger_id") REFERENCES "trust_ledger_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── guests ───────────────────────────────────────────────────────────────────

-- AlterTable
ALTER TABLE "guests" ADD COLUMN "insurance_last_synced_at" TIMESTAMPTZ;
