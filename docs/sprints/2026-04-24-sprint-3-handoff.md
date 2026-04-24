# Sprint 3 — Windows Handoff Checklist

**Date produced:** 2026-04-24 (Cowork sandbox session)
**For:** Pat to execute in PowerShell on his Windows machine
**Reference:** `docs/plans/2026-04-24-sprint-3-plan.md`, `docs/specs/2026-04-24-sprint-3-design.md`

All Sprint 3 source code has been authored into this repo (OneDrive-synced from the Cowork sandbox). Pre-req: **PR #3 (sprint-2-polish → main) is merged** — confirmed at session start; `origin/main` HEAD is `0cb4812 Merge pull request #3 from pat116/sprint-2-polish`. Sprint 3 will become **PR #4**.

---

## What shipped from sandbox

### Files created (18)

**Types + errors:**
- `packages/types/src/flights.ts` — `FlightItinerarySource` port + `FlightBookingRead` type
- `packages/types/src/flights.test.ts` — type-only assertions (2 tests)
- `apps/web/src/lib/errors/flights.ts` — `JetSeekerUnavailableError`

**Flight domain + adapter:**
- `apps/web/src/lib/flights/iata.ts` — `IATA_TO_CITY` + `cityFromIata`
- `apps/web/src/lib/flights/provider.ts` — DI module
- `apps/web/src/lib/flights/sync.ts` — `syncFlightsForGuest`
- `apps/web/src/lib/flights/sync.test.ts` — 4 TDD tests (mocked Prisma + provider)
- `apps/web/src/lib/flights/contextual-offers.ts` — `resolveContextualOffers`
- `apps/web/src/lib/flights/contextual-offers.test.ts` — 6 tests
- `apps/web/src/adapters/jetseeker-mock.ts` — `JetSeekerMockAdapter` (150ms mock latency; `pat@kovena.com` → SYD↔NAN)
- `apps/web/src/adapters/jetseeker-mock.test.ts` — 5 tests

**UI + route:**
- `apps/web/src/app/__test__/ingest-jetseeker-for-seed-guest/route.ts` — dev-helper route (guarded, 303 → `/hub`)
- `apps/web/src/components/hub/flight-itinerary-card.tsx` — navy card, "YOUR FLIGHT · Fiji Airways FJ"
- `apps/web/src/components/hub/contextual-offers-section.tsx` — renders activities deep-link + insurance stub

**Tests + migration:**
- `apps/web/tests/e2e/flights.spec.ts` — Playwright E2E (uses `/__test__/ingest-jetseeker-for-seed-guest` then `/__test__/sign-in-as-seed-guest`)
- `apps/web/prisma/migrations/20260424120000_sprint_3_flight_booking/migration.sql`

**Docs:**
- `docs/flights.md` — port contract, adapter behaviour, IATA extension guide, swap-in path
- `docs/sprints/sprint-3-changelog.md` — shipped list, open tech-debt into Sprint 4

### Files modified (6)

- `apps/web/prisma/schema.prisma` — new `FlightBooking` model + `Guest.flightsLastSyncedAt` + back-relation
- `apps/web/prisma/seed.ts` — Jane's flight booking appended (idempotent `deleteMany` → `create`)
- `apps/web/src/app/hub/page.tsx` — lazy-sync block (60s debounce), `<FlightItineraryCard />`, `<ContextualOffersSection />`; Sprint 2 "Flight add-ons · Coming soon" stub removed
- `packages/types/src/index.ts` — re-export `flights` module
- `docs/architecture.md` — new "Flights (Sprint 3+)" section with ports diagram + hot-path rule
- `docs/data-model.md` — `FlightBooking` entity + `Guest.flightsLastSyncedAt` column note

### Test totals on paper

- `packages/types` — 2 type tests
- `apps/web/src/adapters/jetseeker-mock.test.ts` — 5 tests
- `apps/web/src/lib/flights/sync.test.ts` — 4 tests
- `apps/web/src/lib/flights/contextual-offers.test.ts` — 6 tests

**17 new unit tests** across 4 files. First real typecheck + test run will be on your Windows machine (sandbox was proxy-blocked from Prisma binaries).

---

## Run these commands, in order

Assumes you're in the `koncie-web` repo root on Windows (PowerShell). **Kill any running `pnpm dev` process first** — Prisma generate on Windows will fail with EPERM if the Next dev server holds a lock on `query_engine-windows.dll.node`.

### 0. Sanity check — OneDrive has synced every file

```powershell
# Should show 'sprint_3_flight_booking' migration folder
Get-ChildItem apps\web\prisma\migrations

# Should list flights.ts in packages/types
Get-ChildItem packages\types\src | Select-String flights

# Should list the new flight files
Get-ChildItem apps\web\src\lib\flights
Get-ChildItem apps\web\src\adapters | Select-String jetseeker

# Hub page should now import syncFlightsForGuest
Select-String -Path apps\web\src\app\hub\page.tsx -Pattern "syncFlightsForGuest"
```

If any come up empty, OneDrive hasn't finished syncing — wait a minute, check the OneDrive tray icon, and retry.

### 1. Create sprint-3 branch + pull main

```powershell
git checkout main
git pull origin main
git checkout -b sprint-3
```

Expected: on branch `sprint-3` tracking `main`; `git status` shows a clean working tree at first (all Sprint 3 changes are there because you're on the branch that has them), OR modified/untracked files if main is fresh — either way, proceed to step 2.

### 2. Install deps

```powershell
pnpm install
```

No new deps were added in Sprint 3. Expected: "Already up to date" or a quick install if the lockfile needs a refresh.

### 3. Prisma generate + migrate dev

```powershell
pnpm --filter @koncie/web exec prisma generate
pnpm --filter @koncie/web exec prisma migrate dev
```

**Expected prompt:** Prisma will detect the new `FlightBooking` model and offer to apply `20260424120000_sprint_3_flight_booking`. Press Enter to apply.

**Possible second prompt:** If Prisma detects drift between the hand-written `migration.sql` and its default formatting, it will ask for a reconcile-migration name — answer `sprint_3_schema_reconcile` (same pattern as Sprint 2). Review the generated SQL before accepting.

### 4. Seed

```powershell
pnpm --filter @koncie/web db:seed
```

Expected output includes:
- `[seed] 5 Namotu upsells inserted` (Sprint 2, unchanged)
- `[seed] 1 flight booking inserted for Jane` (new line, Sprint 3)

### 5. Typecheck

```powershell
pnpm typecheck
```

Expected: all packages green. If `@prisma/client` types for `FlightBooking` are missing, rerun step 3 (`prisma generate` regenerates the client).

### 6. Unit tests

```powershell
pnpm --filter @koncie/web test
pnpm --filter @koncie/types test
```

Expected: 17+ new tests pass. Total project test count should jump from Sprint 2's ~35 to ~52.

### 7. Manual click-test

```powershell
pnpm --filter @koncie/web dev
```

Then in Chrome:

1. Visit `http://localhost:3000` — home page.
2. Click "Start demo" → signs in as the seed guest → `/hub`.
3. **Verify on `/hub`:**
   - Booking hero (Sprint 1): Namotu 14–21 July 2026
   - **Flight itinerary card (NEW):** `YOUR FLIGHT · Fiji Airways FJ`, outbound `SYD → NAN 14 Jul`, return `NAN → SYD 21 Jul`, footer "via Jet Seeker"
   - Your add-ons section (Sprint 2, if you've run checkout before) — empty otherwise
   - Plan-your-trip cards (Sprint 2)
   - **Activities deep-link card (NEW):** "Your Namotu activities await / Ready for when you land in Nadi" — click it, confirm `/hub/activities` loads
   - **Travel protection stub (UPDATED):** "Covers your 14 Jul flight to Nadi" (destination-contextual copy)
4. Refresh `/hub` — lazy-sync should NOT re-trigger (within 60s window). Check the server console: only one `[flights] sync` log line per 60s.
5. **Fail-path sanity:** edit the seed temporarily to `email: 'flight-unavailable@test.com'`, re-seed, revisit `/hub`. A soft-fail banner should render in the flight-card slot; no crash. Revert the seed when done.

### 8. Playwright E2E (optional locally; required in CI)

```powershell
pnpm --filter @koncie/web exec playwright test tests/e2e/flights.spec.ts
```

Expected: the spec runs; `flights` E2E is marked `continue-on-error` in CI per Sprint 2-polish posture, so even if it fails locally due to environment (e.g. no browser), the CI job won't block the PR.

### 9. Commit + push

```powershell
git add -A
git status   # review the diff one last time
git commit -m "feat(sprint-3): Jet Seeker itinerary ingestion + contextual offers"
git push -u origin sprint-3
```

Expected: push succeeds; Vercel preview deployment kicks off automatically.

### 10. Open PR #4

I'll drive this step in Claude in Chrome from the Cowork session — navigate to `https://github.com/pat116/koncie-web/compare/main...sprint-3?expand=1`, fill the title and body, you click **Create pull request** and then **Merge** once CI is green + Vercel preview looks right.

**Proposed PR title:** `feat(sprint-3): Jet Seeker itinerary ingestion + contextual offers`

---

## Verification checkpoints

Run these before opening the PR:

- [ ] `pnpm typecheck` green
- [ ] `pnpm --filter @koncie/web test` green (17+ new tests pass)
- [ ] Dev server shows flight card + activities deep-link + insurance stub on `/hub`
- [ ] Activities deep-link click lands on `/hub/activities`
- [ ] Second `/hub` visit within 60s does NOT re-trigger sync (Prisma log quiet)
- [ ] New migration applied cleanly; `Get-ChildItem apps\web\prisma\migrations` shows 4+ folders including `20260424120000_sprint_3_flight_booking`
- [ ] Supabase audit — see next section

## Post-merge Supabase audit

I'll drive this via Claude in Chrome after the PR merges. Checks:

```sql
-- Expect one row for the seed guest
SELECT id, external_ref, origin, destination, carrier, departure_at
  FROM flight_bookings
  WHERE guest_id = (SELECT id FROM guests WHERE email = 'pat@kovena.com');

-- Expect flights_last_synced_at to be set after first hub visit
SELECT email, flights_last_synced_at FROM guests WHERE email = 'pat@kovena.com';
```

---

## Gotchas to expect (carried from Sprints 1+2)

- **Prisma EPERM on Windows** — kill `pnpm dev` before running `prisma generate`
- **OneDrive truncation** — if any file looks short on disk, wait a minute for sync to settle (sandbox-side Linux mount can see stale views; Windows-side files are authoritative)
- **`noUncheckedIndexedAccess`** — if typecheck fails on an array `[0]` access, narrow with `if (!x) return` before use (Sprint 1 lesson)
- **Migration reconcile prompt** — Prisma will likely auto-generate a reconcile migration for index-naming cosmetic drift; name it `sprint_3_schema_reconcile`

## Known carry-overs (NOT blocking PR #4)

- Real Jet Seeker API adapter — swap happens in a later sprint
- Sentry in `sync.ts` catch block — plan uses `console.error` with TODO marker; live Sentry wiring is a 1-line follow-up
- FX rates API, Kovena hosted iframe, DB-in-CI for Playwright — Sprint 2 carry-overs, still deferred

---

## When to ping the Cowork session

- **Any step 1–9 fails:** paste the terminal output and I'll diagnose in-session
- **Schema drift / reconcile migration reviewed:** paste its contents, I'll confirm it's cosmetic-only before you commit
- **Once green through step 9:** ping "ready for PR" and I'll drive Claude in Chrome to open PR #4
