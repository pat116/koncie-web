# Sprint 3 Design — Jet Seeker itinerary ingestion + contextual offers

**Status:** Spec — awaiting Pat's review
**Date:** 2026-04-24
**Sprint:** 3 (reference: `docs/plan-addendum.md` §3 — "Sprint 3 reframed: Jet Seeker itinerary ingestion")
**Author:** Claude (via brainstorming session with Pat)

## TL;DR

Sprint 3 adds Koncie's first read-only integration: flight itinerary data from Jet Seeker is ingested into each guest's member profile, rendered alongside their hotel booking on `/hub`, and used to surface two kinds of contextual offer (an activities deep-link that uses Sprint 2's existing `/hub/activities` surface, and a Sprint-4-ready insurance stub with destination-contextual copy). The integration follows Sprint 2's mock-first pattern: a `FlightItinerarySource` port with a `JetSeekerMockAdapter` that returns hardcoded data for the seeded guest, exercised through an ingestion service that caches to Postgres, wired into the hub via lazy-sync on render. Real Jet Seeker API swap-in is deferred to a later sprint once API access is confirmed.

## Goals

1. A `FlightItinerarySource` port with a mock adapter that Sprint-N can swap for a real Jet Seeker wrapper with a one-line import change (mirrors Sprint 2's `PaymentProvider` pattern).
2. A `FlightBooking` Postgres table that Koncie owns — the query substrate for hub rendering, contextual offers, and future flight-scoped ancillary logic.
3. A reproducible demo where the seeded guest's `/hub` shows both their Namotu booking AND their SYD↔NAN flight itinerary without any outbound API call on the render hot-path (cached in Postgres after first ingestion).
4. Two contextual offer surfaces visible on `/hub` when flight data exists: a clickable "Your Namotu activities await" card deep-linking to `/hub/activities`, and a "Travel protection · covers your 14 Jul flight to Nadi" stub card holding the Sprint 4 slot.
5. Zero disruption to Sprint 2's MoR compliance posture — no schema changes to `transactions`, `trust_ledger_entries`, `saved_cards`, or `upsells`.

## Non-goals

- Real Jet Seeker API integration → swap happens in a later sprint, tracked by replacing the mock adapter
- Flight search / booking UI inside Koncie → Jet Seeker keeps flight search; Koncie is itinerary overlay only (per `docs/plan-addendum.md` §2)
- Rules-engine for contextual offers → hardcoded if-statements in Sprint 3; promote to an engine when a second offer-matching rule appears
- `Itinerary` aggregate entity grouping hotel + flight bookings → deferred; hub queries union the two tables directly
- Rename of `Booking` → `HotelBooking` → deferred; keeps Sprint 2's migration state undisturbed
- Cross-app SSO between Jet Seeker and Koncie → MVP uses the email as the linking key; real SSO is Phase 2
- Sprint 2 carryover items (Sentry on captured-but-rollback, FX rates API, Kovena hosted iframe, DB-in-CI for Playwright) → separate follow-ups
- Insurance provider integration or purchase flow → Sprint 4

## Architecture

**Extends Sprint 2's ports-and-adapters pattern.** Sprint 3 adds a third port — `FlightItinerarySource` — alongside `PartnerAdapter` (Sprint 1) and `PaymentProvider` (Sprint 2). Each port has one shipping adapter (`HotelLinkMockAdapter`, `KovenaMockAdapter`, `JetSeekerMockAdapter`) and a dedicated DI module at `apps/web/src/lib/<domain>/provider.ts`.

**Read-only port.** Sprint 3's `FlightItinerarySource` has one method: `fetchBookingsForGuest(email)`. No booking-creation side (Koncie does not book flights — that lives in Jet Seeker). Sprint-N can extend the port when a write side is needed.

**Ingestion-then-cache data flow.** The mock adapter returns in-memory `FlightBookingRead[]` objects. An ingestion service (`syncFlightsForGuest`) persists them to `FlightBooking` keyed on `(guestId, externalRef)`. Hub reads from `FlightBooking` directly — no outbound adapter call on the render hot-path once sync has run.

**Two triggers for `syncFlightsForGuest`:**
1. **Dev-helper route** `/__test__/ingest-jetseeker-for-seed-guest` — GET handler, guarded by `NODE_ENV !== 'production' || KONCIE_ENABLE_TEST_ROUTES === '1'`. Playwright + manual demos use this. Same guard pattern as Sprint 2-polish's `/__test__/sign-in-as-seed-guest` route.
2. **Lazy-sync on hub render** — when the current guest's `flightsLastSyncedAt` is null OR older than 60 seconds AND their `FlightBooking` rows are empty, the `/hub` server component calls sync before rendering. Debounce prevents repeated syncs for a visitor clicking around the hub.

**Stack additions** (on top of Sprint 2): no new deps. Sprint 3 reuses `@prisma/client`, Sentry, existing Vitest + Playwright.

## Domain model (Prisma schema v3)

One new model. One column added to `Guest`. Zero changes to Sprint 2's `Booking`, `Transaction`, `TrustLedgerEntry`, `SavedCard`, `Upsell`, `Property`, `PartnerIntegration`.

### FlightBooking (new)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (pk) | |
| `guestId` | uuid (fk → Guest) | |
| `externalRef` | text | Jet Seeker PNR. Unique per guest via `(guestId, externalRef)` index — idempotent upsert key |
| `origin` | char(3) | IATA airport code (e.g. `SYD`) |
| `destination` | char(3) | IATA airport code (e.g. `NAN`) |
| `departureAt` | timestamptz | |
| `returnAt` | timestamptz (nullable) | null for one-way |
| `carrier` | char(2) | IATA airline code (e.g. `FJ`) |
| `metadata` | jsonb | passenger count, class, anything Jet Seeker returns we don't yet model |
| `createdAt`, `updatedAt` | timestamptz | |

**Indexes:**

- `UNIQUE (guest_id, external_ref)` — idempotent upsert key; prevents duplicates on re-sync
- `(guest_id, departure_at)` — hub-query shape ("this guest's next flight")

No DB CHECK constraints. Unlike `transactions`, nothing MoR-load-bearing here.

### Guest (new column)

- `flightsLastSyncedAt` — timestamptz, nullable. Debounce anchor for the 60-second lazy-sync rule. Updated after every successful `syncFlightsForGuest` call. Not updated when adapter throws.
- Back-relation: `flightBookings FlightBooking[]`

### Seed extension (`apps/web/prisma/seed.ts`)

After existing upsell seed, add one `FlightBooking` for the Namotu trip:

- `externalRef: "JS-JANE-NAMOTU-01"`
- `origin: "SYD"`, `destination: "NAN"`
- `departureAt: "2026-07-14T08:00:00+10:00"`, `returnAt: "2026-07-21T14:30:00+12:00"` (aligned to the Sprint 1 Namotu booking)
- `carrier: "FJ"` (Fiji Airways)
- `metadata: { adults: 2, class: "economy" }`

Seed stays idempotent: `deleteMany` for guest's flight bookings before recreate, same pattern as Sprint 2's upsell seed.

## Guest journey

Hub layout stays sequential and mobile-first — no tabs, no accordions, no disclosure. Sprint 3 inserts one section and tweaks two existing elements; everything else from Sprint 2 is preserved.

**Render order on `/hub`:**

1. **Booking hero** (Sprint 1, unchanged) — `YOUR UPCOMING TRIP · Namotu Island Fiji · 14–21 July 2026 · 2 guests · in N days` + View details CTA
2. **Flight itinerary card** (NEW) — navy card matching booking-hero visual weight. `YOUR FLIGHT · Fiji Airways FJ`, outbound and return rows with IATA codes + dates, "via Jet Seeker" footer meta. Green "NEW" pill during the first roll-out so returning guests notice the addition (can be removed post-pilot).
3. **Your add-ons** (Sprint 2, unchanged) — rendered when any captured transaction exists for this guest
4. **Plan your trip / Activities preview** (Sprint 2, unchanged) — 2 upsell cards + "Browse all →" link
5. **Contextual deep-link card** (NEW) — green accent card "Your Namotu activities await / Ready for when you land in Nadi". Clickable, links to `/hub/activities`. Only rendered when the activities deep-link rule fires (destination is `NAN` or `SUV`).
6. **Travel protection stub** (UPDATED) — Sprint 2 shipped this as "Coming soon". Sprint 3 subtitles it with destination + date context when a flight exists: "Covers your 14 Jul flight to Nadi". Body copy still "Coming soon"; the surface is being held for Sprint 4's real insurance offer.

**Removed:** The Sprint 2 "Flight add-ons · Coming soon · via Jet Seeker" stub card is deleted. The real flight itinerary card (2) replaces it.

**Offer rendering rules** (hardcoded, pure function `resolveContextualOffers(flight, guest, upsells)` in `apps/web/src/lib/flights/contextual-offers.ts`):

- **insurance-stub**: emitted whenever `flight` is non-null. `destinationLabel` resolved from a small `IATA_TO_CITY` lookup (`NAN → Nadi`, `SUV → Suva`, `SYD → Sydney`; SYD included defensively for future flight-card city-name labels even though Sprint 3 only consumes `destinationLabel`). Sprint-N extends as pilot destinations diversify.
- **activities-deep-link**: emitted when `flight.destination IN ['NAN','SUV']` AND at least one `Upsell` with `status = 'ACTIVE'` exists at the Namotu property. Sprint-N generalises the destination-match when a second pilot hotel lands.

Both rules live in one ~40-line pure function; no `ContextualOffer` domain entity, no rules engine, no dismiss action, no priority logic. Promoting to a real engine is a Sprint-N concern once a third offer type appears.

## FlightItinerarySource port + JetSeekerMockAdapter

### Port (`packages/types/src/flights.ts`)

```ts
export interface FlightBookingRead {
  externalRef: string;
  guestEmail: string;
  origin: string;         // IATA
  destination: string;    // IATA
  departureAt: string;    // ISO-8601
  returnAt: string | null;
  carrier: string;        // IATA airline code
  metadata: Record<string, unknown>;
}

export interface FlightItinerarySource {
  fetchBookingsForGuest(email: string): Promise<FlightBookingRead[]>;
}
```

Re-exported from `packages/types/src/index.ts`.

### Mock adapter (`apps/web/src/adapters/jetseeker-mock.ts`)

- `class JetSeekerMockAdapter implements FlightItinerarySource`
- 150ms `setTimeout` to mimic network
- Email-matched hardcoded responses:
  - `pat@kovena.com` (the seeded `KONCIE_SEED_EMAIL`) → one round-trip booking: SYD→NAN Jul 14 08:00 AEST, NAN→SYD Jul 21 14:30 FJT, `JS-JANE-NAMOTU-01`, `FJ`, `{ adults: 2, class: 'economy' }`
  - `flight-unavailable@test.com` → throws `JetSeekerUnavailableError`
  - Any other email → returns `[]`

### DI module (`apps/web/src/lib/flights/provider.ts`)

```ts
import { JetSeekerMockAdapter } from '@/adapters/jetseeker-mock';
export const flightItinerarySource: FlightItinerarySource = new JetSeekerMockAdapter();
```

Sprint-N swaps the import for a real Kovena/Jet Seeker wrapper — one-line change.

### Ingestion service (`apps/web/src/lib/flights/sync.ts`)

`syncFlightsForGuest(guestId: string): Promise<void>` wraps the full flow in `prisma.$transaction`:

1. Load the guest record (need email for adapter, id for relation writes)
2. Call `flightItinerarySource.fetchBookingsForGuest(guest.email)`
3. Upsert each `FlightBookingRead` into `FlightBooking`, keyed `(guestId, externalRef)`
4. Delete any existing `FlightBooking` rows for this guest whose `externalRef` is not in the new result set (handles future flight cancellations — code path is tested in Sprint 3 but never exercised by the seed data)
5. Update `guest.flightsLastSyncedAt = new Date()`

On adapter throw: catch, capture to Sentry with `guestId` context, leave `flightsLastSyncedAt` unchanged (so the next call retries), re-throw as `JetSeekerUnavailableError` for the caller's soft-fail handling.

### Dev-helper route (`apps/web/src/app/__test__/ingest-jetseeker-for-seed-guest/route.ts`)

GET handler guarded by `NODE_ENV !== 'production' || KONCIE_ENABLE_TEST_ROUTES === '1'` (same guard as Sprint 2-polish's `/__test__/sign-in-as-seed-guest`). Resolves the seeded guest by `KONCIE_SEED_EMAIL`, calls `syncFlightsForGuest(guest.id)`, returns 303 redirect to `/hub`. Playwright and manual demos use this to bypass lazy-sync timing.

### Hub lazy-sync

`/hub/page.tsx` server component, before the main render block:

```
if (guest.flightsLastSyncedAt == null || Date.now() - guest.flightsLastSyncedAt.getTime() > 60_000) {
  if ((await prisma.flightBooking.count({ where: { guestId: guest.id } })) === 0) {
    try { await syncFlightsForGuest(guest.id); } catch (err) { /* soft-fail banner renders */ }
  }
}
```

The `count === 0` guard prevents re-syncing a guest whose flight data is already cached. Sprint-N removes the count guard when cancellations need to round-trip quickly.

## Errors

| Class | Nature | Shown to guest? | Sentry? |
|---|---|---|---|
| `JetSeekerUnavailableError` | Infra failure (timeout, 5xx, auth) | Soft-fail banner in the flight-card slot | Yes |

No guest-facing error states beyond the single soft-fail banner. All other exceptions propagate as normal server errors — the existing Sprint 1 error page (`/app/error.tsx`) handles them.

## Tests

**Unit (~18 tests across 4 files):**

1. `packages/types/src/flights.test.ts` — 2 type-only tests: interface shape + `returnAt` nullability
2. `apps/web/src/adapters/jetseeker-mock.test.ts` — 5 tests: seed email returns expected SYD↔NAN round trip, unknown email returns `[]`, `flight-unavailable@test.com` throws `JetSeekerUnavailableError`, returned `departureAt` parses as valid Date, `carrier` is exactly 2 chars
3. `apps/web/src/lib/flights/sync.test.ts` — 4 tests with mocked Prisma + mocked provider: first sync creates the expected row, second sync with identical data is idempotent (no duplicates), sync with a removed `externalRef` deletes the stale row, adapter throw leaves `flightsLastSyncedAt` unchanged
4. `apps/web/src/lib/flights/contextual-offers.test.ts` — 6 tests: `NAN` destination + ACTIVE Namotu upsells emits `activities-deep-link`; `BNE` destination emits no deep-link; null flight emits no offers; flight exists always emits `insurance-stub`; `IATA_TO_CITY` resolves correctly for all three seeded codes; only-INACTIVE upsells array doesn't emit deep-link even when destination matches

**E2E (1 spec):**

5. `apps/web/tests/e2e/flights.spec.ts` — `beforeEach` hits `/__test__/ingest-jetseeker-for-seed-guest` then `/__test__/sign-in-as-seed-guest`, asserts the hub shows (a) the flight card with both routing rows and dates, (b) the "Your Namotu activities await" deep-link card, (c) the "Travel protection · covers your 14 Jul flight to Nadi" contextual stub. Clicks the deep-link and asserts landing on `/hub/activities`.

## Docs

- `docs/architecture.md` — append `FlightItinerarySource` port to the ports-and-adapters diagram (alongside `PartnerAdapter` + `PaymentProvider`); add a "Flights" section describing the ingestion-then-cache pattern
- `docs/data-model.md` — append `FlightBooking` field table + note the `Guest.flightsLastSyncedAt` addition
- `docs/flights.md` (new) — port contract, mock adapter behaviour including the fail-trigger email, `IATA_TO_CITY` extension rules, and a Sprint-N swap-in guide for real Jet Seeker (mirrors `docs/payments.md` from Sprint 2)
- `docs/sprints/sprint-3-changelog.md` (new) — standard post-sprint artifact with shipped list, gotchas-hit placeholder, open tech debt into Sprint 4

## Definition of done

1. Seeded guest's `/hub` renders the flight itinerary card with SYD↔NAN routing and July 14/21 dates
2. "Your Namotu activities await" deep-link card visible, clickable, lands on `/hub/activities`
3. "Travel protection · covers your 14 Jul flight to Nadi" stub visible with destination-contextual copy
4. `pnpm db:seed` creates exactly one `FlightBooking` row for the seeded guest; `Guest.flightsLastSyncedAt` is null at first render
5. First hub render for the seed guest lazy-triggers sync; subsequent renders within 60s don't re-sync (observe via Prisma query log)
6. Dev-helper route `/__test__/ingest-jetseeker-for-seed-guest` returns 303 redirect to `/hub`; hitting it refreshes `flightsLastSyncedAt`
7. All CI checks green (typecheck, lint, build, test); Playwright E2E flights.spec runs against the dev-helper route (remains `continue-on-error` in CI per Sprint 2-polish posture)

## Risks

**OneDrive sync truncation on large files.** Sprint 2-polish hit this with `pnpm-lock.yaml`. Sprint 3 adds a new migration.sql — mitigation: Pat runs `pnpm prisma migrate dev` locally on Windows where git is authoritative, not from sandbox.

**Lazy-sync race on first visit.** If two tabs open `/hub` simultaneously for a fresh guest, both call `syncFlightsForGuest`. Prisma's unique index on `(guestId, externalRef)` makes upsert races safe (the second one replaces the first's row with identical data). `flightsLastSyncedAt` may be written twice — harmless. No mitigation needed for Sprint 3; Sprint-N moves to background sync.

**`IATA_TO_CITY` gets out of sync with real Jet Seeker destinations.** Sprint-N risk only. For Sprint 3 the pilot cohort only flies to Nadi/Suva and the lookup is hardcoded to match.

**Mock adapter behaviours treated as contract.** Per Sprint 2's `docs/payments.md` precedent, `docs/flights.md` explicitly flags that `JetSeekerMockAdapter` behaviours (email-matched responses, 150ms delay, fail-trigger email) are **mock-only** and MUST NOT be relied on by production code paths. The port in `packages/types` is the contract.

**Adapter swap-in timing.** Sprint 3's spec assumes the real Jet Seeker API will materialise eventually but doesn't block on it. If real access is indefinite, the mock adapter ships with the pilot demo — acceptable per `docs/plan-addendum.md` §6.1 ("Greenfield for prototype demo purposes only — no production SDK wiring required for MVP").

## Decisions locked

1. **Jet Seeker access: mock-first.** `JetSeekerMockAdapter` ships as the only adapter. Real Jet Seeker API swap happens in a later sprint when access is confirmed.
2. **Scope: core + contextual offers.** FlightItinerarySource port + JetSeekerMockAdapter + FlightBooking schema + hub render + contextual offer resolver with one deep-link rule and one insurance stub. No cross-app account linking, no rules engine, no Sprint 2 carryovers folded in.
3. **Schema shape: minimal-churn.** Keep Sprint 2's `Booking` model unchanged. Add `FlightBooking` alongside. Transaction fk is unchanged (remains on hotel-Booking). No Itinerary aggregate entity — hub unions the two queries. No rename of `Booking` → `HotelBooking` (Sprint-N concern if the schema ambiguity starts costing).
4. **Offer surface: one real deep-link + one stub.** The "Your Namotu activities await" card is clickable and exercises the end-to-end overlay pattern via Sprint 2's existing `/hub/activities`. The "Travel protection" card gains destination-contextual copy but remains a Sprint-4 slot.
5. **Architectural flow: adapter pulls, Postgres caches.** Mock adapter is called by the ingestion service (not from the render path). Postgres is the query substrate for `/hub`. Mirrors Sprint 2's `KovenaMockAdapter` → ingestion → Postgres pattern.
