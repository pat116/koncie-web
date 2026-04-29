-- Sprint 7 migration #2 — new tables.
-- Hand-written. Apply locally with: pnpm --filter @koncie/web exec prisma migrate dev
-- Apply on staging: paste into Supabase SQL Editor after migration #1.
--
-- Pure new-table DDL — zero impact on existing rows. If any CREATE fails
-- the migration aborts and migration #1's rename + enrich is intact.
--
-- Tickets: S7-01 (Trip table), S7-05 (Cart + CartItem), S7-06 (Recommendation),
-- S7-07 (AdditionalBookingLine), S7-08 (PropertyImage).

-- ─── enums ────────────────────────────────────────────────────────────────────

CREATE TYPE "CartState" AS ENUM (
    'OPEN',
    'LOCKED_FOR_CHECKOUT',
    'CLOSED'
);

CREATE TYPE "CartItemKind" AS ENUM (
    'FLIGHT',
    'TRANSFER',
    'ACTIVITY',
    'DINING',
    'OTHER'
);

CREATE TYPE "CartItemProvider" AS ENUM (
    'JETSEEKER',
    'VIATOR',
    'INTERNAL',
    'OTHER'
);

CREATE TYPE "CartPriceUnit" AS ENUM (
    'PER_PERSON',
    'PER_UNIT',
    'FIXED'
);

CREATE TYPE "RecommendationKind" AS ENUM (
    'ACTIVITY',
    'RESTAURANT',
    'ATTRACTION',
    'EXPERIENCE'
);

CREATE TYPE "PriceTier" AS ENUM (
    'BUDGET',
    'MODERATE',
    'PREMIUM'
);

CREATE TYPE "RecommendationSourceProvider" AS ENUM (
    'VIATOR',
    'INTERNAL_DB',
    'EXTERNAL'
);

CREATE TYPE "PropertyImageKind" AS ENUM (
    'HERO',
    'UNIT',
    'GALLERY',
    'AMENITY'
);

-- ─── property_images (S7-08) ─────────────────────────────────────────────────
-- Sidecar table — Koncie-owned, manually populated for the pilot.

CREATE TABLE "property_images" (
    "id"            UUID NOT NULL,
    "property_id"   UUID NOT NULL,
    "image_url"     TEXT NOT NULL,
    "caption"       TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "kind"          "PropertyImageKind" NOT NULL DEFAULT 'GALLERY',
    "is_active"     BOOLEAN NOT NULL DEFAULT true,
    "created_at"    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMPTZ NOT NULL,

    CONSTRAINT "property_images_pkey" PRIMARY KEY ("id")
);

-- Partial index — only active images, ordered for display.
CREATE INDEX "property_images_property_id_order_idx"
    ON "property_images" ("property_id", "display_order")
    WHERE "is_active";

ALTER TABLE "property_images" ADD CONSTRAINT "property_images_property_id_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── trips (S7-01) ───────────────────────────────────────────────────────────
-- One Trip per HotelBooking (1:1). Slug locked at creation, immutable on
-- amendment (kickoff §12.3 lock).
-- `nights` is a generated column derived from start_date and end_date.

CREATE TABLE "trips" (
    "id"                  UUID NOT NULL,
    "slug"                TEXT NOT NULL,
    "guest_id"            UUID NOT NULL,
    "hotel_booking_id"    UUID NOT NULL,
    "flight_booking_id"   UUID,
    "origin_airport_iata" CHAR(3),
    "start_date"          DATE NOT NULL,
    "end_date"            DATE NOT NULL,
    "nights"              INTEGER GENERATED ALWAYS AS ((("end_date" - "start_date"))::INTEGER) STORED,
    "phase"               "TripPhase" NOT NULL DEFAULT 'PRE_ARRIVAL',
    "phase_computed_at"   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completion_percent"  INTEGER NOT NULL DEFAULT 0,
    "preparation_status"  JSONB NOT NULL,
    "metadata"            JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at"          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMPTZ NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "trips_slug_key"              ON "trips" ("slug");
CREATE UNIQUE INDEX "trips_hotel_booking_id_key"  ON "trips" ("hotel_booking_id");
CREATE UNIQUE INDEX "trips_flight_booking_id_key" ON "trips" ("flight_booking_id");
CREATE INDEX        "trips_guest_id_start_date_idx" ON "trips" ("guest_id", "start_date");
CREATE INDEX        "trips_phase_idx"               ON "trips" ("phase");

ALTER TABLE "trips" ADD CONSTRAINT "trips_guest_id_fkey"
    FOREIGN KEY ("guest_id") REFERENCES "guests"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trips" ADD CONSTRAINT "trips_hotel_booking_id_fkey"
    FOREIGN KEY ("hotel_booking_id") REFERENCES "hotel_bookings"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trips" ADD CONSTRAINT "trips_flight_booking_id_fkey"
    FOREIGN KEY ("flight_booking_id") REFERENCES "flight_bookings"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── carts (S7-05) ───────────────────────────────────────────────────────────
-- Per-Trip. Partial unique index enforces ≤1 OPEN cart per Trip (kickoff
-- §12.3 lock). 15-minute lock TTL is the pilot default (kickoff §6 #6).

CREATE TABLE "carts" (
    "id"              UUID NOT NULL,
    "trip_id"         UUID NOT NULL,
    "state"           "CartState" NOT NULL DEFAULT 'OPEN',
    "subtotal_minor"  INTEGER NOT NULL DEFAULT 0,
    "currency"        CHAR(3),
    "locked_at"       TIMESTAMPTZ,
    "closed_at"       TIMESTAMPTZ,
    "lock_expires_at" TIMESTAMPTZ,
    "created_at"      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMPTZ NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- Composite unique used by the Prisma side for relation integrity.
CREATE UNIQUE INDEX "carts_trip_id_id_key" ON "carts" ("trip_id", "id");
-- THE key invariant: ≤1 OPEN cart per Trip (closed/locked carts can stack).
CREATE UNIQUE INDEX "carts_trip_id_open_unique"
    ON "carts" ("trip_id") WHERE "state" = 'OPEN';
CREATE INDEX "carts_trip_id_idx" ON "carts" ("trip_id");

ALTER TABLE "carts" ADD CONSTRAINT "carts_trip_id_fkey"
    FOREIGN KEY ("trip_id") REFERENCES "trips"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── cart_items (S7-05) ──────────────────────────────────────────────────────
-- Multi-currency per-line: source currency capture + AUD-display fields,
-- per kickoff §12.3 lock. fx_provider defaults to openexchangerates with
-- 100 bps margin.

CREATE TABLE "cart_items" (
    "id"                            UUID NOT NULL,
    "cart_id"                       UUID NOT NULL,
    "kind"                          "CartItemKind" NOT NULL,
    "provider"                      "CartItemProvider" NOT NULL,
    "provider_item_id"              TEXT NOT NULL,
    "title"                         TEXT NOT NULL,
    "description"                   TEXT,
    "image_url"                     TEXT,
    "unit_price_minor"              INTEGER NOT NULL,
    "price_unit"                    "CartPriceUnit" NOT NULL DEFAULT 'PER_UNIT',
    "qty"                           INTEGER NOT NULL DEFAULT 1,
    "source_currency"               CHAR(3) NOT NULL,
    "source_amount_minor"           INTEGER NOT NULL,
    "display_amount_aud_minor"      INTEGER NOT NULL,
    "fx_rate_used"                  DECIMAL(18, 8) NOT NULL DEFAULT 1,
    "fx_provider"                   TEXT NOT NULL DEFAULT 'openexchangerates',
    "fx_locked_at"                  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fx_margin_bps"                 INTEGER NOT NULL DEFAULT 100,
    "line_total_minor"              INTEGER NOT NULL,
    "scheduled_at"                  TIMESTAMPTZ,
    "metadata"                      JSONB NOT NULL DEFAULT '{}'::jsonb,
    "added_at"                      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "added_from_recommendation_id"  UUID,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cart_items_cart_id_idx" ON "cart_items" ("cart_id");

ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey"
    FOREIGN KEY ("cart_id") REFERENCES "carts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
-- Recommendation linkage FK added below after the recommendations table exists.

-- ─── recommendations (S7-06) ─────────────────────────────────────────────────
-- Storage shape only this sprint. The recommender service ships in Sprint 9.

CREATE TABLE "recommendations" (
    "id"                          UUID NOT NULL,
    "trip_id"                     UUID NOT NULL,
    "kind"                        "RecommendationKind" NOT NULL,
    "title"                       TEXT NOT NULL,
    "description"                 TEXT,
    "rating"                      DECIMAL(2, 1),
    "review_count"                INTEGER,
    "why_recommended"             TEXT,
    "price_tier"                  "PriceTier",
    "price_from_minor"            INTEGER,
    "currency"                    CHAR(3),
    "duration_minutes"            INTEGER,
    "distance_from_resort_minutes" INTEGER,
    "available_dates"             DATE[] NOT NULL DEFAULT ARRAY[]::DATE[],
    "available_times"             TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "tags"                        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "categories"                  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "source_provider"             "RecommendationSourceProvider" NOT NULL,
    "source_provider_item_id"     TEXT,
    "image_url"                   TEXT,
    "score"                       DECIMAL(5, 2),
    "saved_for_later"             BOOLEAN NOT NULL DEFAULT false,
    "created_at"                  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"                  TIMESTAMPTZ NOT NULL,

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recommendations_trip_id_idx"
    ON "recommendations" ("trip_id");
-- Score-ordered index for the recommender's top-N queries.
CREATE INDEX "recommendations_trip_id_score_idx"
    ON "recommendations" ("trip_id", "score" DESC NULLS LAST);
-- Partial index — saved-for-later list. Drives the "wishlist" surface.
CREATE INDEX "recommendations_trip_id_saved_idx"
    ON "recommendations" ("trip_id") WHERE "saved_for_later";

ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_trip_id_fkey"
    FOREIGN KEY ("trip_id") REFERENCES "trips"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Now the cart_items FK to recommendations can land.
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_added_from_recommendation_id_fkey"
    FOREIGN KEY ("added_from_recommendation_id") REFERENCES "recommendations"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── additional_booking_lines (S7-07) ────────────────────────────────────────
-- Empty table this sprint; Sprint 8 populates on checkout commit.
-- 1:1 with Transaction (transaction_id is unique).

CREATE TABLE "additional_booking_lines" (
    "id"               UUID NOT NULL,
    "trip_id"          UUID NOT NULL,
    "kind"             "CartItemKind" NOT NULL,
    "provider"         "CartItemProvider" NOT NULL,
    "provider_item_id" TEXT NOT NULL,
    "transaction_id"   UUID,
    "title"            TEXT NOT NULL,
    "scheduled_at"     TIMESTAMPTZ,
    "amount_minor"     INTEGER NOT NULL,
    "currency"         CHAR(3) NOT NULL,
    "status"           TEXT NOT NULL,
    "metadata"         JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at"       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMPTZ NOT NULL,

    CONSTRAINT "additional_booking_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "additional_booking_lines_transaction_id_key"
    ON "additional_booking_lines" ("transaction_id");
CREATE INDEX "additional_booking_lines_trip_id_idx"
    ON "additional_booking_lines" ("trip_id");

ALTER TABLE "additional_booking_lines" ADD CONSTRAINT "additional_booking_lines_trip_id_fkey"
    FOREIGN KEY ("trip_id") REFERENCES "trips"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "additional_booking_lines" ADD CONSTRAINT "additional_booking_lines_transaction_id_fkey"
    FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
