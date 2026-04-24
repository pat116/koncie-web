-- Sprint 3: flight ingest foundation — FlightBooking + Guest.flights_last_synced_at
-- Hand-written migration (prisma migrate dev blocked in CI sandbox).
-- Apply with: pnpm --filter @koncie/web exec prisma migrate dev

-- ─── flight_bookings ──────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "flight_bookings" (
    "id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "external_ref" TEXT NOT NULL,
    "origin" CHAR(3) NOT NULL,
    "destination" CHAR(3) NOT NULL,
    "departure_at" TIMESTAMPTZ NOT NULL,
    "return_at" TIMESTAMPTZ,
    "carrier" CHAR(2) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "flight_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "flight_bookings_guest_id_external_ref_key" ON "flight_bookings" ("guest_id", "external_ref");

-- CreateIndex
CREATE INDEX "flight_bookings_guest_id_departure_at_idx" ON "flight_bookings" ("guest_id", "departure_at");

-- AddForeignKey
ALTER TABLE "flight_bookings" ADD CONSTRAINT "flight_bookings_guest_id_fkey"
    FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── guests ───────────────────────────────────────────────────────────────────

-- AlterTable
ALTER TABLE "guests" ADD COLUMN "flights_last_synced_at" TIMESTAMPTZ;
