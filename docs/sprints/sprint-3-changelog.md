# Sprint 3 Changelog — Jet Seeker itinerary ingestion + contextual offers

**Shipped:** TODO add date on PR merge
**Reference spec:** `docs/specs/2026-04-24-sprint-3-design.md`
**Reference plan:** `docs/plans/2026-04-24-sprint-3-plan.md`

## What shipped

- **FlightItinerarySource port** (`packages/types/src/flights.ts`) — read-only `fetchBookingsForGuest(email)`. Sprint-N wraps real Jet Seeker.
- **JetSeekerMockAdapter** — hardcoded email-matched responses; seed email → SYD↔NAN round-trip; fail-trigger email throws.
- **Prisma schema v3** — adds `FlightBooking` model, `Guest.flightsLastSyncedAt` column. No CHECKs (not MoR-load-bearing); `UNIQUE (guest_id, external_ref)` for idempotent upsert.
- **Ingestion service** (`lib/flights/sync.ts`) — upsert + stale-row cleanup + `flightsLastSyncedAt` bump, wrapped in `$transaction`. Adapter throw leaves timestamp unchanged.
- **Contextual offer resolver** (`lib/flights/contextual-offers.ts`) — pure function, two hardcoded rules: activities-deep-link when Fiji destination + ACTIVE upsell; insurance-stub always when a flight exists. No rules engine.
- **Dev-helper route** `/dev-test/ingest-jetseeker-for-seed-guest` — bypasses 60s lazy-sync for Playwright + demos.
- **Hub integration** — `FlightItineraryCard` between booking hero and add-ons; `ContextualOffersSection` after activities preview. Old "Flight add-ons · Coming soon" stub removed.
- **Playwright E2E** — flights.spec.ts asserts the full demo flow.
- **Docs** — new `flights.md`, appended `architecture.md`, appended `data-model.md`.

## Gotchas hit

TODO fill in during implementation — follow Sprint 1 + 2 convention.

## Open tech debt into Sprint 4

- `console.error` in `sync.ts` catch → `Sentry.captureException` (carried over from Sprint 2's same `actions.ts` item; bundle both as the Sentry follow-up)
- Hardcoded `SEED_GUEST_EMAIL` / `FAIL_TRIGGER_EMAIL` branches in `JetSeekerMockAdapter` → drop when real adapter lands
- `IATA_TO_CITY` static lookup → proper reference table or `iata-tz-map` package when destinations diversify
- Contextual offer rules engine → still hardcoded if-statements; promote when the third offer type competes for hub space
- Lazy-sync race conditions → acceptable for Sprint 3 (upsert handles it); Sprint-N moves to background sync
- `flightsLastSyncedAt` on Guest → row-level `syncedAt` on FlightBooking if finer-grained refresh is needed

## Demo script

1. Ensure sprint-3 branch merged to main, Vercel production deployed.
2. From homepage "Start demo →", sign in via magic link.
3. On `/hub`: booking hero (Namotu), flight card (SYD→NAN / NAN→SYD, Jul 14/21, Fiji Airways), activities preview, green "Your Namotu activities await" deep-link, "Travel protection · covers your 14 Jul flight to Nadi" stub.
4. Click deep-link → lands on `/hub/activities` (Sprint 2's existing 5-card grid).
