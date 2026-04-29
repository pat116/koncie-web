-- Sprint 7 migration #3 — Trip + OPEN Cart backfill (S7-09).
-- Hand-written. Apply locally with: pnpm --filter @koncie/web exec prisma migrate dev
-- Apply on staging: paste into Supabase SQL Editor after migrations #1 + #2.
--
-- Data-only — no DDL. If anything chokes here, migrations #1 and #2 are
-- intact and the backfill can be re-run idempotently after fixes.
--
-- Pre-flight assertion: every property must have a non-null slug (the
-- backfill JOINs on properties so a NULL would surface as a row drop, not
-- a hard error). Run before applying:
--   SELECT COUNT(*) FROM "properties" WHERE slug IS NULL;
-- If non-zero, fix the seed data and re-run.

-- ─── 1. Trip backfill — one Trip per HotelBooking ────────────────────────────
-- Slug rule (kickoff §6 #7 lock): the FIRST row per property gets the
-- un-suffixed slug, so the Namotu seed booking lands at the demo URL
-- `/trip-itinerary/namotu-island-fiji` rather than `…-bf1`. Subsequent
-- backfill rows for the same property get `{slug}-bf2`, `{slug}-bf3`, ….
--
-- Phase derivation here is a SQL approximation of the runtime
-- `derivePhase` function (apps/web/src/lib/trip/phase.ts). The runtime
-- version is timezone-aware; this SQL form uses NOW()::date which is
-- close enough for backfill (off by ≤1 day at TZ boundary, fine for
-- one-shot re-derivation — the recompute cron will refresh it).

INSERT INTO "trips" (
    "id",
    "slug",
    "guest_id",
    "hotel_booking_id",
    "start_date",
    "end_date",
    "phase",
    "phase_computed_at",
    "completion_percent",
    "preparation_status",
    "metadata",
    "created_at",
    "updated_at"
)
SELECT
    gen_random_uuid(),
    CASE
        WHEN ROW_NUMBER() OVER (PARTITION BY b.property_id ORDER BY b.created_at) = 1
            THEN p.slug
        ELSE p.slug || '-bf' || ROW_NUMBER() OVER (PARTITION BY b.property_id ORDER BY b.created_at)
    END,
    b.guest_id,
    b.id,
    b.check_in,
    b.check_out,
    CASE
        WHEN b.status <> 'CONFIRMED'    THEN 'PRE_CONFIRMATION'::"TripPhase"
        WHEN NOW()::date < b.check_in   THEN 'PRE_ARRIVAL'::"TripPhase"
        WHEN NOW()::date <= b.check_out THEN 'IN_STAY'::"TripPhase"
        ELSE                                 'POST_STAY'::"TripPhase"
    END,
    NOW(),
    0,
    -- Default 5-step preparation status. Same shape the runtime ingest
    -- writes (apps/web/src/lib/hotellink/ingest.ts).
    '{"documents":{"status":"PENDING","checkedAt":null},
      "health":{"status":"PENDING","checkedAt":null},
      "weather":{"status":"PENDING","checkedAt":null},
      "currency":{"status":"PENDING","checkedAt":null},
      "customs":{"status":"PENDING","checkedAt":null}}'::jsonb,
    '{}'::jsonb,
    NOW(),
    NOW()
FROM "hotel_bookings" b
JOIN "properties" p ON p.id = b.property_id
-- Idempotency: skip rows we've already backfilled. Re-running this
-- migration on an already-backfilled DB is a no-op.
WHERE NOT EXISTS (
    SELECT 1 FROM "trips" t WHERE t.hotel_booking_id = b.id
);

-- ─── 2. OPEN Cart backfill — one per Trip ────────────────────────────────────
-- Uses `WHERE NOT EXISTS` so a re-run after a partial failure is safe.

INSERT INTO "carts" ("id", "trip_id", "state", "created_at", "updated_at")
SELECT gen_random_uuid(), t.id, 'OPEN', NOW(), NOW()
FROM "trips" t
WHERE NOT EXISTS (
    SELECT 1 FROM "carts" c
    WHERE c.trip_id = t.id AND c.state = 'OPEN'
);

-- ─── 3. Best-effort flight linkage ───────────────────────────────────────────
-- For Trips that don't already have a flight booking, attach the guest's
-- single FlightBooking when the date window plausibly overlaps the stay
-- (departure within 7 days of check-in, on or before check-out).
--
-- Pilot has no real ingested flights yet, so this delivers little for
-- the demo — if the spec runs tight (kickoff §9 cut item #3), this UPDATE
-- can be dropped without affecting anything else.

UPDATE "trips" t
SET "flight_booking_id" = fb.id
FROM (
    SELECT DISTINCT ON (fb.guest_id) fb.id, fb.guest_id, fb.departure_at
    FROM "flight_bookings" fb
    ORDER BY fb.guest_id, fb.departure_at
) fb
WHERE fb.guest_id = t."guest_id"
  AND t."flight_booking_id" IS NULL
  AND fb.departure_at::date BETWEEN t."start_date" - INTERVAL '7 days' AND t."end_date";

-- ─── 4. Post-backfill verification queries (run manually) ────────────────────
-- The four invariants from S7-09 ACs:
--
--   1. Every hotel_booking has a trip:
--      SELECT COUNT(*) FROM hotel_bookings b
--        WHERE NOT EXISTS (SELECT 1 FROM trips t WHERE t.hotel_booking_id = b.id);
--      Expect: 0
--
--   2. Every trip has at least one OPEN cart:
--      SELECT COUNT(*) FROM trips t
--        WHERE NOT EXISTS (SELECT 1 FROM carts c WHERE c.trip_id = t.id AND c.state = 'OPEN');
--      Expect: 0
--
--   3. No orphan carts:
--      SELECT COUNT(*) FROM carts c
--        WHERE NOT EXISTS (SELECT 1 FROM trips t WHERE t.id = c.trip_id);
--      Expect: 0
--
--   4. Every trip has a unique non-null slug:
--      SELECT slug, COUNT(*) FROM trips GROUP BY slug HAVING COUNT(*) > 1;
--      Expect: 0 rows
