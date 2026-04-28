-- Sprint 6 completion: Twilio SMS, chat surface, notifications.
-- Hand-written. Apply via Supabase SQL Editor; same posture as
-- 20260424180000_sprint_6_messaging and 20260424200000_sprint_7_hotellink.
-- Apply locally with: pnpm --filter @koncie/web exec prisma migrate dev

-- ─── enum extensions ─────────────────────────────────────────────────────────

-- MessageKind grows a single SMS value. The shipped 5 email-kinds plus
-- HOTEL_BOOKING_CONFIRMED stay; this is purely additive.
ALTER TYPE "MessageKind" ADD VALUE 'PRE_ARRIVAL_SMS';

-- ─── guests.phone ────────────────────────────────────────────────────────────

-- E.164. Nullable: pre-Sprint-6-completion bookings won't have a phone on
-- file. The SMS dispatcher skips guests without a phone number.
ALTER TABLE "guests" ADD COLUMN "phone" TEXT;

-- ─── message_logs.recipient_phone + nullable recipient_email ─────────────────

-- Coexistence: an email message has recipient_email populated and
-- recipient_phone null; an SMS message has recipient_phone populated and
-- recipient_email null. Existing rows already have non-null email values,
-- so dropping the NOT NULL is safe.
ALTER TABLE "message_logs" ALTER COLUMN "recipient_email" DROP NOT NULL;
ALTER TABLE "message_logs" ADD COLUMN "recipient_phone" TEXT;

-- ─── chat conversation persistence ───────────────────────────────────────────
-- Conversation = one per Booking (created lazily on first /c/[token] resolve
-- or on SMS dispatch — whichever fires first). ChatMessage = one row per
-- guest- or AI-authored message. This persistence layer is *separate* from
-- message_logs (which is the outbound-delivery audit). Neither imports the
-- other; the Sprint-6 completion brief §1 deltas + risk-mitigation §8 lock
-- this separation.

CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'pre_arrival',
    "greeting_sent_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- One Conversation per Booking — enforced. Future kinds (`in_stay`,
-- `post_stay`) would need a (booking_id, kind) composite if that ever lands.
CREATE UNIQUE INDEX "conversations_booking_id_key" ON "conversations" ("booking_id");

ALTER TABLE "conversations" ADD CONSTRAINT "conversations_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "sent_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "chat_messages_conversation_id_sent_at_idx"
    ON "chat_messages" ("conversation_id", "sent_at");

ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── notifications ───────────────────────────────────────────────────────────
-- Three kinds: BOOKING_CONFIRMED (booking-confirmed event), FLIGHT_TIME_CHANGED
-- (JetSeeker webhook → S6-08), WELCOME_TO_RESORT (cron at check_in_date 00:00
-- local). Polled via GET /api/notifications?booking_id=… ; PATCH marks read.

CREATE TYPE "NotificationKind" AS ENUM (
    'BOOKING_CONFIRMED',
    'FLIGHT_TIME_CHANGED',
    'WELCOME_TO_RESORT'
);

CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "inline_cta" JSONB,
    "read" BOOLEAN NOT NULL DEFAULT FALSE,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notifications_booking_id_created_at_idx"
    ON "notifications" ("booking_id", "created_at");

CREATE INDEX "notifications_booking_id_read_idx"
    ON "notifications" ("booking_id", "read");

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
