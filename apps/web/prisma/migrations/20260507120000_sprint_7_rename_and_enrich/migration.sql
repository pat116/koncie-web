-- Sprint 7 migration #1 — rename + enrich.
-- Hand-written (prisma migrate dev binary blocked in sandbox).
-- Apply locally with: pnpm --filter @koncie/web exec prisma migrate dev
-- Apply in Supabase: paste this whole file into the SQL Editor on staging,
-- run, then verify `SELECT 1 FROM "hotel_bookings" LIMIT 1` works.
--
-- Why three migrations and not one (per kickoff §5):
--   #1 (this file) — rename + enrich. Highest blast radius is isolated.
--   #2 — new tables (trips/carts/cart_items/recommendations/additional_booking_lines/property_images).
--   #3 — backfill (data-only, idempotent).
--
-- Per kickoff §12.3 lock: column `booking_id` on dependent tables stays
-- as-is. Only the table name + FK constraint names rename.

-- ─── enums ────────────────────────────────────────────────────────────────────

-- CreateEnum (Sprint 7 — Trip phase machine; S7-01 enum half lands here)
CREATE TYPE "TripPhase" AS ENUM (
    'PRE_CONFIRMATION',
    'PRE_ARRIVAL',
    'IN_STAY',
    'POST_STAY'
);

-- CreateEnum (Sprint 7 — preparation step states; S7-01 enum half lands here)
CREATE TYPE "PreparationStepStatus" AS ENUM (
    'PENDING',
    'COMPLETE',
    'NA'
);

-- CreateEnum (Sprint 7 — flight segment status; S7-04)
CREATE TYPE "FlightSegmentStatus" AS ENUM (
    'CONFIRMED',
    'TIME_CHANGED',
    'CANCELLED'
);

-- ─── S7-02: Booking → HotelBooking rename ─────────────────────────────────────
-- Per kickoff §12.3: only table + index + constraint names rename.
-- The `booking_id` columns on dependent tables stay as-is (deferred to a
-- follow-up cleanup migration).

ALTER TABLE "bookings" RENAME TO "hotel_bookings";
ALTER INDEX "bookings_pkey"             RENAME TO "hotel_bookings_pkey";
ALTER INDEX "bookings_external_ref_key" RENAME TO "hotel_bookings_external_ref_key";

ALTER TABLE "transactions"
  RENAME CONSTRAINT "transactions_booking_id_fkey"
                 TO "transactions_hotel_booking_id_fkey";
ALTER TABLE "message_logs"
  RENAME CONSTRAINT "message_logs_booking_id_fkey"
                 TO "message_logs_hotel_booking_id_fkey";
ALTER TABLE "conversations"
  RENAME CONSTRAINT "conversations_booking_id_fkey"
                 TO "conversations_hotel_booking_id_fkey";
ALTER TABLE "notifications"
  RENAME CONSTRAINT "notifications_booking_id_fkey"
                 TO "notifications_hotel_booking_id_fkey";

-- ─── S7-03: HotelBooking enrichment columns ───────────────────────────────────
-- All nullable except the array defaults + raw_payload default '{}'.
-- Existing rows back-fill with NULL / '{}' / [] cleanly.

ALTER TABLE "hotel_bookings"
  ADD COLUMN "room_type_name"        TEXT,
  ADD COLUMN "room_type_code"        TEXT,
  ADD COLUMN "bed_config"            TEXT,
  ADD COLUMN "view"                  TEXT,
  ADD COLUMN "unit_sqm"              INTEGER,
  ADD COLUMN "amenities"             TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "special_features"      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "price_per_night_minor" INTEGER,
  ADD COLUMN "subtotal_minor"        INTEGER,
  ADD COLUMN "fees_taxes_minor"      INTEGER,
  ADD COLUMN "total_paid_minor"      INTEGER,
  ADD COLUMN "currency"              CHAR(3),
  ADD COLUMN "confirmation_number"   TEXT,
  ADD COLUMN "address"               JSONB,
  ADD COLUMN "raw_payload"           JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ─── S7-04: FlightBooking enrichment columns ──────────────────────────────────
-- Outbound + return segment metadata. Outbound status defaults to CONFIRMED
-- so existing rows are valid post-migration. Return status nullable since
-- one-way trips skip it.

ALTER TABLE "flight_bookings"
  ADD COLUMN "outbound_flight_number"        TEXT,
  ADD COLUMN "outbound_gate"                 TEXT,
  ADD COLUMN "outbound_terminal"             TEXT,
  ADD COLUMN "outbound_status"               "FlightSegmentStatus" NOT NULL DEFAULT 'CONFIRMED',
  ADD COLUMN "outbound_original_departure_at" TIMESTAMPTZ,
  ADD COLUMN "outbound_changed_at"           TIMESTAMPTZ,
  ADD COLUMN "outbound_change_reason"        TEXT,
  ADD COLUMN "return_flight_number"          TEXT,
  ADD COLUMN "return_gate"                   TEXT,
  ADD COLUMN "return_terminal"               TEXT,
  ADD COLUMN "return_status"                 "FlightSegmentStatus", -- nullable, return is optional
  ADD COLUMN "return_original_departure_at"  TIMESTAMPTZ,
  ADD COLUMN "return_changed_at"             TIMESTAMPTZ,
  ADD COLUMN "return_change_reason"          TEXT,
  ADD COLUMN "pnr"                           TEXT,
  ADD COLUMN "raw_payload"                   JSONB NOT NULL DEFAULT '{}'::jsonb;
