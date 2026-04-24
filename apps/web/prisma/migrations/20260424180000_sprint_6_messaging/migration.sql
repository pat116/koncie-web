-- Sprint 6: Pre-arrival comms + MessageLog audit.
-- Hand-written migration (prisma migrate dev blocked in CI sandbox; Supabase
-- direct-connect URL is IPv6-only so Vercel build can't run `migrate deploy`
-- either — Pat applies manually via Supabase SQL Editor. See sprint-6 PR body.
-- Apply locally with: pnpm --filter @koncie/web exec prisma migrate dev

-- ─── enums ────────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM (
    'MAGIC_LINK',
    'UPSELL_REMINDER_T7',
    'INSURANCE_REMINDER_T3',
    'INSURANCE_RECEIPT',
    'OTHER'
);

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM (
    'QUEUED',
    'SENT',
    'DELIVERED',
    'BOUNCED',
    'COMPLAINED',
    'FAILED'
);

-- ─── message_logs ─────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "message_logs" (
    "id" UUID NOT NULL,
    "guest_id" UUID,
    "booking_id" UUID,
    "kind" "MessageKind" NOT NULL,
    "template_id" TEXT NOT NULL,
    "recipient_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
    "provider_message_id" TEXT,
    "failure_reason" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "sent_at" TIMESTAMPTZ,
    "delivered_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "message_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "message_logs_provider_message_id_key"
    ON "message_logs" ("provider_message_id");

-- CreateIndex
CREATE INDEX "message_logs_guest_id_created_at_idx"
    ON "message_logs" ("guest_id", "created_at");

-- CreateIndex
CREATE INDEX "message_logs_booking_id_created_at_idx"
    ON "message_logs" ("booking_id", "created_at");

-- CreateIndex
CREATE INDEX "message_logs_kind_status_created_at_idx"
    ON "message_logs" ("kind", "status", "created_at");

-- AddForeignKey
-- ON DELETE SET NULL so guest/booking deletion doesn't cascade into audit.
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_guest_id_fkey"
    FOREIGN KEY ("guest_id") REFERENCES "guests"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
