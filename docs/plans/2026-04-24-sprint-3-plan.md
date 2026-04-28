# Sprint 3 Implementation Plan — Jet Seeker itinerary ingestion + contextual offers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a reproducible demo where the seeded guest's `/hub` renders their Namotu booking AND their SYD↔NAN Jet Seeker flight itinerary, plus two contextual offers (an activities deep-link to Sprint 2's `/hub/activities`, and a Sprint-4-ready insurance stub with destination-contextual copy) — all backed by a swap-ready `FlightItinerarySource` port + `JetSeekerMockAdapter`, with results cached in Postgres via an ingestion service.

**Architecture:** Third ports-and-adapters pair (`FlightItinerarySource` + `JetSeekerMockAdapter`) following Sprint 2's pattern. Mock adapter returns hardcoded email-matched results; ingestion service (`syncFlightsForGuest`) persists to the new `FlightBooking` table keyed on `(guestId, externalRef)`. Hub reads from Postgres — no adapter call on the render hot-path once sync has run. Two sync trigger sites: lazy-sync on hub render (60s debounce via `Guest.flightsLastSyncedAt`) + dev-helper route for Playwright and manual demos.

**Tech Stack:** Sprint 1+2 stack unchanged (Next.js 14.2, React 18.3, TypeScript 5.7 strict, Prisma 5.22, Supabase, Vitest 2.x, Playwright 1.49, decimal.js, ulid, Zod). No new deps.

**Reference spec:** `docs/specs/2026-04-24-sprint-3-design.md`

---

## File Structure

### New files (by area)

**Domain types:**
- `packages/types/src/flights.ts` — `FlightItinerarySource` port + `FlightBookingRead` type
- `packages/types/src/flights.test.ts` — type-only assertions

**Errors:**
- `apps/web/src/lib/errors/flights.ts` — `JetSeekerUnavailableError`

**Mock adapter + DI:**
- `apps/web/src/adapters/jetseeker-mock.ts`
- `apps/web/src/adapters/jetseeker-mock.test.ts`
- `apps/web/src/lib/flights/provider.ts`

**Ingestion service:**
- `apps/web/src/lib/flights/sync.ts`
- `apps/web/src/lib/flights/sync.test.ts`

**Contextual offers:**
- `apps/web/src/lib/flights/iata.ts` — `IATA_TO_CITY` lookup
- `apps/web/src/lib/flights/contextual-offers.ts` — resolver
- `apps/web/src/lib/flights/contextual-offers.test.ts`

**Pages:**
- `apps/web/src/app/dev-test/ingest-jetseeker-for-seed-guest/route.ts`

**Components:**
- `apps/web/src/components/hub/flight-itinerary-card.tsx`
- `apps/web/src/components/hub/contextual-offers-section.tsx`

**Tests:**
- `apps/web/tests/e2e/flights.spec.ts`

**Migration:**
- `apps/web/prisma/migrations/20260424120000_sprint_3_flight_booking/migration.sql`

**Docs:**
- `docs/flights.md` (new)
- `docs/sprints/sprint-3-changelog.md` (new)

### Modified files

- `apps/web/prisma/schema.prisma` — add `FlightBooking` model, `Guest.flightsLastSyncedAt` column + back-relation
- `apps/web/prisma/seed.ts` — seed Jane's flight
- `apps/web/src/app/hub/page.tsx` — add lazy-sync + render flight card + render contextual offers
- `packages/types/src/index.ts` — re-export flights module
- `docs/architecture.md` — append FlightItinerarySource to ports diagram, describe ingestion-then-cache pattern
- `docs/data-model.md` — append FlightBooking entity + Guest column

---

## Task 1: Create sprint-3 branch + verify clean baseline

**Files:**
- (no source changes)

- [ ] **Step 1: From fresh `main` (post PR #3 merge)**

```powershell
git checkout main
git pull origin main
git checkout -b sprint-3
```

Expected: on branch `sprint-3` tracking `main`; working tree clean.

- [ ] **Step 2: Confirm Sprint 2 + polish state is present**

```powershell
ls apps\web\public\images\upsells | findstr svg
ls apps\web\src\app\__test__\sign-in-as-seed-guest
Select-String -Path apps\web\prisma\schema.prisma -Pattern "^model (Upsell|Transaction|TrustLedgerEntry|SavedCard)"
```

Expected: 5 SVGs listed; `route.ts` present; 4 model lines printed. If any missing, stop — Sprint 2 merge incomplete.

---

## Task 2: Define `FlightItinerarySource` port types

**Files:**
- Create: `packages/types/src/flights.ts`
- Create: `packages/types/src/flights.test.ts`
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Write the port**

Create `packages/types/src/flights.ts`:

```ts
/**
 * FlightItinerarySource port. Sprint 3 has one adapter (JetSeekerMockAdapter);
 * a later sprint swaps in a real Jet Seeker wrapper. Read-only: Koncie does
 * not book flights — flight booking lives inside Jet Seeker's OTA.
 *
 * See docs/flights.md for the port contract and swap-in guide.
 */

export interface FlightBookingRead {
  /** Jet Seeker PNR (e.g. "JS-ABC123"). Unique per guest. */
  externalRef: string;
  guestEmail: string;
  /** IATA airport code, 3 chars (e.g. "SYD") */
  origin: string;
  /** IATA airport code, 3 chars (e.g. "NAN") */
  destination: string;
  /** ISO-8601 with timezone */
  departureAt: string;
  /** ISO-8601 with timezone; null for one-way */
  returnAt: string | null;
  /** IATA airline code, 2 chars (e.g. "FJ") */
  carrier: string;
  /** Adapter-specific fields we don't yet model (passenger count, class, etc.) */
  metadata: Record<string, unknown>;
}

export interface FlightItinerarySource {
  fetchBookingsForGuest(email: string): Promise<FlightBookingRead[]>;
}
```

- [ ] **Step 2: Re-export from types index**

Modify `packages/types/src/index.ts` — add the re-export alongside the existing Sprint 1+2 exports:

```ts
export * from './partner-adapter.js';
export * from './transaction.js';
export * from './payments.js';
export * from './flights.js';
```

- [ ] **Step 3: Type-only test**

Create `packages/types/src/flights.test.ts`:

```ts
import { describe, it, expectTypeOf } from 'vitest';
import type { FlightBookingRead, FlightItinerarySource } from './flights';

describe('flights types', () => {
  it('FlightItinerarySource has exactly one method', () => {
    type Methods = keyof FlightItinerarySource;
    expectTypeOf<Methods>().toEqualTypeOf<'fetchBookingsForGuest'>();
  });

  it('FlightBookingRead.returnAt is nullable', () => {
    const oneWay: FlightBookingRead = {
      externalRef: 'JS-1',
      guestEmail: 'a@b.com',
      origin: 'SYD',
      destination: 'NAN',
      departureAt: '2026-07-14T08:00:00+10:00',
      returnAt: null,
      carrier: 'FJ',
      metadata: {},
    };
    expectTypeOf(oneWay.returnAt).toEqualTypeOf<string | null>();
  });
});
```

- [ ] **Step 4: Run typecheck + tests**

```powershell
pnpm --filter @koncie/types typecheck
pnpm --filter @koncie/types test
```

Expected: both green; 2 tests pass.

- [ ] **Step 5: Commit**

```powershell
git add packages/types/src/flights.ts packages/types/src/flights.test.ts packages/types/src/index.ts
git commit -m "feat(types): FlightItinerarySource port"
```

---

## Task 3: Payment-analog error class for flight infra failures

**Files:**
- Create: `apps/web/src/lib/errors/flights.ts`

- [ ] **Step 1: Write the error**

Create `apps/web/src/lib/errors/flights.ts`:

```ts
/**
 * Infra-broken error for the FlightItinerarySource adapter (Jet Seeker timeout,
 * 5xx, auth failure). Sentry-captured; guest sees a soft-fail banner in the
 * flight-card slot.
 *
 * Mirrors the Sprint 2 PaymentProviderUnavailableError pattern. Business
 * outcomes (empty itinerary for guest) are NOT errors — they return [].
 */
export class JetSeekerUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'JetSeekerUnavailableError';
  }
}
```

- [ ] **Step 2: Commit**

```powershell
git add apps/web/src/lib/errors/flights.ts
git commit -m "feat(errors): JetSeekerUnavailableError"
```

---

## Task 4: Prisma schema — add `FlightBooking` model

**Files:**
- Modify: `apps/web/prisma/schema.prisma`

- [ ] **Step 1: Append the model**

In `apps/web/prisma/schema.prisma`, append below existing models:

```prisma
model FlightBooking {
  id             String    @id @default(uuid()) @db.Uuid
  guestId        String    @map("guest_id") @db.Uuid
  guest          Guest     @relation(fields: [guestId], references: [id])
  externalRef    String    @map("external_ref")
  origin         String    @db.Char(3)
  destination    String    @db.Char(3)
  departureAt    DateTime  @map("departure_at") @db.Timestamptz
  returnAt       DateTime? @map("return_at") @db.Timestamptz
  carrier        String    @db.Char(2)
  metadata       Json      @default("{}")
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt      DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  @@unique([guestId, externalRef])
  @@index([guestId, departureAt])
  @@map("flight_bookings")
}
```

- [ ] **Step 2: Add back-relation + column on `Guest`**

Inside the existing `Guest` model braces, add:

```prisma
  flightBookings      FlightBooking[]
  flightsLastSyncedAt DateTime?       @map("flights_last_synced_at") @db.Timestamptz
```

- [ ] **Step 3: Commit schema-only**

```powershell
git add apps/web/prisma/schema.prisma
git commit -m "feat(schema): add FlightBooking model + Guest.flightsLastSyncedAt"
```

---

## Task 5: Generate + apply Prisma migration

**Files:**
- Create: `apps/web/prisma/migrations/<timestamp>_sprint_3_flight_booking/migration.sql`

- [ ] **Step 1: Generate migration**

```powershell
pnpm --filter @koncie/web exec prisma migrate dev --name sprint_3_flight_booking
```

Expected: new migration folder under `apps/web/prisma/migrations/`; Prisma applies it; Prisma Client regenerates.

If Prisma prompts "Enter a name for the new migration" (drift-reconcile), name it `sprint_3_schema_reconcile` and accept — cosmetic index renames only, same pattern as Sprint 2.

- [ ] **Step 2: Verify in Supabase**

In Supabase SQL editor:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'flight_bookings'
ORDER BY ordinal_position;
```

Expected: 11 columns (id, guest_id, external_ref, origin, destination, departure_at, return_at, carrier, metadata, created_at, updated_at).

```sql
SELECT indexname FROM pg_indexes WHERE tablename = 'flight_bookings';
```

Expected: unique index on `(guest_id, external_ref)` + non-unique on `(guest_id, departure_at)`.

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'guests' AND column_name = 'flights_last_synced_at';
```

Expected: 1 row returned.

- [ ] **Step 3: Commit**

```powershell
git add apps/web/prisma/migrations/
git commit -m "feat(schema): apply sprint-3 flight booking migration"
```

---

## Task 6: IATA_TO_CITY lookup module

**Files:**
- Create: `apps/web/src/lib/flights/iata.ts`

- [ ] **Step 1: Write the lookup**

Create `apps/web/src/lib/flights/iata.ts`:

```ts
/**
 * Minimal IATA airport code → city label lookup. Used by the contextual-offer
 * resolver to produce destination-aware copy ("covers your flight to Nadi").
 *
 * Keep this list short and pilot-scoped. Extending requires product input on
 * which cities we're willing to surface in offer copy. Sprint-N either
 * replaces this with a proper reference table or imports from a maintained
 * package (e.g. iata-tz-map).
 */
export const IATA_TO_CITY: Record<string, string> = {
  NAN: 'Nadi',
  SUV: 'Suva',
  SYD: 'Sydney',
};

export function cityFromIata(code: string): string | undefined {
  return IATA_TO_CITY[code];
}
```

- [ ] **Step 2: Commit**

```powershell
git add apps/web/src/lib/flights/iata.ts
git commit -m "feat(flights): IATA_TO_CITY lookup"
```

---

## Task 7: `JetSeekerMockAdapter` — fetchBookingsForGuest (TDD)

**Files:**
- Create: `apps/web/src/adapters/jetseeker-mock.test.ts`
- Create: `apps/web/src/adapters/jetseeker-mock.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/adapters/jetseeker-mock.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { JetSeekerMockAdapter } from './jetseeker-mock';
import { JetSeekerUnavailableError } from '@/lib/errors/flights';

const adapter = new JetSeekerMockAdapter();

describe('JetSeekerMockAdapter.fetchBookingsForGuest', () => {
  it('returns Namotu round-trip for the seeded guest email', async () => {
    const result = await adapter.fetchBookingsForGuest('pat@kovena.com');
    expect(result).toHaveLength(1);
    const booking = result[0]!;
    expect(booking.externalRef).toBe('JS-JANE-NAMOTU-01');
    expect(booking.origin).toBe('SYD');
    expect(booking.destination).toBe('NAN');
    expect(booking.carrier).toBe('FJ');
    expect(new Date(booking.departureAt).toString()).not.toBe('Invalid Date');
    expect(booking.returnAt).not.toBeNull();
  });

  it('returns an empty array for any unknown email', async () => {
    expect(await adapter.fetchBookingsForGuest('nobody@example.com')).toEqual([]);
  });

  it('throws JetSeekerUnavailableError for the fail-trigger email', async () => {
    await expect(
      adapter.fetchBookingsForGuest('flight-unavailable@test.com'),
    ).rejects.toThrow(JetSeekerUnavailableError);
  });

  it('returns valid ISO-8601 timestamps for departureAt and returnAt', async () => {
    const [booking] = await adapter.fetchBookingsForGuest('pat@kovena.com');
    expect(booking!.departureAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(booking!.returnAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('returns exactly 2-char carrier code and 3-char airport codes', async () => {
    const [booking] = await adapter.fetchBookingsForGuest('pat@kovena.com');
    expect(booking!.carrier).toHaveLength(2);
    expect(booking!.origin).toHaveLength(3);
    expect(booking!.destination).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
cd apps/web
./node_modules/.bin/vitest run src/adapters/jetseeker-mock.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the adapter**

Create `apps/web/src/adapters/jetseeker-mock.ts`:

```ts
import type { FlightBookingRead, FlightItinerarySource } from '@koncie/types';
import { JetSeekerUnavailableError } from '@/lib/errors/flights';

const NETWORK_DELAY_MS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SEED_GUEST_EMAIL = 'pat@kovena.com';
const FAIL_TRIGGER_EMAIL = 'flight-unavailable@test.com';

const SEEDED_BOOKING: FlightBookingRead = {
  externalRef: 'JS-JANE-NAMOTU-01',
  guestEmail: SEED_GUEST_EMAIL,
  origin: 'SYD',
  destination: 'NAN',
  departureAt: '2026-07-14T08:00:00+10:00',
  returnAt: '2026-07-21T14:30:00+12:00',
  carrier: 'FJ',
  metadata: { adults: 2, class: 'economy' },
};

/**
 * Mock adapter for Jet Seeker. Returns hardcoded email-matched results.
 *
 * MOCK-ONLY BEHAVIOURS (NOT the contract — see packages/types/src/flights.ts):
 * - Hardcoded email matching (real adapter queries Jet Seeker's database)
 * - 150ms fixed delay (real adapter varies with network)
 * - Fail-trigger email — real adapter fails by HTTP timeout or 5xx
 */
export class JetSeekerMockAdapter implements FlightItinerarySource {
  async fetchBookingsForGuest(email: string): Promise<FlightBookingRead[]> {
    await sleep(NETWORK_DELAY_MS);

    if (email === FAIL_TRIGGER_EMAIL) {
      throw new JetSeekerUnavailableError(
        'Jet Seeker sandbox simulated outage (mock fail-trigger email)',
      );
    }

    if (email === SEED_GUEST_EMAIL) {
      return [SEEDED_BOOKING];
    }

    return [];
  }
}
```

- [ ] **Step 4: Run tests — confirm pass**

```powershell
cd apps/web
./node_modules/.bin/vitest run src/adapters/jetseeker-mock.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/adapters/jetseeker-mock.ts apps/web/src/adapters/jetseeker-mock.test.ts
git commit -m "feat(adapter): JetSeekerMockAdapter"
```

---

## Task 8: `FlightItinerarySource` DI module

**Files:**
- Create: `apps/web/src/lib/flights/provider.ts`

- [ ] **Step 1: Create the DI module**

Create `apps/web/src/lib/flights/provider.ts`:

```ts
import type { FlightItinerarySource } from '@koncie/types';
import { JetSeekerMockAdapter } from '@/adapters/jetseeker-mock';

/**
 * Single source of truth for the flight itinerary source. Every ingestion
 * call and server component imports `flightItinerarySource` from here — never
 * the adapter module directly. A later sprint swaps in a real Jet Seeker
 * wrapper by changing the imports below.
 */
export const flightItinerarySource: FlightItinerarySource = new JetSeekerMockAdapter();
```

- [ ] **Step 2: Commit**

```powershell
git add apps/web/src/lib/flights/provider.ts
git commit -m "feat(flights): DI module for FlightItinerarySource"
```

---

## Task 9: Ingestion service — happy-path create (TDD)

**Files:**
- Create: `apps/web/src/lib/flights/sync.test.ts`
- Create: `apps/web/src/lib/flights/sync.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/flights/sync.test.ts`:

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
// Mocking Prisma's generated types loose in tests — same policy as
// apps/web/src/app/hub/checkout/actions.test.ts from Sprint 2 polish.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/flights/provider', () => ({ flightItinerarySource: {} }));

import { syncFlightsForGuest } from './sync';
import { prisma } from '@/lib/db/prisma';
import { flightItinerarySource } from './provider';

describe('syncFlightsForGuest happy path', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates FlightBooking rows from adapter results and updates Guest.flightsLastSyncedAt', async () => {
    (prisma as any).guest = {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: 'g1',
        email: 'pat@kovena.com',
        flightsLastSyncedAt: null,
      }),
      update: vi.fn().mockResolvedValue({}),
    };
    (prisma as any).flightBooking = {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    };
    (prisma as any).$transaction = vi
      .fn()
      .mockImplementation(async (cb: (tx: any) => Promise<any>) => cb(prisma));

    (flightItinerarySource as any).fetchBookingsForGuest = vi.fn().mockResolvedValue([
      {
        externalRef: 'JS-JANE-NAMOTU-01',
        guestEmail: 'pat@kovena.com',
        origin: 'SYD',
        destination: 'NAN',
        departureAt: '2026-07-14T08:00:00+10:00',
        returnAt: '2026-07-21T14:30:00+12:00',
        carrier: 'FJ',
        metadata: { adults: 2 },
      },
    ]);

    await syncFlightsForGuest('g1');

    expect((prisma as any).flightBooking.upsert).toHaveBeenCalledTimes(1);
    const upsertArg = (prisma as any).flightBooking.upsert.mock.calls[0][0];
    expect(upsertArg.where).toEqual({
      guestId_externalRef: { guestId: 'g1', externalRef: 'JS-JANE-NAMOTU-01' },
    });
    expect(upsertArg.create.origin).toBe('SYD');
    expect(upsertArg.create.destination).toBe('NAN');

    expect((prisma as any).guest.update).toHaveBeenCalledWith({
      where: { id: 'g1' },
      data: { flightsLastSyncedAt: expect.any(Date) },
    });
  });
});
```

- [ ] **Step 2: Run test — expect fail**

```powershell
cd apps/web
./node_modules/.bin/vitest run src/lib/flights/sync.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement sync service**

Create `apps/web/src/lib/flights/sync.ts`:

```ts
import { prisma } from '@/lib/db/prisma';
import { flightItinerarySource } from './provider';
import { JetSeekerUnavailableError } from '@/lib/errors/flights';

/**
 * Syncs a guest's flight itinerary from the FlightItinerarySource into
 * Koncie's FlightBooking table.
 *
 * - Upserts by (guestId, externalRef) so repeated calls are idempotent.
 * - Deletes stale rows whose externalRef isn't in the latest result set
 *   (handles future flight cancellations).
 * - Updates Guest.flightsLastSyncedAt ONLY on success — if the adapter
 *   throws, the timestamp is left unchanged so the next call retries.
 * - Wraps all DB writes in a $transaction for atomicity.
 */
export async function syncFlightsForGuest(guestId: string): Promise<void> {
  const guest = await prisma.guest.findUniqueOrThrow({ where: { id: guestId } });

  let incoming;
  try {
    incoming = await flightItinerarySource.fetchBookingsForGuest(guest.email);
  } catch (err) {
    // TODO(sprint-N): replace with Sentry.captureException(err, { extra: { guestId } })
    console.error('[flights/sync] adapter failure', { guestId, error: err });
    if (err instanceof JetSeekerUnavailableError) throw err;
    throw new JetSeekerUnavailableError('Unexpected adapter failure', err);
  }

  await prisma.$transaction(async (tx) => {
    for (const b of incoming) {
      await tx.flightBooking.upsert({
        where: {
          guestId_externalRef: { guestId, externalRef: b.externalRef },
        },
        create: {
          guestId,
          externalRef: b.externalRef,
          origin: b.origin,
          destination: b.destination,
          departureAt: new Date(b.departureAt),
          returnAt: b.returnAt ? new Date(b.returnAt) : null,
          carrier: b.carrier,
          metadata: b.metadata as object,
        },
        update: {
          origin: b.origin,
          destination: b.destination,
          departureAt: new Date(b.departureAt),
          returnAt: b.returnAt ? new Date(b.returnAt) : null,
          carrier: b.carrier,
          metadata: b.metadata as object,
        },
      });
    }

    // Delete rows the adapter no longer returns (cancellation handling)
    const keepRefs = incoming.map((b) => b.externalRef);
    await tx.flightBooking.deleteMany({
      where: {
        guestId,
        ...(keepRefs.length > 0 ? { externalRef: { notIn: keepRefs } } : {}),
      },
    });

    await tx.guest.update({
      where: { id: guestId },
      data: { flightsLastSyncedAt: new Date() },
    });
  });
}
```

- [ ] **Step 4: Run tests — expect pass**

```powershell
cd apps/web
./node_modules/.bin/vitest run src/lib/flights/sync.test.ts
```

Expected: 1 passed.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/lib/flights/sync.ts apps/web/src/lib/flights/sync.test.ts
git commit -m "feat(flights): syncFlightsForGuest happy path"
```

---

## Task 10: Ingestion service — idempotency + stale-row deletion (TDD)

**Files:**
- Modify: `apps/web/src/lib/flights/sync.test.ts`

- [ ] **Step 1: Append tests**

Append to `apps/web/src/lib/flights/sync.test.ts`:

```ts
describe('syncFlightsForGuest idempotency + stale cleanup', () => {
  beforeEach(() => vi.clearAllMocks());

  it('second sync with identical data is idempotent (upsert called, no duplicate create)', async () => {
    (prisma as any).guest = {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'g1', email: 'pat@kovena.com' }),
      update: vi.fn(),
    };
    (prisma as any).flightBooking = { upsert: vi.fn(), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) };
    (prisma as any).$transaction = vi.fn().mockImplementation(async (cb: any) => cb(prisma));
    (flightItinerarySource as any).fetchBookingsForGuest = vi.fn().mockResolvedValue([
      {
        externalRef: 'JS-1',
        guestEmail: 'pat@kovena.com',
        origin: 'SYD',
        destination: 'NAN',
        departureAt: '2026-07-14T08:00:00+10:00',
        returnAt: null,
        carrier: 'FJ',
        metadata: {},
      },
    ]);

    await syncFlightsForGuest('g1');
    await syncFlightsForGuest('g1');

    // Upsert called twice — once per sync — with the same where clause.
    expect((prisma as any).flightBooking.upsert).toHaveBeenCalledTimes(2);
    const [[firstArg], [secondArg]] = (prisma as any).flightBooking.upsert.mock.calls;
    expect(firstArg.where).toEqual(secondArg.where);
  });

  it('deletes rows whose externalRef is not in the latest result set', async () => {
    (prisma as any).guest = {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'g1', email: 'pat@kovena.com' }),
      update: vi.fn(),
    };
    (prisma as any).flightBooking = { upsert: vi.fn(), deleteMany: vi.fn().mockResolvedValue({ count: 1 }) };
    (prisma as any).$transaction = vi.fn().mockImplementation(async (cb: any) => cb(prisma));
    (flightItinerarySource as any).fetchBookingsForGuest = vi.fn().mockResolvedValue([
      {
        externalRef: 'JS-STILL-HERE',
        guestEmail: 'pat@kovena.com',
        origin: 'SYD',
        destination: 'NAN',
        departureAt: '2026-07-14T08:00:00+10:00',
        returnAt: null,
        carrier: 'FJ',
        metadata: {},
      },
    ]);

    await syncFlightsForGuest('g1');

    expect((prisma as any).flightBooking.deleteMany).toHaveBeenCalledWith({
      where: {
        guestId: 'g1',
        externalRef: { notIn: ['JS-STILL-HERE'] },
      },
    });
  });
});
```

- [ ] **Step 2: Run + commit**

```powershell
cd apps/web
./node_modules/.bin/vitest run src/lib/flights/sync.test.ts
git add apps/web/src/lib/flights/sync.test.ts
git commit -m "test(flights): lock idempotency + stale-row cleanup"
```

Expected: 3 passed (happy path + 2 new).

---

## Task 11: Ingestion service — adapter failure path (TDD)

**Files:**
- Modify: `apps/web/src/lib/flights/sync.test.ts`

- [ ] **Step 1: Append test**

Append to `apps/web/src/lib/flights/sync.test.ts`:

```ts
import { JetSeekerUnavailableError } from '@/lib/errors/flights';

describe('syncFlightsForGuest failure path', () => {
  beforeEach(() => vi.clearAllMocks());

  it('re-throws JetSeekerUnavailableError and does NOT update flightsLastSyncedAt', async () => {
    (prisma as any).guest = {
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValue({ id: 'g1', email: 'flight-unavailable@test.com', flightsLastSyncedAt: null }),
      update: vi.fn(),
    };
    (prisma as any).flightBooking = { upsert: vi.fn(), deleteMany: vi.fn() };
    (prisma as any).$transaction = vi.fn();
    (flightItinerarySource as any).fetchBookingsForGuest = vi
      .fn()
      .mockRejectedValue(new JetSeekerUnavailableError('mock outage'));

    await expect(syncFlightsForGuest('g1')).rejects.toThrow(JetSeekerUnavailableError);

    expect((prisma as any).$transaction).not.toHaveBeenCalled();
    expect((prisma as any).guest.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run + commit**

```powershell
cd apps/web
./node_modules/.bin/vitest run src/lib/flights/sync.test.ts
git add apps/web/src/lib/flights/sync.test.ts
git commit -m "test(flights): lock adapter-failure path"
```

Expected: 4 passed.

---

## Task 12: Contextual offer resolver (TDD)

**Files:**
- Create: `apps/web/src/lib/flights/contextual-offers.test.ts`
- Create: `apps/web/src/lib/flights/contextual-offers.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/lib/flights/contextual-offers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveContextualOffers } from './contextual-offers';

const flight = {
  destination: 'NAN',
  departureAt: new Date('2026-07-14T08:00:00+10:00'),
};

const activeUpsell = { status: 'ACTIVE' as const };
const inactiveUpsell = { status: 'INACTIVE' as const };

describe('resolveContextualOffers', () => {
  it('emits activities-deep-link when destination is NAN AND an ACTIVE Namotu upsell exists', () => {
    const offers = resolveContextualOffers({ flight, upsells: [activeUpsell] });
    const deepLink = offers.find((o) => o.type === 'activities-deep-link');
    expect(deepLink).toBeTruthy();
    expect(deepLink!.href).toBe('/hub/activities');
  });

  it('does NOT emit activities-deep-link when destination is outside [NAN, SUV]', () => {
    const offers = resolveContextualOffers({
      flight: { ...flight, destination: 'BNE' },
      upsells: [activeUpsell],
    });
    expect(offers.find((o) => o.type === 'activities-deep-link')).toBeUndefined();
  });

  it('does NOT emit activities-deep-link when upsells are all INACTIVE even if destination matches', () => {
    const offers = resolveContextualOffers({ flight, upsells: [inactiveUpsell] });
    expect(offers.find((o) => o.type === 'activities-deep-link')).toBeUndefined();
  });

  it('emits insurance-stub whenever a flight exists', () => {
    const offers = resolveContextualOffers({ flight, upsells: [] });
    const stub = offers.find((o) => o.type === 'insurance-stub');
    expect(stub).toBeTruthy();
    expect(stub!.destinationLabel).toBe('Nadi');
    expect(stub!.departureDateLabel).toBe('14 Jul');
  });

  it('falls back to raw IATA code when destination is not in IATA_TO_CITY', () => {
    const offers = resolveContextualOffers({
      flight: { ...flight, destination: 'LAX' },
      upsells: [],
    });
    const stub = offers.find((o) => o.type === 'insurance-stub');
    expect(stub!.destinationLabel).toBe('LAX');
  });

  it('emits no offers when flight is null', () => {
    const offers = resolveContextualOffers({ flight: null, upsells: [activeUpsell] });
    expect(offers).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests — expect fail**

```powershell
cd apps/web
./node_modules/.bin/vitest run src/lib/flights/contextual-offers.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the resolver**

Create `apps/web/src/lib/flights/contextual-offers.ts`:

```ts
import { IATA_TO_CITY } from './iata';

export interface OfferFlightInput {
  destination: string;
  departureAt: Date;
}

export interface OfferUpsellInput {
  status: 'ACTIVE' | 'INACTIVE';
}

export type ContextualOffer =
  | { type: 'activities-deep-link'; href: string; title: string; subtitle: string }
  | {
      type: 'insurance-stub';
      destinationLabel: string;
      departureDateLabel: string;
    };

export interface ResolveInput {
  flight: OfferFlightInput | null;
  upsells: OfferUpsellInput[];
}

const FIJI_AIRPORTS = new Set(['NAN', 'SUV']);

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function formatDayMonth(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function resolveContextualOffers({ flight, upsells }: ResolveInput): ContextualOffer[] {
  if (!flight) return [];

  const offers: ContextualOffer[] = [];

  // activities-deep-link: Fiji destination AND ACTIVE upsell exists
  if (FIJI_AIRPORTS.has(flight.destination) && upsells.some((u) => u.status === 'ACTIVE')) {
    offers.push({
      type: 'activities-deep-link',
      href: '/hub/activities',
      title: 'Your Namotu activities await',
      subtitle: 'Ready for when you land in Nadi',
    });
  }

  // insurance-stub: always when a flight exists
  offers.push({
    type: 'insurance-stub',
    destinationLabel: IATA_TO_CITY[flight.destination] ?? flight.destination,
    departureDateLabel: formatDayMonth(flight.departureAt),
  });

  return offers;
}
```

- [ ] **Step 4: Run tests — confirm pass**

```powershell
cd apps/web
./node_modules/.bin/vitest run src/lib/flights/contextual-offers.test.ts
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/lib/flights/contextual-offers.ts apps/web/src/lib/flights/contextual-offers.test.ts
git commit -m "feat(flights): resolveContextualOffers with hardcoded rules"
```

---

## Task 13: Dev-helper route `/dev-test/ingest-jetseeker-for-seed-guest`

**Files:**
- Create: `apps/web/src/app/dev-test/ingest-jetseeker-for-seed-guest/route.ts`

- [ ] **Step 1: Write the route**

Create `apps/web/src/app/dev-test/ingest-jetseeker-for-seed-guest/route.ts`:

```ts
/**
 * Dev + CI-only helper: triggers syncFlightsForGuest for the seeded guest and
 * redirects to /hub. Playwright + manual demos use this to bypass the 60-second
 * lazy-sync debounce. Guard matches Sprint 2-polish's sign-in-as-seed-guest
 * route.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { syncFlightsForGuest } from '@/lib/flights/sync';

export const dynamic = 'force-dynamic';

function isAllowed(): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  return process.env.KONCIE_ENABLE_TEST_ROUTES === '1';
}

export async function GET(request: NextRequest) {
  if (!isAllowed()) {
    return new NextResponse('Not found', { status: 404 });
  }

  const seedEmail = process.env.KONCIE_SEED_EMAIL;
  if (!seedEmail) {
    return new NextResponse('KONCIE_SEED_EMAIL not set', { status: 500 });
  }

  const guest = await prisma.guest.findUnique({ where: { email: seedEmail } });
  if (!guest) {
    return new NextResponse(`Seed guest ${seedEmail} not found — run pnpm db:seed first`, {
      status: 404,
    });
  }

  try {
    await syncFlightsForGuest(guest.id);
  } catch (err) {
    return new NextResponse(`Sync failed: ${(err as Error).message}`, { status: 502 });
  }

  const origin = new URL(request.url).origin;
  return NextResponse.redirect(`${origin}/hub`, { status: 303 });
}
```

- [ ] **Step 2: Commit**

```powershell
git add apps/web/src/app/dev-test/ingest-jetseeker-for-seed-guest/route.ts
git commit -m "feat(test-helpers): ingest-jetseeker-for-seed-guest dev route"
```

---

## Task 14: `FlightItineraryCard` component

**Files:**
- Create: `apps/web/src/components/hub/flight-itinerary-card.tsx`

- [ ] **Step 1: Write the component**

Create `apps/web/src/components/hub/flight-itinerary-card.tsx`:

```tsx
interface FlightItineraryCardProps {
  origin: string;
  destination: string;
  departureAt: Date;
  returnAt: Date | null;
  carrier: string;
  /** Set false to hide the green "NEW" pill after the pilot rollout. */
  showNewPill?: boolean;
}

function formatShort(d: Date): string {
  const day = d.getUTCDate();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const hh = d.getUTCHours().toString().padStart(2, '0');
  const mm = d.getUTCMinutes().toString().padStart(2, '0');
  return `${day} ${months[d.getUTCMonth()]} · ${hh}:${mm}`;
}

export function FlightItineraryCard({
  origin,
  destination,
  departureAt,
  returnAt,
  carrier,
  showNewPill = true,
}: FlightItineraryCardProps) {
  return (
    <section className="mt-2 rounded-2xl bg-koncie-navy px-5 py-4 text-koncie-sand">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-koncie-green">
        Your flight
        {showNewPill && (
          <span className="ml-2 inline-block rounded-full bg-koncie-green px-2 py-0.5 text-[9px] font-semibold text-koncie-navy">
            NEW
          </span>
        )}
      </p>
      <div className="mt-2 flex items-center justify-between text-sm">
        <span className="font-semibold">{origin} → {destination}</span>
        <span className="text-koncie-sand/70 text-xs">{formatShort(departureAt)}</span>
      </div>
      {returnAt && (
        <div className="mt-1 flex items-center justify-between text-sm">
          <span className="font-semibold">{destination} → {origin}</span>
          <span className="text-koncie-sand/70 text-xs">{formatShort(returnAt)}</span>
        </div>
      )}
      <p className="mt-3 text-[11px] text-koncie-sand/60">
        Carrier {carrier} · via Jet Seeker
      </p>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
git add apps/web/src/components/hub/flight-itinerary-card.tsx
git commit -m "feat(hub): FlightItineraryCard component"
```

---

## Task 15: `ContextualOffersSection` component

**Files:**
- Create: `apps/web/src/components/hub/contextual-offers-section.tsx`

- [ ] **Step 1: Write the component**

Create `apps/web/src/components/hub/contextual-offers-section.tsx`:

```tsx
import Link from 'next/link';
import type { ContextualOffer } from '@/lib/flights/contextual-offers';

interface ContextualOffersSectionProps {
  offers: ContextualOffer[];
}

export function ContextualOffersSection({ offers }: ContextualOffersSectionProps) {
  if (offers.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      {offers.map((offer, i) => {
        if (offer.type === 'activities-deep-link') {
          return (
            <Link
              key={i}
              href={offer.href}
              className="block rounded-xl bg-koncie-green px-4 py-3 text-sm text-koncie-navy"
            >
              <p className="font-semibold">{offer.title}</p>
              <p className="text-[11px] opacity-80">{offer.subtitle}</p>
            </Link>
          );
        }
        // insurance-stub
        return (
          <div
            key={i}
            className="rounded-xl border border-koncie-border bg-white px-4 py-3 text-sm"
          >
            <p className="font-semibold text-koncie-navy">Travel protection · Coming soon</p>
            <p className="text-[11px] text-koncie-charcoal/70">
              Covers your {offer.departureDateLabel} flight to {offer.destinationLabel}
            </p>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
git add apps/web/src/components/hub/contextual-offers-section.tsx
git commit -m "feat(hub): ContextualOffersSection component"
```

---

## Task 16: Hub page — integrate flight render + lazy-sync + offers

**Files:**
- Modify: `apps/web/src/app/hub/page.tsx`

- [ ] **Step 1: Add imports + lazy-sync block + renders**

Replace `apps/web/src/app/hub/page.tsx` with the full integrated version. The existing Sprint 2 structure is preserved (booking hero, your add-ons, plan your trip); Sprint 3 inserts the flight card after the booking hero and the offers section after the activities preview. The hub removes the old "Flight add-ons · Coming soon" stub and repurposes the "Travel protection" stub by rendering it via ContextualOffersSection with destination-contextual copy.

```tsx
import { prisma } from '@/lib/db/prisma';
import { requireSignedInGuest } from '@/lib/auth/session';
import { syncFlightsForGuest } from '@/lib/flights/sync';
import { resolveContextualOffers } from '@/lib/flights/contextual-offers';
import { JetSeekerUnavailableError } from '@/lib/errors/flights';
import { BookingHero } from '@/components/hub/booking-hero';
import { AddonsSection } from '@/components/hub/addons-section';
import { ActivityCard } from '@/components/activities/activity-card';
import { FlightItineraryCard } from '@/components/hub/flight-itinerary-card';
import { ContextualOffersSection } from '@/components/hub/contextual-offers-section';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const LAZY_SYNC_WINDOW_MS = 60_000;

export default async function HubPage() {
  const { guest, booking } = await requireSignedInGuest();

  // Lazy-sync: if we've never synced OR last sync > 60s ago AND no flights cached,
  // fetch from Jet Seeker. Soft-fail: adapter errors render a banner but don't block.
  let syncFailed = false;
  const existingFlightCount = await prisma.flightBooking.count({ where: { guestId: guest.id } });
  const staleWindowPassed =
    guest.flightsLastSyncedAt == null ||
    Date.now() - guest.flightsLastSyncedAt.getTime() > LAZY_SYNC_WINDOW_MS;
  if (existingFlightCount === 0 && staleWindowPassed) {
    try {
      await syncFlightsForGuest(guest.id);
    } catch (err) {
      if (err instanceof JetSeekerUnavailableError) {
        syncFailed = true;
      } else {
        throw err;
      }
    }
  }

  const [upsells, transactions, flights] = await Promise.all([
    prisma.upsell.findMany({
      where: { propertyId: booking.propertyId, status: 'ACTIVE' },
      orderBy: { priceMinor: 'asc' },
      take: 2,
    }),
    prisma.transaction.findMany({
      where: { guestId: guest.id, status: 'captured' },
      include: { upsell: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.flightBooking.findMany({
      where: { guestId: guest.id },
      orderBy: { departureAt: 'asc' },
    }),
  ]);

  const firstFlight = flights[0] ?? null;

  // For offer resolution we need the destination + an indication that ACTIVE
  // upsells exist at the property. Query those separately (not filtered to 2).
  const activeUpsellsAny = await prisma.upsell.findMany({
    where: { propertyId: booking.propertyId, status: 'ACTIVE' },
    select: { status: true },
    take: 1,
  });

  const offers = resolveContextualOffers({
    flight: firstFlight
      ? { destination: firstFlight.destination, departureAt: firstFlight.departureAt }
      : null,
    upsells: activeUpsellsAny.map((u) => ({ status: u.status })),
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <BookingHero booking={booking} />

      {firstFlight ? (
        <FlightItineraryCard
          origin={firstFlight.origin}
          destination={firstFlight.destination}
          departureAt={firstFlight.departureAt}
          returnAt={firstFlight.returnAt}
          carrier={firstFlight.carrier}
        />
      ) : syncFailed ? (
        <section className="mt-2 rounded-2xl border border-koncie-border bg-koncie-sand px-5 py-4 text-sm text-koncie-charcoal">
          We couldn&apos;t reach your flight details right now. Try refreshing in a minute.
        </section>
      ) : null}

      <AddonsSection
        rows={transactions.map((t) => ({
          id: t.id,
          name: t.upsell.name,
          createdAt: t.createdAt,
          amountMinor: t.amountMinor,
          currency: t.currency,
          guestDisplayAmountMinor: t.guestDisplayAmountMinor,
          guestDisplayCurrency: t.guestDisplayCurrency,
        }))}
      />

      <section className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-koncie-navy">Plan your trip</h2>
          <Link href="/hub/activities" className="text-xs text-koncie-navy underline">
            Browse all →
          </Link>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {upsells.map((u) => (
            <ActivityCard
              key={u.id}
              id={u.id}
              name={u.name}
              description={u.description}
              priceMinor={u.priceMinor}
              priceCurrency={u.priceCurrency}
              imageUrl={u.imageUrl}
            />
          ))}
        </div>
      </section>

      <ContextualOffersSection offers={offers} />
    </main>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```powershell
pnpm typecheck
```

Expected: green across all 3 packages. If errors mention `BookingHero` props, keep existing shape — the Sprint 2-polish subagent adapted the call to flat props. Match whatever's there.

- [ ] **Step 3: Commit**

```powershell
git add apps/web/src/app/hub/page.tsx
git commit -m "feat(hub): integrate flight itinerary + lazy-sync + contextual offers"
```

---

## Task 17: Seed Jane's flight

**Files:**
- Modify: `apps/web/prisma/seed.ts`

- [ ] **Step 1: Add flight-seed block**

In `apps/web/prisma/seed.ts`, after the existing upsell seed block and before the final `console.log`, add:

```ts
  // Sprint 3 — Jane's flight itinerary (Sydney → Nadi for Namotu stay)
  await prisma.flightBooking.deleteMany({ where: { guestId: guest.id } });
  await prisma.flightBooking.create({
    data: {
      guestId: guest.id,
      externalRef: 'JS-JANE-NAMOTU-01',
      origin: 'SYD',
      destination: 'NAN',
      departureAt: new Date('2026-07-14T08:00:00+10:00'),
      returnAt: new Date('2026-07-21T14:30:00+12:00'),
      carrier: 'FJ',
      metadata: { adults: 2, class: 'economy' },
    },
  });
  console.log('[seed] Jane\'s SYD↔NAN flight inserted');
```

- [ ] **Step 2: Run the seed**

```powershell
pnpm --filter @koncie/web db:seed
```

Expected output includes `[seed] Jane's SYD↔NAN flight inserted`.

- [ ] **Step 3: Verify in Supabase**

In Supabase Table Editor → `flight_bookings`: one row with `guest_id` matching Jane's row, `external_ref = 'JS-JANE-NAMOTU-01'`, `origin = 'SYD'`, `destination = 'NAN'`.

- [ ] **Step 4: Commit**

```powershell
git add apps/web/prisma/seed.ts
git commit -m "feat(seed): seed Jane's SYD↔NAN flight itinerary"
```

---

## Task 18: Playwright E2E — flights spec

**Files:**
- Create: `apps/web/tests/e2e/flights.spec.ts`

- [ ] **Step 1: Write the spec**

Create `apps/web/tests/e2e/flights.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('Sprint 3 flight itinerary on hub', () => {
  test.beforeEach(async ({ page }) => {
    // Sprint 2-polish dev helper: sign in as seeded guest
    await page.goto('/dev-test/sign-in-as-seed-guest');
    await expect(page).toHaveURL(/\/hub$/);
    // Sprint 3 dev helper: force flight ingestion
    await page.goto('/dev-test/ingest-jetseeker-for-seed-guest');
    await expect(page).toHaveURL(/\/hub$/);
  });

  test('hub renders the flight itinerary card + contextual offers', async ({ page }) => {
    await expect(page.getByText(/your flight/i)).toBeVisible();
    await expect(page.getByText('SYD → NAN')).toBeVisible();
    await expect(page.getByText('NAN → SYD')).toBeVisible();
    await expect(page.getByText(/fiji airways|carrier fj|via jet seeker/i)).toBeVisible();

    // Contextual offers: deep-link + insurance stub
    const deepLink = page.getByRole('link', { name: /your namotu activities await/i });
    await expect(deepLink).toBeVisible();

    await expect(page.getByText(/travel protection.*coming soon/i)).toBeVisible();
    await expect(page.getByText(/covers your 14 jul flight to nadi/i)).toBeVisible();

    // Clickthrough on deep-link lands on /hub/activities
    await deepLink.click();
    await expect(page).toHaveURL(/\/hub\/activities$/);
  });
});
```

- [ ] **Step 2: Commit**

```powershell
git add apps/web/tests/e2e/flights.spec.ts
git commit -m "test(e2e): hub renders flight + contextual offers"
```

Note: E2E job in CI is `continue-on-error: true` (Sprint 2-polish posture). Locally run with `pnpm --filter @koncie/web test:e2e` — requires dev server running.

---

## Task 19: Docs — architecture.md

**Files:**
- Modify: `docs/architecture.md`

- [ ] **Step 1: Append the Flights section**

Append to `docs/architecture.md`:

```markdown
## Flights (Sprint 3+)

Sprint 3 adds the `FlightItinerarySource` port alongside Sprint 1's `PartnerAdapter` and Sprint 2's `PaymentProvider`.

```
[ app/hub/page.tsx ]
        │  (lazy-sync on render, 60s debounce)
        ▼
[ lib/flights/sync.ts ]  ← syncFlightsForGuest
        │
        ▼
[ lib/flights/provider.ts ]  ← DI boundary
        │
        ▼
[ FlightItinerarySource interface ]  (packages/types/src/flights.ts)
        │
        ▼
[ JetSeekerMockAdapter ]  (Sprint 3)
[ JetSeekerLiveAdapter ]  (Sprint-N — not yet written)
```

**Key rule.** Hub renders from `FlightBooking` in Postgres; the adapter is only called via the ingestion service, never on the render hot-path. Same discipline as Sprint 2's payment flow.

**Contextual offers.** A pure function (`lib/flights/contextual-offers.ts`) maps `(flight, upsells) → ContextualOffer[]`. Sprint 3 hardcodes two rules (Fiji-destination deep-link; always-on insurance stub); promote to a rules engine only when a third offer type competes for hub real-estate.
```

- [ ] **Step 2: Commit**

```powershell
git add docs/architecture.md
git commit -m "docs(architecture): add FlightItinerarySource port + ingestion pattern"
```

---

## Task 20: Docs — data-model.md

**Files:**
- Modify: `docs/data-model.md`

- [ ] **Step 1: Append Sprint 3 additions**

Append to `docs/data-model.md`:

```markdown
## Sprint 3 additions

### FlightBooking

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (pk) | |
| `guest_id` | uuid (fk → Guest) | |
| `external_ref` | text | Jet Seeker PNR; unique per guest |
| `origin` | char(3) | IATA airport code |
| `destination` | char(3) | IATA airport code |
| `departure_at` | timestamptz | |
| `return_at` | timestamptz (nullable) | null for one-way |
| `carrier` | char(2) | IATA airline code |
| `metadata` | jsonb | adapter-specific fields |
| `created_at`, `updated_at` | timestamptz | |

**Indexes:**

- `UNIQUE (guest_id, external_ref)` — idempotent upsert key; prevents duplicates on re-sync
- `(guest_id, departure_at)` — hub query shape

No CHECK constraints — nothing MoR-load-bearing (those stay in `transactions`).

### Guest (column added)

- `flights_last_synced_at` — timestamptz, nullable. Debounce anchor for the 60-second lazy-sync rule on `/hub`. Updated on successful `syncFlightsForGuest`; unchanged on adapter failure.
```

- [ ] **Step 2: Commit**

```powershell
git add docs/data-model.md
git commit -m "docs(data-model): FlightBooking + Guest.flightsLastSyncedAt"
```

---

## Task 21: Docs — flights.md (new)

**Files:**
- Create: `docs/flights.md`

- [ ] **Step 1: Write the doc**

Create `docs/flights.md`:

```markdown
# Flights — port contract + Sprint-N swap guide

## Contract

The authoritative contract is `packages/types/src/flights.ts`. Any adapter MUST:

1. Be **read-only**. Return `FlightBookingRead[]` from `fetchBookingsForGuest(email)`. Koncie does not book flights — bookings happen inside Jet Seeker's OTA.
2. Return empty array for unknown guest emails (business outcome, not an error).
3. Throw `JetSeekerUnavailableError` for infra failures (network, 5xx, auth). Do not throw for unknown-email, malformed-email, or any other business outcome.
4. Return ISO-8601 `departureAt` / `returnAt` strings (adapter converts native Jet Seeker representation).
5. Return 3-char IATA airport codes and 2-char IATA carrier codes.

## Mock-only behaviours

`JetSeekerMockAdapter` includes behaviours the real adapter MUST NOT rely on:

- Hardcoded email-matched responses (real adapter queries Jet Seeker's database)
- Fixed 150ms delay (real adapter varies with network)
- Fail-trigger email `flight-unavailable@test.com` — real adapter fails via HTTP

The port in `packages/types` is the contract. These mock behaviours are fixtures for local testing only.

## Fail triggers

| Input | Result |
|---|---|
| Email `flight-unavailable@test.com` | throws `JetSeekerUnavailableError` |
| Email `pat@kovena.com` (seed) | returns 1 SYD↔NAN round-trip |
| Any other email | returns `[]` |

## `IATA_TO_CITY` extension rules

`apps/web/src/lib/flights/iata.ts` holds the minimal IATA → city lookup used by the insurance-stub offer's `destinationLabel`.

Extension criteria:

- Add a code only after product confirms we want to surface it in offer copy
- Keep the lookup < ~50 entries; at that scale swap for a proper reference table or a maintained package (e.g. `iata-tz-map`)
- Missing codes fall back to the raw IATA code in offer copy — acceptable for non-pilot destinations

## Sprint-N swap-in guide

When real Jet Seeker API access lands:

1. Implement `JetSeekerLiveAdapter extends FlightItinerarySource` at `apps/web/src/adapters/jetseeker-live.ts`
2. Swap the export in `apps/web/src/lib/flights/provider.ts`:

```ts
// Before:
export const flightItinerarySource: FlightItinerarySource = new JetSeekerMockAdapter();
// After:
import { JetSeekerLiveAdapter } from '@/adapters/jetseeker-live';
export const flightItinerarySource: FlightItinerarySource = new JetSeekerLiveAdapter({
  apiKey: process.env.JETSEEKER_API_KEY!,
  environment: process.env.JETSEEKER_ENV as 'sandbox' | 'production',
});
```

3. Replace the `console.error` in `sync.ts` with `Sentry.captureException`
4. Drop the hardcoded `SEED_GUEST_EMAIL` / `FAIL_TRIGGER_EMAIL` branches
5. Consider a webhook endpoint at `app/api/webhooks/jetseeker/booking/route.ts` so new bookings push to Koncie without waiting for the 60-second lazy-sync
```

- [ ] **Step 2: Commit**

```powershell
git add docs/flights.md
git commit -m "docs(flights): port contract + Sprint-N swap guide"
```

---

## Task 22: Docs — sprint-3-changelog.md (new)

**Files:**
- Create: `docs/sprints/sprint-3-changelog.md`

- [ ] **Step 1: Write the changelog**

Create `docs/sprints/sprint-3-changelog.md`:

```markdown
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
```

- [ ] **Step 2: Commit**

```powershell
git add docs/sprints/sprint-3-changelog.md
git commit -m "docs(sprint-3): shipped changelog scaffold"
```

---

## Task 23: Final local verification before push

**Files:**
- (no source changes)

- [ ] **Step 1: Full typecheck + lint + test**

```powershell
pnpm typecheck
pnpm lint
pnpm test
```

Expected:
- `typecheck` — 3 packages green in ~5s
- `lint` — green (actions.test.ts disable comment from Sprint 2-polish still active; sync.test.ts has its own disable comment)
- `test` — 46+ tests passing across 8+ files (Sprint 2-polish's 40 + 5 jetseeker-mock + 4 sync + 6 contextual-offers + 2 flights-types = 57)

- [ ] **Step 2: Local click-test**

```powershell
pnpm --filter @koncie/web dev
```

Open `http://localhost:3000`, click "Start the demo →", sign in via magic link, observe `/hub`:
- Namotu booking hero ✓
- Flight itinerary card with SYD↔NAN ✓
- Your add-ons section (if prior test purchases exist) ✓
- Plan your trip — 2 activity cards ✓
- Green "Your Namotu activities await" → clickable, lands on `/hub/activities` ✓
- "Travel protection · Coming soon · Covers your 14 Jul flight to Nadi" ✓
- Old "Flight add-ons · Coming soon" stub GONE ✓

- [ ] **Step 3: Supabase verification**

In Supabase SQL editor:

```sql
SELECT guest_id, external_ref, origin, destination, carrier FROM flight_bookings;
SELECT email, flights_last_synced_at FROM guests WHERE email = 'pat@kovena.com';
```

Expected: 1 flight_bookings row for Jane; `flights_last_synced_at` is a recent timestamp (set by first `/hub` load or db:seed).

---

## Task 24: Push branch + open PR

**Files:**
- (no source changes)

- [ ] **Step 1: Push the branch**

```powershell
git push -u origin sprint-3
```

Expected: `* [new branch] sprint-3 -> sprint-3`; GitHub prints the "Create a pull request" URL.

- [ ] **Step 2: Wait for CI + Vercel**

Navigate to `https://github.com/pat116/koncie-web/pull/new/sprint-3`. Wait ~1–2 min for CI typecheck/lint/build/test to turn green. Playwright E2E job should now run (not skipped) against `/dev-test/ingest-jetseeker-for-seed-guest` + `/dev-test/sign-in-as-seed-guest`; it remains `continue-on-error: true` per Sprint 2-polish posture.

- [ ] **Step 3: Open the PR**

Title: `feat(sprint-3): Jet Seeker itinerary ingestion + contextual offers`

Body (paste into the PR description):

```markdown
## Summary

- FlightItinerarySource port + JetSeekerMockAdapter (Sprint-N swaps in real Jet Seeker wrapper)
- Prisma schema v3: new FlightBooking model, Guest.flightsLastSyncedAt column
- Ingestion service with upsert + stale-row cleanup + 60s lazy-sync on hub render
- Contextual offers: green deep-link to /hub/activities when Fiji destination + ACTIVE upsell, always-on insurance stub with destination-date copy
- Hub integration: FlightItineraryCard between booking hero and add-ons; offers after activities preview
- Docs: new flights.md, appended architecture.md + data-model.md

See docs/sprints/sprint-3-changelog.md for full shipped list.
See docs/flights.md for the port contract and Sprint-N swap guide.

## Test plan

- [x] pnpm typecheck green (3 packages)
- [x] pnpm test green
- [x] prisma migrate dev applied cleanly
- [x] pnpm db:seed creates one flight_bookings row for the seeded guest
- [x] Local /hub click-tested: flight card + deep-link + contextual stub all render
- [x] Deep-link clickthrough lands on /hub/activities
- [ ] CI green on this PR
- [ ] Vercel preview deploys cleanly and demo flow works on preview URL

🤖 Generated with [Claude](https://claude.com/claude)
```

Then in browser: compose with this body, click Create pull request.

- [ ] **Step 4: Merge when CI + Vercel + preview smoke all green**

Same flow as PR #2 / PR #3: click Merge pull request → Confirm merge → Delete branch.

---

## Plan complete.
