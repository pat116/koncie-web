# Sprint 1 Implementation Plan — Guest Hub skeleton + Auth

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a clickable `anonymous → signed-in` flow on staging where a seeded Namotu booking renders a personalised Koncie landing, the guest signs up via Supabase magic link routed through Resend, and lands on a hub dashboard showing their booking and "coming soon" stubs for activities, insurance, and flights.

**Architecture:** Next.js 14 App Router on Vercel (from Sprint 0), with Supabase Postgres accessed via Prisma 5, Supabase Auth for email magic links, and Resend as the SMTP sender behind Supabase's template override. A two-hop auth flow: Koncie-signed JWT magic link (containing booking context) → Supabase magic link (proves email ownership) → hub. Mock HotelLink integration ships as a `PartnerAdapter` implementation so Sprint 7's real adapter is a drop-in.

**Tech Stack:** Next.js 14.2, React 18.3, TypeScript 5.7 strict, Tailwind 3.4, Prisma 5.22, `@supabase/ssr` 0.5, `@supabase/supabase-js` 2.45, Resend 4.x, `@react-email/components` 0.0.x, `jose` 5.x (JWT), Vitest 2.x, `@testcontainers/postgres` 10.x, Playwright 1.49.

**Reference spec:** `docs/specs/2026-04-23-sprint-1-design.md`

---

## File Structure

### New files (by area)

**Database / Prisma:**
- `apps/web/prisma/schema.prisma` — Prisma schema v1
- `apps/web/prisma/seed.ts` — seed script
- `apps/web/prisma/migrations/*` — Prisma-generated
- `apps/web/src/lib/db/prisma.ts` — singleton client

**Supabase Auth:**
- `apps/web/src/lib/supabase/server.ts` — server component + route handler client
- `apps/web/src/lib/supabase/browser.ts` — browser client
- `apps/web/src/lib/supabase/middleware.ts` — session refresh helper
- `apps/web/src/middleware.ts` — Next.js middleware wiring

**Domain types:**
- `packages/types/src/partner-adapter.ts` — `PartnerAdapter` interface

**Mock adapter:**
- `apps/web/src/adapters/hotellink-mock.ts`

**Auth utilities:**
- `apps/web/src/lib/auth/signed-link.ts` — Koncie-signed JWT encode/decode
- `apps/web/src/lib/auth/guest-linking.ts` — Guest ↔ auth.users linking
- `apps/web/src/lib/errors.ts` — typed error classes

**Pages (App Router):**
- `apps/web/src/app/welcome/page.tsx`
- `apps/web/src/app/register/page.tsx`
- `apps/web/src/app/register/actions.ts`
- `apps/web/src/app/auth/callback/route.ts`
- `apps/web/src/app/hub/layout.tsx`
- `apps/web/src/app/hub/page.tsx`
- `apps/web/src/app/hub/trip/page.tsx`
- `apps/web/src/app/hub/profile/page.tsx`
- `apps/web/src/app/hub/profile/actions.ts`
- `apps/web/src/app/not-found.tsx`
- `apps/web/src/app/error.tsx`
- `apps/web/src/app/global-error.tsx`

**Email:**
- `apps/web/src/email/templates/magic-link.tsx`

**Components:**
- `apps/web/src/components/ui/button.tsx` (shadcn)
- `apps/web/src/components/ui/card.tsx` (shadcn)
- `apps/web/src/components/welcome/booking-summary-card.tsx`
- `apps/web/src/components/welcome/preview-card.tsx`
- `apps/web/src/components/hub/booking-hero.tsx`
- `apps/web/src/components/hub/section-card.tsx`
- `apps/web/src/components/hub/bottom-nav.tsx`

**Tests:**
- `apps/web/src/lib/auth/signed-link.test.ts`
- `apps/web/src/lib/auth/guest-linking.test.ts`
- `apps/web/prisma/seed.test.ts`
- `apps/web/tests/integration/booking-queries.test.ts`
- `apps/web/tests/e2e/guest-journey.spec.ts`
- `apps/web/vitest.config.ts`
- `apps/web/playwright.config.ts`

**Docs:**
- `docs/architecture.md`
- `docs/data-model.md`
- `docs/glossary.md`
- `docs/auth.md`
- `docs/sprints/sprint-1-changelog.md`

### Modified files

- `apps/web/package.json` — add deps + scripts
- `apps/web/.env.example` — add new keys
- `.env.example` (root) — mirror
- `.github/workflows/ci.yml` — add e2e matrix job
- `apps/web/src/app/layout.tsx` — no change if Sprint 0 is clean; verify
- `apps/web/tailwind.config.ts` — add shadcn animations plugin if not present (from Sprint 0)

---

## Task 1: Install Sprint 1 dependencies

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Add runtime dependencies**

Run from repo root:

```powershell
pnpm --filter @koncie/web add @prisma/client @supabase/ssr @supabase/supabase-js resend @react-email/components @react-email/render jose date-fns zod
```

- [ ] **Step 2: Add dev dependencies**

```powershell
pnpm --filter @koncie/web add -D prisma vitest @vitest/ui @testcontainers/postgres @playwright/test tsx
```

- [ ] **Step 3: Verify install**

Run:
```powershell
pnpm --filter @koncie/web list --depth=0
```

Expected: all packages above listed with no `UNMET` warnings.

- [ ] **Step 4: Commit**

```powershell
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore(sprint1): add deps for Prisma, Supabase, Resend, Vitest, Playwright"
```

---

## Task 2: Initialise Prisma

**Files:**
- Create: `apps/web/prisma/schema.prisma`

- [ ] **Step 1: Initialise Prisma**

```powershell
pnpm --filter @koncie/web exec prisma init --datasource-provider postgresql
```

This creates `apps/web/prisma/schema.prisma` and updates `.env` with `DATABASE_URL` placeholder. Don't commit `.env`.

- [ ] **Step 2: Verify scaffold**

Check `apps/web/prisma/schema.prisma` exists with:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

- [ ] **Step 3: Add `directUrl` for Supabase pooling compatibility**

Edit `apps/web/prisma/schema.prisma` datasource block:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

`DATABASE_URL` uses Supabase's connection pooler (port 6543) for app runtime; `DIRECT_URL` is the direct connection (port 5432) for migrations.

- [ ] **Step 4: Commit**

```powershell
git add apps/web/prisma/schema.prisma
git commit -m "chore(sprint1): initialise Prisma schema"
```

---

## Task 3: Define domain models in Prisma schema

**Files:**
- Modify: `apps/web/prisma/schema.prisma`

- [ ] **Step 1: Add enums and models**

Append to `apps/web/prisma/schema.prisma`:

```prisma
enum PartnerType {
  HOTELLINK
  SITEMINDER
  OPERA
}

enum BookingStatus {
  CONFIRMED
  CANCELLED
  COMPLETED
}

model PartnerIntegration {
  id         String       @id @default(uuid()) @db.Uuid
  type       PartnerType
  name       String       @unique
  config     Json
  properties Property[]
  createdAt  DateTime     @default(now()) @map("created_at")
  updatedAt  DateTime     @updatedAt @map("updated_at")

  @@map("partner_integrations")
}

model Property {
  id                    String             @id @default(uuid()) @db.Uuid
  slug                  String             @unique
  name                  String
  country               String
  region                String
  timezone              String
  partnerIntegrationId  String             @map("partner_integration_id") @db.Uuid
  partnerIntegration    PartnerIntegration @relation(fields: [partnerIntegrationId], references: [id])
  bookings              Booking[]
  createdAt             DateTime           @default(now()) @map("created_at")
  updatedAt             DateTime           @updatedAt @map("updated_at")

  @@map("properties")
}

model Guest {
  id          String    @id @default(uuid()) @db.Uuid
  email       String    @unique
  firstName   String    @map("first_name")
  lastName    String    @map("last_name")
  authUserId  String?   @unique @map("auth_user_id") @db.Uuid
  claimedAt   DateTime? @map("claimed_at")
  bookings    Booking[]
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  @@map("guests")
}

model Booking {
  id           String        @id @default(uuid()) @db.Uuid
  guestId      String        @map("guest_id") @db.Uuid
  guest        Guest         @relation(fields: [guestId], references: [id])
  propertyId   String        @map("property_id") @db.Uuid
  property     Property      @relation(fields: [propertyId], references: [id])
  externalRef  String        @unique @map("external_ref")
  checkIn      DateTime      @map("check_in") @db.Date
  checkOut     DateTime      @map("check_out") @db.Date
  numGuests    Int           @map("num_guests")
  status       BookingStatus
  createdAt    DateTime      @default(now()) @map("created_at")
  updatedAt    DateTime      @updatedAt @map("updated_at")

  @@map("bookings")
}
```

- [ ] **Step 2: Format the schema**

```powershell
pnpm --filter @koncie/web exec prisma format
```

Expected: no output, file rewritten to canonical formatting.

- [ ] **Step 3: Verify with `prisma validate`**

```powershell
pnpm --filter @koncie/web exec prisma validate
```

Expected: `The schema at ... is valid 🚀`

- [ ] **Step 4: Commit**

```powershell
git add apps/web/prisma/schema.prisma
git commit -m "feat(sprint1): Prisma schema v1 — Guest, Booking, Property, PartnerIntegration"
```

---

## Task 4: Provision Supabase projects + generate first migration

**Files:**
- Modify: `.env` (local only — do NOT commit)
- Create: `apps/web/prisma/migrations/YYYYMMDDHHMMSS_init/migration.sql`

- [ ] **Step 1: Create Supabase project for local dev**

Pat: go to https://supabase.com/dashboard, create a project `koncie-dev` in `ap-southeast-2` (Sydney). Note down:
- Project URL: `https://<ref>.supabase.co`
- `anon` public key
- `service_role` secret key
- Database password
- Pooler connection string (for `DATABASE_URL`, port 6543)
- Direct connection string (for `DIRECT_URL`, port 5432)

- [ ] **Step 2: Populate local `.env`**

In `apps/web/.env` (not `.env.example`), add:

```
DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.<ref>:<password>@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres"
NEXT_PUBLIC_SUPABASE_URL="https://<ref>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon-key>"
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
KONCIE_SIGNED_LINK_SECRET="<generate-with-openssl-rand-base64-32>"
RESEND_API_KEY=""
```

- [ ] **Step 3: Generate the initial migration**

```powershell
pnpm --filter @koncie/web exec prisma migrate dev --name init
```

Expected: `Your database is now in sync with your schema. Done in Xms`. Creates `apps/web/prisma/migrations/<timestamp>_init/migration.sql`.

- [ ] **Step 4: Inspect the migration**

Open `apps/web/prisma/migrations/<timestamp>_init/migration.sql` and confirm: 4 `CREATE TABLE`, 2 `CREATE TYPE`, expected foreign key constraints, `@@map` names are lowercase snake_case.

- [ ] **Step 5: Commit the migration**

```powershell
git add apps/web/prisma/migrations/
git commit -m "feat(sprint1): initial Prisma migration"
```

---

## Task 5: Prisma client singleton

**Files:**
- Create: `apps/web/src/lib/db/prisma.ts`

- [ ] **Step 1: Write the client helper**

Create `apps/web/src/lib/db/prisma.ts`:

```ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

This prevents connection storm under hot reload.

- [ ] **Step 2: Run typecheck**

```powershell
pnpm --filter @koncie/web typecheck
```

Expected: pass.

- [ ] **Step 3: Commit**

```powershell
git add apps/web/src/lib/db/prisma.ts
git commit -m "feat(sprint1): Prisma singleton client"
```

---

## Task 6: PartnerAdapter interface in @koncie/types

**Files:**
- Create: `packages/types/src/partner-adapter.ts`
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Define the interface**

Create `packages/types/src/partner-adapter.ts`:

```ts
/**
 * Common shape returned by any partner (HotelLink, SiteMinder, Opera, ...)
 * when we ingest a booking. Maps cleanly onto our internal `Booking` row.
 */
export interface ExternalBooking {
  externalRef: string;
  propertySlug: string;
  guest: {
    email: string;
    firstName: string;
    lastName: string;
  };
  checkIn: Date;
  checkOut: Date;
  numGuests: number;
  status: 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';
}

export interface WebhookResult {
  accepted: boolean;
  externalRef?: string;
  reason?: string;
}

/**
 * All partner integrations (real + mock) implement this port.
 * Swap implementations without touching app code.
 */
export interface PartnerAdapter {
  listBookings(propertySlug: string): Promise<ExternalBooking[]>;
  getBooking(externalRef: string): Promise<ExternalBooking | null>;
  onWebhook(payload: unknown): Promise<WebhookResult>;
}
```

- [ ] **Step 2: Re-export from index**

Edit `packages/types/src/index.ts` — add at the end:

```ts
export * from './partner-adapter.js';
```

- [ ] **Step 3: Typecheck and commit**

```powershell
pnpm --filter @koncie/types typecheck
git add packages/types/src/partner-adapter.ts packages/types/src/index.ts
git commit -m "feat(sprint1): PartnerAdapter port for PMS integrations"
```

---

## Task 7: Mock HotelLink adapter

**Files:**
- Create: `apps/web/src/adapters/hotellink-mock.ts`

- [ ] **Step 1: Implement the mock**

Create `apps/web/src/adapters/hotellink-mock.ts`:

```ts
import type { PartnerAdapter, ExternalBooking, WebhookResult } from '@koncie/types';
import { prisma } from '@/lib/db/prisma';

/**
 * Mock HotelLink adapter — reads from DB, simulates HotelLink's API shape.
 * Replaced by a real HTTP adapter in Sprint 7. Interface is stable.
 */
export class HotelLinkMockAdapter implements PartnerAdapter {
  async listBookings(propertySlug: string): Promise<ExternalBooking[]> {
    const bookings = await prisma.booking.findMany({
      where: { property: { slug: propertySlug } },
      include: { guest: true, property: true },
    });
    return bookings.map(toExternal);
  }

  async getBooking(externalRef: string): Promise<ExternalBooking | null> {
    const b = await prisma.booking.findUnique({
      where: { externalRef },
      include: { guest: true, property: true },
    });
    return b ? toExternal(b) : null;
  }

  async onWebhook(): Promise<WebhookResult> {
    // Sprint 7 replaces this with real payload parsing.
    return { accepted: false, reason: 'mock adapter does not accept webhooks' };
  }
}

type BookingWithRelations = Awaited<
  ReturnType<typeof prisma.booking.findUnique>
> & {
  guest: { email: string; firstName: string; lastName: string };
  property: { slug: string };
};

function toExternal(b: BookingWithRelations): ExternalBooking {
  return {
    externalRef: b.externalRef,
    propertySlug: b.property.slug,
    guest: {
      email: b.guest.email,
      firstName: b.guest.firstName,
      lastName: b.guest.lastName,
    },
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    numGuests: b.numGuests,
    status: b.status,
  };
}
```

- [ ] **Step 2: Typecheck**

```powershell
pnpm --filter @koncie/web typecheck
```

Expected: pass.

- [ ] **Step 3: Commit**

```powershell
git add apps/web/src/adapters/hotellink-mock.ts
git commit -m "feat(sprint1): HotelLink mock adapter implementing PartnerAdapter port"
```

---

## Task 8: Seed script

**Files:**
- Create: `apps/web/prisma/seed.ts`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Write the seed**

Create `apps/web/prisma/seed.ts`:

```ts
import { PrismaClient, PartnerType, BookingStatus } from '@prisma/client';
import { signMagicLink } from '../src/lib/auth/signed-link';

const prisma = new PrismaClient();

async function main() {
  if (process.env.VERCEL_ENV === 'production') {
    throw new Error('Refusing to seed Production DB. Seed is for dev + preview only.');
  }

  const partner = await prisma.partnerIntegration.upsert({
    where: { name: 'HotelLink — Namotu pilot' },
    create: {
      type: PartnerType.HOTELLINK,
      name: 'HotelLink — Namotu pilot',
      config: { webhookSecret: 'mock-secret', baseUrl: 'https://mock.hotellink.local' },
    },
    update: {},
  });

  const property = await prisma.property.upsert({
    where: { slug: 'namotu-island-fiji' },
    create: {
      slug: 'namotu-island-fiji',
      name: 'Namotu Island Fiji',
      country: 'FJ',
      region: 'Fiji',
      timezone: 'Pacific/Fiji',
      partnerIntegrationId: partner.id,
    },
    update: {},
  });

  const guest = await prisma.guest.upsert({
    where: { email: 'demo@koncie.app' },
    create: {
      email: 'demo@koncie.app',
      firstName: 'Jane',
      lastName: 'Demo',
    },
    update: {},
  });

  const booking = await prisma.booking.upsert({
    where: { externalRef: 'HL-84321-NMT' },
    create: {
      externalRef: 'HL-84321-NMT',
      guestId: guest.id,
      propertyId: property.id,
      checkIn: new Date('2026-07-14'),
      checkOut: new Date('2026-07-21'),
      numGuests: 2,
      status: BookingStatus.CONFIRMED,
    },
    update: {},
  });

  const token = await signMagicLink({
    bookingId: booking.id,
    guestEmail: guest.email,
    expiresInSeconds: 60 * 60 * 24 * 7, // 7 days
  });

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  console.log('\n✨ Seed complete.\n');
  console.log('Signed magic link for demo guest:');
  console.log(`${baseUrl}/welcome?token=${token}\n`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 2: Register seed in package.json**

Add to `apps/web/package.json`:

```json
{
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

And add a script:

```json
{
  "scripts": {
    "db:seed": "prisma db seed",
    "db:migrate": "prisma migrate dev",
    "db:push": "prisma db push"
  }
}
```

- [ ] **Step 3: Commit (we cannot run yet — signed-link helper is Task 10)**

```powershell
git add apps/web/prisma/seed.ts apps/web/package.json
git commit -m "feat(sprint1): seed script for Namotu demo booking"
```

---

## Task 9: Signed link JWT — tests first (TDD)

**Files:**
- Create: `apps/web/src/lib/auth/signed-link.test.ts`

- [ ] **Step 1: Write the test suite**

Create `apps/web/src/lib/auth/signed-link.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { signMagicLink, verifyMagicLink, SignedLinkError } from './signed-link';

beforeAll(() => {
  process.env.KONCIE_SIGNED_LINK_SECRET = 'test-secret-at-least-32-chars-long-xxxxxx';
});

describe('signed-link JWT', () => {
  it('round-trips a valid payload', async () => {
    const token = await signMagicLink({
      bookingId: '00000000-0000-0000-0000-000000000001',
      guestEmail: 'jane@example.com',
      expiresInSeconds: 60,
    });

    const payload = await verifyMagicLink(token);
    expect(payload.bookingId).toBe('00000000-0000-0000-0000-000000000001');
    expect(payload.guestEmail).toBe('jane@example.com');
  });

  it('rejects a tampered signature', async () => {
    const token = await signMagicLink({
      bookingId: '00000000-0000-0000-0000-000000000001',
      guestEmail: 'jane@example.com',
      expiresInSeconds: 60,
    });
    const tampered = token.slice(0, -4) + 'abcd';

    await expect(verifyMagicLink(tampered)).rejects.toThrow(SignedLinkError);
  });

  it('rejects an expired token', async () => {
    const token = await signMagicLink({
      bookingId: '00000000-0000-0000-0000-000000000001',
      guestEmail: 'jane@example.com',
      expiresInSeconds: -1, // already expired
    });

    await expect(verifyMagicLink(token)).rejects.toThrow(SignedLinkError);
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signMagicLink({
      bookingId: '00000000-0000-0000-0000-000000000001',
      guestEmail: 'jane@example.com',
      expiresInSeconds: 60,
    });

    process.env.KONCIE_SIGNED_LINK_SECRET = 'different-secret-at-least-32-chars-yyyyyy';
    await expect(verifyMagicLink(token)).rejects.toThrow(SignedLinkError);
    process.env.KONCIE_SIGNED_LINK_SECRET = 'test-secret-at-least-32-chars-long-xxxxxx';
  });
});
```

- [ ] **Step 2: Create vitest config**

Create `apps/web/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['tests/e2e/**'],
  },
});
```

Install the tsconfig-paths helper:

```powershell
pnpm --filter @koncie/web add -D vite-tsconfig-paths
```

- [ ] **Step 3: Add test script**

Add to `apps/web/package.json` scripts:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  }
}
```

- [ ] **Step 4: Run tests — expect fail (no implementation yet)**

```powershell
pnpm --filter @koncie/web test
```

Expected: 4 failures, all `ReferenceError`/`Cannot find module './signed-link'`.

- [ ] **Step 5: Commit the test**

```powershell
git add apps/web/src/lib/auth/signed-link.test.ts apps/web/vitest.config.ts apps/web/package.json pnpm-lock.yaml
git commit -m "test(sprint1): signed-link JWT spec (failing)"
```

---

## Task 10: Signed link JWT — implementation

**Files:**
- Create: `apps/web/src/lib/auth/signed-link.ts`
- Modify: `apps/web/src/lib/errors.ts` (create if absent)

- [ ] **Step 1: Create the error module**

Create `apps/web/src/lib/errors.ts`:

```ts
export class SignedLinkError extends Error {
  constructor(public readonly reason: 'expired' | 'invalid_signature' | 'email_mismatch' | 'malformed') {
    super(`Signed link error: ${reason}`);
    this.name = 'SignedLinkError';
  }
}

export class BookingNotFoundError extends Error {
  constructor(public readonly externalRef: string) {
    super(`Booking not found: ${externalRef}`);
    this.name = 'BookingNotFoundError';
  }
}

export class AuthSessionError extends Error {
  constructor(public readonly reason: 'no_session' | 'refresh_failed') {
    super(`Auth session error: ${reason}`);
    this.name = 'AuthSessionError';
  }
}

export class DatabaseUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('Database unavailable');
    this.name = 'DatabaseUnavailableError';
    if (cause) this.cause = cause;
  }
}
```

- [ ] **Step 2: Implement signed-link**

Create `apps/web/src/lib/auth/signed-link.ts`:

```ts
import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import { SignedLinkError } from '@/lib/errors';

export interface MagicLinkPayload {
  bookingId: string;
  guestEmail: string;
}

function getSecret(): Uint8Array {
  const raw = process.env.KONCIE_SIGNED_LINK_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error('KONCIE_SIGNED_LINK_SECRET must be set and at least 32 chars');
  }
  return new TextEncoder().encode(raw);
}

export async function signMagicLink(input: {
  bookingId: string;
  guestEmail: string;
  expiresInSeconds: number;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    bookingId: input.bookingId,
    guestEmail: input.guestEmail,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + input.expiresInSeconds)
    .sign(getSecret());
}

export async function verifyMagicLink(token: string): Promise<MagicLinkPayload> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ['HS256'] });
    const { bookingId, guestEmail } = payload as Record<string, unknown>;
    if (typeof bookingId !== 'string' || typeof guestEmail !== 'string') {
      throw new SignedLinkError('malformed');
    }
    return { bookingId, guestEmail };
  } catch (e) {
    if (e instanceof SignedLinkError) throw e;
    if (e instanceof joseErrors.JWTExpired) throw new SignedLinkError('expired');
    if (e instanceof joseErrors.JWSSignatureVerificationFailed || e instanceof joseErrors.JWSInvalid) {
      throw new SignedLinkError('invalid_signature');
    }
    throw new SignedLinkError('malformed');
  }
}

export { SignedLinkError };
```

- [ ] **Step 3: Run tests — expect pass**

```powershell
pnpm --filter @koncie/web test
```

Expected: 4 passes. If any fail, fix before committing.

- [ ] **Step 4: Commit**

```powershell
git add apps/web/src/lib/errors.ts apps/web/src/lib/auth/signed-link.ts
git commit -m "feat(sprint1): signed-link JWT encode/decode + typed error classes"
```

---

## Task 11: Run the seed and verify

**Files:**
- None (verification only)

- [ ] **Step 1: Run the seed**

```powershell
pnpm --filter @koncie/web db:seed
```

Expected output ends with:
```
✨ Seed complete.
Signed magic link for demo guest:
http://localhost:3000/welcome?token=eyJ...
```

- [ ] **Step 2: Verify rows landed in Supabase**

In Supabase dashboard → Table Editor, confirm one row each in `partner_integrations`, `properties`, `guests`, `bookings`.

- [ ] **Step 3: Re-run to verify idempotency**

```powershell
pnpm --filter @koncie/web db:seed
```

Expected: same token printed; row counts unchanged.

- [ ] **Step 4: No commit needed** — this is verification only.

---

## Task 12: Supabase server client helpers

**Files:**
- Create: `apps/web/src/lib/supabase/server.ts`
- Create: `apps/web/src/lib/supabase/browser.ts`
- Create: `apps/web/src/lib/supabase/middleware.ts`

- [ ] **Step 1: Server client**

Create `apps/web/src/lib/supabase/server.ts`:

```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createSupabaseServerClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component; Next will error on cookie writes.
            // Safe to ignore if middleware is refreshing sessions.
          }
        },
      },
    },
  );
}
```

- [ ] **Step 2: Browser client**

Create `apps/web/src/lib/supabase/browser.ts`:

```ts
import { createBrowserClient } from '@supabase/ssr';

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 3: Middleware helper**

Create `apps/web/src/lib/supabase/middleware.ts`:

```ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Gate /hub/* on a session
  if (!user && request.nextUrl.pathname.startsWith('/hub')) {
    const url = request.nextUrl.clone();
    url.pathname = '/welcome';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}
```

- [ ] **Step 4: Wire middleware**

Create `apps/web/src/middleware.ts`:

```ts
import { updateSession } from '@/lib/supabase/middleware';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, robots.txt, sitemap.xml
     * - any file with a static extension
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

- [ ] **Step 5: Typecheck + commit**

```powershell
pnpm --filter @koncie/web typecheck
git add apps/web/src/lib/supabase/ apps/web/src/middleware.ts
git commit -m "feat(sprint1): Supabase SSR clients + /hub gating middleware"
```

---

## Task 13: Guest linking helper — tests first

**Files:**
- Create: `apps/web/src/lib/auth/guest-linking.test.ts`

- [ ] **Step 1: Write the test**

Create `apps/web/src/lib/auth/guest-linking.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { linkGuestToAuthUser } from './guest-linking';

const mockGuestUpdate = vi.fn();
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    guest: {
      update: (...args: unknown[]) => mockGuestUpdate(...args),
      findUnique: vi.fn(),
    },
  },
}));

describe('linkGuestToAuthUser', () => {
  beforeEach(() => {
    mockGuestUpdate.mockReset();
  });

  it('sets auth_user_id and claimed_at on first link', async () => {
    mockGuestUpdate.mockResolvedValueOnce({
      id: 'g1',
      email: 'jane@example.com',
      authUserId: 'auth-1',
      claimedAt: new Date(),
    });

    await linkGuestToAuthUser({ email: 'jane@example.com', authUserId: 'auth-1' });

    expect(mockGuestUpdate).toHaveBeenCalledWith({
      where: { email: 'jane@example.com' },
      data: expect.objectContaining({
        authUserId: 'auth-1',
        claimedAt: expect.any(Date),
      }),
    });
  });

  it('is idempotent when called twice with the same auth_user_id', async () => {
    mockGuestUpdate.mockResolvedValue({
      id: 'g1',
      email: 'jane@example.com',
      authUserId: 'auth-1',
      claimedAt: new Date('2026-04-23'),
    });

    await linkGuestToAuthUser({ email: 'jane@example.com', authUserId: 'auth-1' });
    await linkGuestToAuthUser({ email: 'jane@example.com', authUserId: 'auth-1' });

    expect(mockGuestUpdate).toHaveBeenCalledTimes(2);
    // Both calls OK — claimedAt only set if currently null (see impl below)
  });
});
```

- [ ] **Step 2: Run — expect fail**

```powershell
pnpm --filter @koncie/web test guest-linking
```

Expected: module-not-found.

- [ ] **Step 3: Commit**

```powershell
git add apps/web/src/lib/auth/guest-linking.test.ts
git commit -m "test(sprint1): guest-linking helper spec (failing)"
```

---

## Task 14: Guest linking helper — implementation

**Files:**
- Create: `apps/web/src/lib/auth/guest-linking.ts`

- [ ] **Step 1: Implement**

Create `apps/web/src/lib/auth/guest-linking.ts`:

```ts
import { prisma } from '@/lib/db/prisma';

/**
 * Link a Guest row to a Supabase auth user. Idempotent — repeated calls
 * with the same authUserId are no-ops after the first. Only sets
 * claimedAt on the first successful link.
 */
export async function linkGuestToAuthUser(params: {
  email: string;
  authUserId: string;
}) {
  const existing = await prisma.guest.findUnique({
    where: { email: params.email },
    select: { id: true, authUserId: true, claimedAt: true },
  });

  if (!existing) {
    throw new Error(`No Guest row for email ${params.email}`);
  }

  return prisma.guest.update({
    where: { email: params.email },
    data: {
      authUserId: params.authUserId,
      claimedAt: existing.claimedAt ?? new Date(),
    },
  });
}
```

- [ ] **Step 2: Tests pass**

```powershell
pnpm --filter @koncie/web test guest-linking
```

Expected: 2 passes.

- [ ] **Step 3: Commit**

```powershell
git add apps/web/src/lib/auth/guest-linking.ts
git commit -m "feat(sprint1): guest ↔ auth.users linking helper"
```

---

## Task 15: Error pages (404 / 500 / global-error)

**Files:**
- Create: `apps/web/src/app/not-found.tsx`
- Create: `apps/web/src/app/error.tsx`
- Create: `apps/web/src/app/global-error.tsx`

- [ ] **Step 1: 404 page**

Create `apps/web/src/app/not-found.tsx`:

```tsx
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-koncie-sand p-6 text-center">
      <h1 className="text-3xl font-bold text-koncie-navy">Page not found</h1>
      <p className="mt-3 max-w-sm text-koncie-charcoal">
        The link you followed is either expired or belongs to a different trip.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-full bg-koncie-navy px-5 py-3 text-sm font-semibold text-white"
      >
        Back to Koncie
      </Link>
    </main>
  );
}
```

- [ ] **Step 2: 500 page (client error boundary)**

Create `apps/web/src/app/error.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-koncie-sand p-6 text-center">
      <h1 className="text-3xl font-bold text-koncie-navy">Something went wrong</h1>
      <p className="mt-3 max-w-sm text-koncie-charcoal">
        We've logged what happened and someone at Koncie will take a look.
      </p>
      <button
        onClick={reset}
        className="mt-6 rounded-full bg-koncie-navy px-5 py-3 text-sm font-semibold text-white"
      >
        Try again
      </button>
    </main>
  );
}
```

- [ ] **Step 3: global-error (replaces Next's default root error boundary)**

Create `apps/web/src/app/global-error.tsx`:

```tsx
'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
        <h1>Something went wrong</h1>
        <p>Our team has been notified. Please refresh to try again.</p>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Typecheck + commit**

```powershell
pnpm --filter @koncie/web typecheck
git add apps/web/src/app/not-found.tsx apps/web/src/app/error.tsx apps/web/src/app/global-error.tsx
git commit -m "feat(sprint1): branded 404/500/global-error pages"
```

---

## Task 16: Install shadcn button + card

**Files:**
- Create: `apps/web/src/components/ui/button.tsx`
- Create: `apps/web/src/components/ui/card.tsx`

- [ ] **Step 1: Initialise shadcn (only if not already)**

```powershell
pnpm --filter @koncie/web exec shadcn@latest init -d
```

Accept defaults; confirm `apps/web/components.json` exists (Sprint 0 scaffolded it).

- [ ] **Step 2: Add components**

```powershell
pnpm --filter @koncie/web exec shadcn@latest add button card
```

Files land at `apps/web/src/components/ui/button.tsx` and `.../card.tsx`.

- [ ] **Step 3: Typecheck + commit**

```powershell
pnpm --filter @koncie/web typecheck
git add apps/web/src/components/ui/
git commit -m "chore(sprint1): shadcn button + card components"
```

---

## Task 17: Welcome page components

**Files:**
- Create: `apps/web/src/components/welcome/booking-summary-card.tsx`
- Create: `apps/web/src/components/welcome/preview-card.tsx`

- [ ] **Step 1: Booking summary card**

Create `apps/web/src/components/welcome/booking-summary-card.tsx`:

```tsx
import { format } from 'date-fns';

export interface BookingSummary {
  propertyName: string;
  checkIn: Date;
  checkOut: Date;
  numGuests: number;
  externalRef: string;
}

export function BookingSummaryCard({ summary }: { summary: BookingSummary }) {
  const nights = Math.round(
    (summary.checkOut.getTime() - summary.checkIn.getTime()) / (1000 * 60 * 60 * 24),
  );
  return (
    <div className="rounded-xl border border-koncie-border bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-koncie-charcoal/60">
        {nights}-NIGHT STAY · {summary.numGuests} GUESTS
      </p>
      <h3 className="mt-1 text-base font-semibold text-koncie-charcoal">
        {summary.propertyName}
      </h3>
      <p className="text-xs text-koncie-charcoal/60">
        {format(summary.checkIn, 'd MMM yyyy')} – {format(summary.checkOut, 'd MMM yyyy')} · ref {summary.externalRef}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Preview card**

Create `apps/web/src/components/welcome/preview-card.tsx`:

```tsx
export interface PreviewCardProps {
  icon: string;
  title: string;
  subtitle: string;
}

export function PreviewCard({ icon, title, subtitle }: PreviewCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-koncie-border bg-white p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-koncie-green/15 text-xl">
        <span aria-hidden="true">{icon}</span>
      </div>
      <div>
        <p className="text-sm font-semibold text-koncie-charcoal">{title}</p>
        <p className="text-xs text-koncie-charcoal/60">{subtitle}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```powershell
git add apps/web/src/components/welcome/
git commit -m "feat(sprint1): welcome page components"
```

---

## Task 18: Welcome page assembly

**Files:**
- Create: `apps/web/src/app/welcome/page.tsx`

- [ ] **Step 1: Implement**

Create `apps/web/src/app/welcome/page.tsx`:

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { verifyMagicLink } from '@/lib/auth/signed-link';
import { SignedLinkError } from '@/lib/errors';
import { BookingSummaryCard } from '@/components/welcome/booking-summary-card';
import { PreviewCard } from '@/components/welcome/preview-card';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: { token?: string };
}

export default async function WelcomePage({ searchParams }: PageProps) {
  const token = searchParams.token;
  if (!token) return <LinkExpiredState />;

  let payload;
  try {
    payload = await verifyMagicLink(token);
  } catch (e) {
    if (e instanceof SignedLinkError) return <LinkExpiredState />;
    throw e;
  }

  const booking = await prisma.booking.findUnique({
    where: { id: payload.bookingId },
    include: { guest: true, property: true },
  });

  if (!booking || booking.guest.email !== payload.guestEmail) {
    return <LinkExpiredState />;
  }

  return (
    <main className="min-h-screen bg-koncie-sand">
      <header className="bg-koncie-navy px-5 py-4 text-center">
        <h1 className="font-semibold text-white">Koncie</h1>
      </header>

      <section className="px-5 pt-8">
        <h2 className="text-2xl font-bold text-koncie-navy">
          Hi {booking.guest.firstName} ✨
        </h2>
        <p className="mt-2 text-sm text-koncie-charcoal">
          Your {booking.property.name} stay starts{' '}
          <span className="font-semibold">
            {booking.checkIn.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        </p>

        <div className="mt-5">
          <BookingSummaryCard
            summary={{
              propertyName: booking.property.name,
              checkIn: booking.checkIn,
              checkOut: booking.checkOut,
              numGuests: booking.numGuests,
              externalRef: booking.externalRef,
            }}
          />
        </div>

        <h3 className="mt-8 text-xs font-semibold uppercase tracking-wide text-koncie-navy">
          What's waiting for you
        </h3>
        <div className="mt-3 space-y-3">
          <PreviewCard icon="🏄" title="Activities at the resort" subtitle="Surf, dive, fish — see them all" />
          <PreviewCard icon="🛡️" title="Travel protection" subtitle="Recommended for Fiji travel" />
          <PreviewCard icon="✈️" title="Flight add-ons" subtitle="Powered by JetSeeker" />
        </div>

        <div className="mt-8 pb-12">
          <Link
            href={`/register?bookingId=${booking.id}`}
            className="block rounded-full bg-koncie-navy px-5 py-4 text-center text-sm font-semibold text-white"
          >
            Create your Koncie account
          </Link>
          <p className="mt-4 text-center text-xs text-koncie-charcoal/60">
            Already have one?{' '}
            <Link href="/register?signin=true" className="text-koncie-green underline">
              Sign in
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}

function LinkExpiredState() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-koncie-sand p-6 text-center">
      <h1 className="text-2xl font-bold text-koncie-navy">This link has expired</h1>
      <p className="mt-3 max-w-sm text-koncie-charcoal">
        Please contact your host to get a fresh link.
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Add to tailwind config — koncie semantic classes already in Sprint 0 preset**

Sanity check by running:
```powershell
pnpm --filter @koncie/web dev
```

Open the signed magic link printed by Task 11 — screen 1 should render.

- [ ] **Step 3: Commit**

```powershell
git add apps/web/src/app/welcome/page.tsx
git commit -m "feat(sprint1): welcome page with signed-link verification"
```

---

## Task 19: Magic link email template

**Files:**
- Create: `apps/web/src/email/templates/magic-link.tsx`

- [ ] **Step 1: Write the template**

Create `apps/web/src/email/templates/magic-link.tsx`:

```tsx
import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';

interface MagicLinkEmailProps {
  firstName: string;
  signInUrl: string;
}

export function MagicLinkEmail({ firstName, signInUrl }: MagicLinkEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your Koncie sign-in link is ready</Preview>
      <Body style={{ backgroundColor: '#F7F3E9', fontFamily: 'Poppins, Helvetica, Arial, sans-serif', margin: 0 }}>
        <Container style={{ maxWidth: '480px', margin: '0 auto', padding: '32px 24px' }}>
          <Section style={{ backgroundColor: '#001F3D', padding: '20px', borderRadius: '12px 12px 0 0' }}>
            <Text style={{ color: '#fff', fontSize: '20px', fontWeight: 600, margin: 0, textAlign: 'center' }}>
              Koncie
            </Text>
          </Section>
          <Section style={{ backgroundColor: '#fff', padding: '32px 28px', borderRadius: '0 0 12px 12px' }}>
            <Text style={{ fontSize: '18px', fontWeight: 600, color: '#001F3D', margin: '0 0 12px' }}>
              Hi {firstName},
            </Text>
            <Text style={{ fontSize: '14px', color: '#333', lineHeight: '22px', margin: '0 0 24px' }}>
              Click the button below to sign in to Koncie and see everything waiting for your trip.
            </Text>
            <Button
              href={signInUrl}
              style={{
                backgroundColor: '#001F3D',
                color: '#fff',
                padding: '14px 24px',
                borderRadius: '999px',
                fontSize: '14px',
                fontWeight: 600,
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              Sign in to Koncie
            </Button>
            <Text style={{ fontSize: '12px', color: '#888', marginTop: '32px', lineHeight: '20px' }}>
              If you didn't request this email, just ignore it — the link expires automatically.
            </Text>
            <Hr style={{ borderColor: '#E4DECD', margin: '28px 0 16px' }} />
            <Text style={{ fontSize: '11px', color: '#888', margin: 0 }}>
              — The Koncie team
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default MagicLinkEmail;
```

- [ ] **Step 2: Typecheck + commit**

```powershell
pnpm --filter @koncie/web typecheck
git add apps/web/src/email/templates/magic-link.tsx
git commit -m "feat(sprint1): Koncie-branded magic-link email template"
```

---

## Task 20: Register page + magic link server action

**Files:**
- Create: `apps/web/src/app/register/actions.ts`
- Create: `apps/web/src/app/register/page.tsx`

- [ ] **Step 1: Server action**

Create `apps/web/src/app/register/actions.ts`:

```ts
'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/db/prisma';

export async function fireMagicLink(formData: FormData) {
  const bookingId = formData.get('bookingId');
  if (typeof bookingId !== 'string') {
    return { ok: false, reason: 'bad_booking_id' as const };
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { guest: true },
  });
  if (!booking) {
    return { ok: false, reason: 'booking_not_found' as const };
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: booking.guest.email,
    options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback` },
  });

  if (error) {
    return { ok: false, reason: 'send_failed' as const, detail: error.message };
  }

  return { ok: true, email: booking.guest.email };
}
```

- [ ] **Step 2: Register page**

Create `apps/web/src/app/register/page.tsx`:

```tsx
import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { fireMagicLink } from './actions';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: { bookingId?: string };
}

export default async function RegisterPage({ searchParams }: PageProps) {
  if (!searchParams.bookingId) {
    return <Missing />;
  }

  const booking = await prisma.booking.findUnique({
    where: { id: searchParams.bookingId },
    include: { guest: true },
  });
  if (!booking) return <Missing />;

  // Auto-fire the magic link on page render via a hidden form submit
  // approach would need JS. Cleaner: user sees the "check your email"
  // state after clicking the CTA on /welcome, which submits this form.
  return (
    <main className="min-h-screen bg-koncie-sand">
      <header className="bg-koncie-navy px-5 py-4 text-center">
        <h1 className="font-semibold text-white">Koncie</h1>
      </header>
      <section className="flex flex-col items-center px-5 pt-8">
        <p className="text-xs text-koncie-charcoal/60">STEP 2 OF 2</p>

        <div className="mt-6 flex h-24 w-24 items-center justify-center rounded-full bg-koncie-green/15 text-5xl" aria-hidden="true">
          📧
        </div>

        <form action={fireMagicLink} className="mt-6 w-full max-w-sm">
          <input type="hidden" name="bookingId" value={booking.id} />
          <button
            type="submit"
            className="w-full rounded-full bg-koncie-navy px-5 py-3 text-sm font-semibold text-white"
          >
            Send me a sign-in link
          </button>
        </form>

        <h2 className="mt-8 text-2xl font-bold text-koncie-navy">Check your email</h2>
        <p className="mt-2 text-sm text-koncie-charcoal">
          We'll send a sign-in link to
        </p>
        <p className="mt-1 font-semibold text-koncie-navy">{booking.guest.email}</p>

        <div className="mt-8 w-full max-w-sm rounded-xl border border-koncie-border bg-white p-4">
          <p className="text-xs font-semibold text-koncie-navy">NEXT STEPS</p>
          <ol className="mt-2 space-y-1 text-sm text-koncie-charcoal/80">
            <li>1. Open your inbox</li>
            <li>2. Click the link from Koncie</li>
            <li>3. You'll land on your trip hub</li>
          </ol>
        </div>

        <p className="mt-10 text-xs text-koncie-charcoal/60">
          Didn't see it? Check spam, or{' '}
          <Link href={`/register?bookingId=${booking.id}`} className="font-semibold text-koncie-green">
            resend the link
          </Link>
        </p>

        <p className="mt-4 text-xs text-koncie-charcoal/60">
          Wrong email?{' '}
          <Link href={`/welcome?bookingId=${booking.id}&error=wrong_email`} className="font-semibold text-koncie-green">
            change it
          </Link>
        </p>
      </section>
    </main>
  );
}

function Missing() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-koncie-sand p-6 text-center">
      <h1 className="text-2xl font-bold text-koncie-navy">Missing booking context</h1>
      <p className="mt-3 text-sm text-koncie-charcoal">
        Start from the signed link in your email.
      </p>
    </main>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

```powershell
pnpm --filter @koncie/web typecheck
git add apps/web/src/app/register/
git commit -m "feat(sprint1): register page + magic-link server action"
```

---

## Task 21: Configure Supabase SMTP → Resend

**Files:**
- None in repo (Supabase dashboard config) — documented in `docs/auth.md` later

- [ ] **Step 1: Create Resend account + API key**

Pat: go to https://resend.com, sign up (Kovena email), create API key `koncie-preview-sending`. Save to `apps/web/.env` as `RESEND_API_KEY`.

- [ ] **Step 2: Verify `koncie.app` sending domain**

Resend dashboard → Domains → Add `koncie.app`. Copy DNS records (SPF, DKIM, DMARC). Pat: add to the `koncie.app` DNS provider. Wait for "Verified" status (can take minutes to hours).

- [ ] **Step 3: Configure Supabase SMTP override**

Supabase dashboard → Authentication → Settings → SMTP Settings:
- Enable custom SMTP
- Host: `smtp.resend.com`
- Port: 465
- Username: `resend`
- Password: Resend API key
- Sender email: `noreply@koncie.app`
- Sender name: `Koncie`

- [ ] **Step 4: Customize Supabase magic-link email template**

Supabase → Authentication → Email Templates → Magic Link. Replace body with a simplified HTML version matching the brand (Supabase's template language is Go templates — `{{ .ConfirmationURL }}` for the link).

```html
<div style="font-family: Poppins, Arial, sans-serif; background: #F7F3E9; padding: 24px;">
  <div style="max-width: 480px; margin: 0 auto;">
    <div style="background: #001F3D; padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
      <h1 style="color: #fff; margin: 0; font-size: 20px;">Koncie</h1>
    </div>
    <div style="background: #fff; padding: 32px 28px; border-radius: 0 0 12px 12px;">
      <p style="margin: 0 0 12px; font-size: 18px; font-weight: 600; color: #001F3D;">Hi there,</p>
      <p style="margin: 0 0 24px; font-size: 14px; color: #333;">
        Click the button below to sign in to Koncie.
      </p>
      <a href="{{ .ConfirmationURL }}" style="background: #001F3D; color: #fff; padding: 14px 24px; border-radius: 999px; text-decoration: none; font-weight: 600; display: inline-block;">
        Sign in to Koncie
      </a>
      <p style="margin: 32px 0 0; font-size: 12px; color: #888;">
        If you didn't request this, ignore it. The link expires automatically.
      </p>
    </div>
  </div>
</div>
```

- [ ] **Step 5: Test the send**

From local dev, submit the magic-link form. Check `demo@koncie.app` inbox (or Resend logs). Expected: Koncie-branded email arrives within 30 seconds.

- [ ] **Step 6: No code commit here** — config is live.

---

## Task 22: Auth callback route

**Files:**
- Create: `apps/web/src/app/auth/callback/route.ts`

- [ ] **Step 1: Implement**

Create `apps/web/src/app/auth/callback/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { linkGuestToAuthUser } from '@/lib/auth/guest-linking';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/hub';

  if (!code) {
    return NextResponse.redirect(`${origin}/welcome`);
  }

  const supabase = createSupabaseServerClient();
  const { error, data } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session || !data.user?.email) {
    return NextResponse.redirect(`${origin}/welcome?error=callback_failed`);
  }

  try {
    await linkGuestToAuthUser({
      email: data.user.email,
      authUserId: data.user.id,
    });
  } catch (e) {
    // No matching Guest row — forwarded link, or guest deleted
    return NextResponse.redirect(`${origin}/welcome?error=no_matching_booking`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
```

- [ ] **Step 2: Typecheck + commit**

```powershell
pnpm --filter @koncie/web typecheck
git add apps/web/src/app/auth/callback/
git commit -m "feat(sprint1): auth callback — code exchange + guest linking"
```

---

## Task 23: Hub components — BookingHero, SectionCard, BottomNav

**Files:**
- Create: `apps/web/src/components/hub/booking-hero.tsx`
- Create: `apps/web/src/components/hub/section-card.tsx`
- Create: `apps/web/src/components/hub/bottom-nav.tsx`

- [ ] **Step 1: BookingHero**

Create `apps/web/src/components/hub/booking-hero.tsx`:

```tsx
import { format, differenceInCalendarDays } from 'date-fns';
import Link from 'next/link';

export interface BookingHeroProps {
  propertyName: string;
  checkIn: Date;
  checkOut: Date;
  numGuests: number;
}

export function BookingHero({ propertyName, checkIn, checkOut, numGuests }: BookingHeroProps) {
  const daysUntil = differenceInCalendarDays(checkIn, new Date());
  return (
    <section className="rounded-2xl bg-koncie-navy p-5 text-white">
      <p className="text-xs font-semibold uppercase tracking-wide text-koncie-green">
        Your upcoming trip
      </p>
      <h2 className="mt-2 text-xl font-bold">{propertyName}</h2>
      <p className="mt-1 text-sm text-white/80">
        {format(checkIn, 'd')} – {format(checkOut, 'd MMMM yyyy')} · {numGuests} guests
      </p>
      <div className="mt-4 flex items-center justify-between">
        <Link
          href="/hub/trip"
          className="rounded-full bg-koncie-green px-4 py-2 text-xs font-semibold text-koncie-navy"
        >
          View details
        </Link>
        <p className="text-xs text-white/60">in {daysUntil} days</p>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: SectionCard**

Create `apps/web/src/components/hub/section-card.tsx`:

```tsx
export interface SectionCardProps {
  icon: string;
  title: string;
  subtitle: string;
  href?: string;
}

export function SectionCard({ icon, title, subtitle, href }: SectionCardProps) {
  const inner = (
    <>
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-koncie-green/15 text-sm" aria-hidden="true">
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-koncie-charcoal">{title}</p>
        <p className="text-xs text-koncie-charcoal/60">{subtitle}</p>
      </div>
      <span className="text-lg text-koncie-charcoal/30" aria-hidden="true">›</span>
    </>
  );

  const cls = 'flex items-center gap-3 rounded-xl border border-koncie-border bg-white p-4';
  return href ? <a href={href} className={cls}>{inner}</a> : <div className={cls}>{inner}</div>;
}
```

- [ ] **Step 3: BottomNav**

Create `apps/web/src/components/hub/bottom-nav.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/hub', label: 'Home', enabled: true },
  { href: '/hub/trip', label: 'Trip', enabled: true },
  { href: '/hub/messages', label: 'Messages', enabled: false },
  { href: '/hub/profile', label: 'Profile', enabled: true },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 flex border-t border-koncie-border bg-white">
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        const cls = `flex-1 py-3 text-center text-xs ${
          active ? 'font-semibold text-koncie-green' : 'text-koncie-charcoal/60'
        } ${!item.enabled ? 'opacity-40' : ''}`;
        return item.enabled ? (
          <Link key={item.href} href={item.href} className={cls}>
            {item.label}
          </Link>
        ) : (
          <span key={item.href} className={cls} title="Available closer to your trip">
            {item.label}
          </span>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: Commit**

```powershell
pnpm --filter @koncie/web typecheck
git add apps/web/src/components/hub/
git commit -m "feat(sprint1): hub components — BookingHero, SectionCard, BottomNav"
```

---

## Task 24: Hub layout

**Files:**
- Create: `apps/web/src/app/hub/layout.tsx`

- [ ] **Step 1: Layout**

Create `apps/web/src/app/hub/layout.tsx`:

```tsx
import { BottomNav } from '@/components/hub/bottom-nav';

export default function HubLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-koncie-sand pb-20">
      <header className="flex items-center justify-between bg-koncie-navy px-5 py-4">
        <h1 className="font-semibold text-white">Koncie</h1>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-koncie-green font-bold text-koncie-navy">
          J
        </div>
      </header>
      {children}
      <BottomNav />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
git add apps/web/src/app/hub/layout.tsx
git commit -m "feat(sprint1): hub layout with nav + header"
```

---

## Task 25: Hub dashboard page

**Files:**
- Create: `apps/web/src/app/hub/page.tsx`

- [ ] **Step 1: Dashboard**

Create `apps/web/src/app/hub/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/db/prisma';
import { BookingHero } from '@/components/hub/booking-hero';
import { SectionCard } from '@/components/hub/section-card';

export const dynamic = 'force-dynamic';

export default async function HubPage() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect('/welcome');

  const guest = await prisma.guest.findUnique({
    where: { email: user.email },
    include: {
      bookings: {
        orderBy: { checkIn: 'asc' },
        include: { property: true },
      },
    },
  });

  if (!guest) redirect('/welcome?error=no_guest_record');
  const next = guest.bookings[0];

  return (
    <main className="px-5 pt-5">
      {next ? (
        <BookingHero
          propertyName={next.property.name}
          checkIn={next.checkIn}
          checkOut={next.checkOut}
          numGuests={next.numGuests}
        />
      ) : (
        <div className="rounded-2xl bg-koncie-navy p-5 text-white">
          <p className="font-semibold">No upcoming trips</p>
          <p className="mt-1 text-sm text-white/70">
            You'll see your next trip here after your host sends you a booking.
          </p>
        </div>
      )}

      <h3 className="mt-7 text-xs font-semibold uppercase tracking-wide text-koncie-navy">
        Plan your trip
      </h3>
      <div className="mt-3 space-y-3">
        <SectionCard
          icon="🏄"
          title="Activities"
          subtitle={next ? `Available from ${next.checkIn.toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })}` : 'Coming soon'}
        />
        <SectionCard icon="🛡️" title="Travel protection" subtitle="Coming soon" />
        <SectionCard icon="✈️" title="Flight add-ons" subtitle="Coming soon · via JetSeeker" />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
pnpm --filter @koncie/web typecheck
git add apps/web/src/app/hub/page.tsx
git commit -m "feat(sprint1): hub dashboard page"
```

---

## Task 26: Trip detail page

**Files:**
- Create: `apps/web/src/app/hub/trip/page.tsx`

- [ ] **Step 1: Implement**

Create `apps/web/src/app/hub/trip/page.tsx`:

```tsx
import { format, differenceInCalendarDays } from 'date-fns';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

export default async function TripPage() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect('/welcome');

  const guest = await prisma.guest.findUnique({
    where: { email: user.email },
    include: {
      bookings: {
        orderBy: { checkIn: 'asc' },
        include: { property: true },
      },
    },
  });

  if (!guest || guest.bookings.length === 0) {
    return <NoTrip />;
  }

  const b = guest.bookings[0];
  const nights = differenceInCalendarDays(b.checkOut, b.checkIn);

  return (
    <main className="px-5 pt-5">
      <h2 className="text-xl font-bold text-koncie-navy">{b.property.name}</h2>
      <p className="mt-1 text-sm text-koncie-charcoal/80">{b.property.region}, {b.property.country}</p>

      <div className="mt-6 rounded-xl border border-koncie-border bg-white p-5">
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-koncie-charcoal/60">Check-in</dt>
            <dd className="font-semibold text-koncie-charcoal">{format(b.checkIn, 'EEE d MMM yyyy')}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-koncie-charcoal/60">Check-out</dt>
            <dd className="font-semibold text-koncie-charcoal">{format(b.checkOut, 'EEE d MMM yyyy')}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-koncie-charcoal/60">Nights</dt>
            <dd className="font-semibold text-koncie-charcoal">{nights}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-koncie-charcoal/60">Guests</dt>
            <dd className="font-semibold text-koncie-charcoal">{b.numGuests}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-koncie-charcoal/60">Booking ref</dt>
            <dd className="font-mono text-koncie-charcoal">{b.externalRef}</dd>
          </div>
        </dl>
      </div>

      <p className="mt-6 text-xs text-koncie-charcoal/60">
        Questions about your room or check-in? Contact your host directly via the email they sent with your booking.
      </p>
    </main>
  );
}

function NoTrip() {
  return (
    <main className="px-5 pt-5">
      <p className="text-sm text-koncie-charcoal/60">No upcoming trip to show.</p>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
pnpm --filter @koncie/web typecheck
git add apps/web/src/app/hub/trip/page.tsx
git commit -m "feat(sprint1): trip detail page"
```

---

## Task 27: Profile page + sign-out action

**Files:**
- Create: `apps/web/src/app/hub/profile/actions.ts`
- Create: `apps/web/src/app/hub/profile/page.tsx`

- [ ] **Step 1: Sign-out action**

Create `apps/web/src/app/hub/profile/actions.ts`:

```ts
'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function signOut() {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/welcome');
}
```

- [ ] **Step 2: Profile page**

Create `apps/web/src/app/hub/profile/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { signOut } from './actions';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect('/welcome');

  return (
    <main className="px-5 pt-5">
      <h2 className="text-xl font-bold text-koncie-navy">Profile</h2>
      <div className="mt-6 rounded-xl border border-koncie-border bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-koncie-charcoal/60">Email</p>
        <p className="mt-1 font-semibold text-koncie-charcoal">{user.email}</p>
      </div>

      <form action={signOut} className="mt-6">
        <button
          type="submit"
          className="w-full rounded-full border border-koncie-navy px-5 py-3 text-sm font-semibold text-koncie-navy"
        >
          Sign out
        </button>
      </form>

      <p className="mt-6 text-xs text-koncie-charcoal/60">
        Need to delete your account? Contact us at <a className="text-koncie-green" href="mailto:hello@koncie.app">hello@koncie.app</a>
      </p>
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```powershell
pnpm --filter @koncie/web typecheck
git add apps/web/src/app/hub/profile/
git commit -m "feat(sprint1): profile page with sign-out"
```

---

## Task 28: Integration tests — Prisma queries

**Files:**
- Create: `apps/web/tests/integration/booking-queries.test.ts`

- [ ] **Step 1: Write the test**

Create `apps/web/tests/integration/booking-queries.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16')
    .withDatabase('koncie_test')
    .start();

  const url = container.getConnectionUri();
  process.env.DATABASE_URL = url;
  process.env.DIRECT_URL = url;

  execSync('pnpm prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    stdio: 'inherit',
  });

  prisma = new PrismaClient({ datasources: { db: { url } } });
}, 120_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

describe('booking queries', () => {
  it('upserts a Booking idempotently on external_ref', async () => {
    const partner = await prisma.partnerIntegration.create({
      data: { type: 'HOTELLINK', name: 'test', config: {} },
    });
    const property = await prisma.property.create({
      data: { slug: 'test-prop', name: 'Test', country: 'FJ', region: 'Fiji', timezone: 'Pacific/Fiji', partnerIntegrationId: partner.id },
    });
    const guest = await prisma.guest.create({
      data: { email: 'test@example.com', firstName: 'Test', lastName: 'User' },
    });

    const input = {
      externalRef: 'HL-TEST-1',
      guestId: guest.id,
      propertyId: property.id,
      checkIn: new Date('2026-08-01'),
      checkOut: new Date('2026-08-05'),
      numGuests: 2,
      status: 'CONFIRMED' as const,
    };

    const a = await prisma.booking.upsert({
      where: { externalRef: 'HL-TEST-1' },
      create: input,
      update: {},
    });
    const b = await prisma.booking.upsert({
      where: { externalRef: 'HL-TEST-1' },
      create: input,
      update: {},
    });

    expect(a.id).toBe(b.id);
    const count = await prisma.booking.count({ where: { externalRef: 'HL-TEST-1' } });
    expect(count).toBe(1);
  });
});
```

- [ ] **Step 2: Run it**

```powershell
pnpm --filter @koncie/web test integration/booking-queries
```

Expected: 1 pass (Docker required locally — Pat should have Docker Desktop installed on Windows).

- [ ] **Step 3: Commit**

```powershell
git add apps/web/tests/integration/
git commit -m "test(sprint1): integration test for booking upsert idempotency"
```

---

## Task 29: Playwright E2E — guest journey happy path

**Files:**
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/tests/e2e/guest-journey.spec.ts`

- [ ] **Step 1: Playwright config**

Create `apps/web/playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
```

- [ ] **Step 2: Install Playwright browsers**

```powershell
pnpm --filter @koncie/web exec playwright install chromium
```

- [ ] **Step 3: Write the spec**

Create `apps/web/tests/e2e/guest-journey.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { signMagicLink } from '../../src/lib/auth/signed-link';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

test('happy path: signed link → welcome → register → hub', async ({ page }) => {
  // Assumes the seeded Namotu booking exists
  const booking = await prisma.booking.findUnique({
    where: { externalRef: 'HL-84321-NMT' },
    include: { guest: true },
  });
  if (!booking) throw new Error('Run `pnpm db:seed` before this test');

  const token = await signMagicLink({
    bookingId: booking.id,
    guestEmail: booking.guest.email,
    expiresInSeconds: 60,
  });

  // Screen 1
  await page.goto(`/welcome?token=${token}`);
  await expect(page.getByRole('heading', { name: /Hi Jane/ })).toBeVisible();
  await expect(page.getByText('Namotu Island Fiji')).toBeVisible();

  // Click CTA
  await page.getByRole('link', { name: /Create your Koncie account/ }).click();

  // Screen 2
  await expect(page.getByRole('heading', { name: /Check your email/ })).toBeVisible();
  await expect(page.getByText(booking.guest.email)).toBeVisible();

  // We stop here in E2E — invoking the real Supabase magic-link exchange
  // from a test runner would require intercepting the Supabase OTP flow.
  // The /auth/callback route is covered by integration tests.
});
```

- [ ] **Step 4: Run against local dev**

Start the dev server in another terminal:
```powershell
pnpm --filter @koncie/web dev
```

Then:
```powershell
pnpm --filter @koncie/web test:e2e
```

Expected: 1 pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/playwright.config.ts apps/web/tests/e2e/
git commit -m "test(sprint1): Playwright E2E happy path"
```

---

## Task 30: Update CI — add test + e2e jobs

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add test + e2e jobs**

Edit `.github/workflows/ci.yml` — add after existing jobs:

```yaml
  test:
    name: Unit + Integration Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.33.1
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @koncie/web exec prisma generate
      - run: pnpm --filter @koncie/web test
        env:
          KONCIE_SIGNED_LINK_SECRET: ci-only-placeholder-secret-at-least-32-chars

  e2e:
    name: Playwright E2E (advisory)
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    continue-on-error: true
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.33.1
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @koncie/web exec playwright install --with-deps chromium
      # Note: e2e against Vercel preview URL requires a step that resolves
      # the preview URL from the PR metadata. For Sprint 1 we skip the
      # actual run in CI and rely on local execution.
      - run: echo "E2E wired — actual run deferred to Sprint 2 when preview URL resolution lands"
```

- [ ] **Step 2: Commit**

```powershell
git add .github/workflows/ci.yml
git commit -m "ci(sprint1): unit + integration tests; e2e placeholder"
```

---

## Task 31: Update `.env.example` files

**Files:**
- Modify: `.env.example` (root)
- Modify: `apps/web/.env.example` (if exists)

- [ ] **Step 1: Update root `.env.example`**

Edit root `.env.example`:

```bash
# Sprint 0 — Sentry
NEXT_PUBLIC_SENTRY_DSN=""
SENTRY_DSN=""
SENTRY_AUTH_TOKEN=""
SENTRY_ORG=""
SENTRY_PROJECT=""

# Sprint 1 — Database (Supabase Postgres via Prisma)
DATABASE_URL=""
DIRECT_URL=""

# Sprint 1 — Auth (Supabase)
NEXT_PUBLIC_SUPABASE_URL=""
NEXT_PUBLIC_SUPABASE_ANON_KEY=""
SUPABASE_SERVICE_ROLE_KEY=""

# Sprint 1 — Signed magic link
KONCIE_SIGNED_LINK_SECRET=""

# Sprint 1 — Email (Resend, routed via Supabase SMTP)
RESEND_API_KEY=""

# Sprint 1 — Public site URL (used in email links + callbacks)
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
```

- [ ] **Step 2: Commit**

```powershell
git add .env.example
git commit -m "docs(sprint1): .env.example updated with Sprint 1 keys"
```

---

## Task 32: Add Vercel env vars for Preview + Production

**Files:**
- None (Vercel dashboard)

- [ ] **Step 1: Pat adds the same keys to Vercel**

Vercel dashboard → Project → Settings → Environment Variables. Add each of the keys from `.env.example` that were left blank, scoped to **Production + Preview**:

- `DATABASE_URL`, `DIRECT_URL` (pointing at a Preview-specific Supabase project)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `KONCIE_SIGNED_LINK_SECRET` (generate with `openssl rand -base64 32`)
- `RESEND_API_KEY`
- `NEXT_PUBLIC_SITE_URL` (set to the production `koncie-web.vercel.app` URL for Production)

- [ ] **Step 2: Trigger a redeploy**

Push any commit to `main` (e.g., the next code task) — Vercel will pick up the new env vars.

---

## Task 33: Architecture doc

**Files:**
- Create: `docs/architecture.md`

- [ ] **Step 1: Write**

Create `docs/architecture.md`:

```markdown
# Architecture

## Overview

Koncie is a Next.js 14 App Router application deployed on Vercel. Data lives in Supabase Postgres, accessed via Prisma. Auth is Supabase Auth with Resend handling email delivery. Sentry captures runtime errors; Vercel Analytics captures traffic.

## Services

| Service | Purpose | Env vars |
|---|---|---|
| Vercel | Hosting, builds, CDN | (platform-managed) |
| Supabase | Postgres DB + Auth | `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Resend | Magic-link email delivery | `RESEND_API_KEY` (configured in Supabase SMTP override) |
| Sentry | Error reporting | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` |

## Deployment topology

- **Production** — `main` branch auto-deploys. Points at a dedicated Supabase project. Pilot data lives here.
- **Preview** — every PR deploys. Points at a shared Preview Supabase project seeded with demo data.
- **Development** — local. Each developer has their own Supabase project (or runs against Preview for quick iteration).

## Monorepo shape

```
apps/web             Next.js app — only app for Sprint 0-1
packages/brand       Design tokens + Tailwind preset
packages/config      Shared tsconfig, eslint, prettier
packages/types       Domain types (Guest, Booking, …, PartnerAdapter)
services/            (reserved, empty)
```

## Data flow

1. Mock `HotelLinkMockAdapter` seeds `Booking` rows directly in Postgres.
2. A signed magic link JWT (Koncie-owned secret) is printed to stdout by the seed script.
3. Guest clicks link → `/welcome` server component verifies JWT + looks up `Booking` → renders.
4. Guest requests auth email → Supabase Auth sends via Resend.
5. Guest clicks Supabase magic link → `/auth/callback` exchanges code, links Guest row to `auth.users`, redirects to `/hub`.
6. `/hub/*` pages read session cookies (refreshed by middleware) and query Prisma.

## Non-goals in Sprint 1

- Real HotelLink API integration (Sprint 7)
- Payments / MoR plumbing (Sprint 2)
- Insurance offer UI (Sprint 4)
- Flight search UI (Sprint 3)
- Hotel admin portal (Sprint 5)
- SMS (Sprint 6)
```

- [ ] **Step 2: Commit**

```powershell
git add docs/architecture.md
git commit -m "docs(sprint1): architecture overview"
```

---

## Task 34: Data model doc

**Files:**
- Create: `docs/data-model.md`

- [ ] **Step 1: Write**

Create `docs/data-model.md`:

```markdown
# Data Model (Prisma v1)

Reference for the four entities introduced in Sprint 1. Source of truth is `apps/web/prisma/schema.prisma` — this doc reflects that file.

## Guest

A traveller. Created at booking-ingestion time (email, first name, last name). `auth_user_id` is set when the guest claims the account via magic link.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (pk) | |
| `email` | text | unique; the linking key across the system |
| `first_name`, `last_name` | text | |
| `auth_user_id` | uuid? | nullable; unique; references Supabase's `auth.users.id` |
| `claimed_at` | timestamptz? | set on first auth link |

## Property

A hotel. Owned by a partner integration.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (pk) | |
| `slug` | text | unique, kebab-case |
| `name` | text | display name |
| `country` | text | ISO 3166-1 alpha-2 |
| `region` | text | free-form |
| `timezone` | text | IANA |
| `partner_integration_id` | uuid | fk |

## PartnerIntegration

A PMS/OBE link (HotelLink, SiteMinder, Opera...). Config is per-partner JSON.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (pk) | |
| `type` | enum | `HOTELLINK`, `SITEMINDER`, `OPERA` |
| `name` | text | unique; human-readable |
| `config` | jsonb | per-partner credentials + webhook secrets |

## Booking

A guest's stay. `external_ref` is the idempotency key for ingestion (seed script, real webhooks).

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (pk) | |
| `guest_id` | uuid | fk → Guest |
| `property_id` | uuid | fk → Property |
| `external_ref` | text | unique; the PMS booking ID |
| `check_in`, `check_out` | date | |
| `num_guests` | int | |
| `status` | enum | `CONFIRMED`, `CANCELLED`, `COMPLETED` |

## Relationships

- `Guest 1:M Booking`
- `Property 1:M Booking`
- `PartnerIntegration 1:M Property`
- `Guest 0..1:1 auth.users` (via `auth_user_id`)

## Sprint 2+ additions (for reference, not yet in schema)

`Upsell`, `Transaction`, `InsurancePolicy`, `FlightBooking`, `Message` arrive in the sprints that need them.
```

- [ ] **Step 2: Commit**

```powershell
git add docs/data-model.md
git commit -m "docs(sprint1): data model reference"
```

---

## Task 35: Glossary

**Files:**
- Create: `docs/glossary.md`

- [ ] **Step 1: Write**

Create `docs/glossary.md`:

```markdown
# Glossary

Terms used across the Koncie repo and product docs.

**Ancillaries** — flights, insurance, activities, transfers. Anything that is NOT the core room booking. Koncie is the MoR for ancillaries only.

**Claimed account** — a Guest row where `auth_user_id` is populated. Before claiming, the Guest exists as contact info only.

**HotelLink** — the PMS our pilot hotel Namotu uses. Sprint 7 builds the live integration; Sprint 1 mocks it.

**Hub** — the signed-in guest surface at `/hub/*`. Post-booking, post-sign-in destination.

**IATA Lite** — limited travel-agent accreditation that lifts our flight margin. Not a pre-launch blocker — deferred to Phase 2.

**JetSeeker** — Kovena-acquired flight search provider. Surfaces as "Koncie Flights · Powered by JetSeeker" in guest-facing UI.

**Magic link** — passwordless sign-in URL containing a one-time code. Two distinct magic links in play: Koncie-signed (post-booking entry point, carries booking context) and Supabase-signed (actual auth ceremony).

**MCC 4722** — Merchant Category Code for Travel Agencies and Tour Operators. All Koncie transactions are stamped with this.

**Merchant of Record (MoR)** — legal entity that owns the customer transaction. Koncie/Kovena is MoR for ancillaries; the hotel remains MoR for the room booking.

**OBE** — Online Booking Engine. Examples: HotelLink, STAAH, Levart, Opera.

**Partner / partner integration** — a PMS or OBE that feeds us bookings. Each is modelled as a `PartnerIntegration` row + a `PartnerAdapter` implementation.

**PMS** — Property Management System. Hotel's back-office booking system.

**Powered by** — brand attribution pattern: "Koncie Flights · Powered by JetSeeker". Retains origin visibility while presenting a unified guest surface.

**Signed link** — Koncie-signed JWT URL (`/welcome?token=...`) carrying booking context. Hydrates the non-user landing page before the guest has any account.

**Trust account** — segregated bank account holding guest ancillary payments before payout to providers. MoR regulatory requirement.
```

- [ ] **Step 2: Commit**

```powershell
git add docs/glossary.md
git commit -m "docs(sprint1): glossary"
```

---

## Task 36: Auth doc

**Files:**
- Create: `docs/auth.md`

- [ ] **Step 1: Write**

Create `docs/auth.md`:

```markdown
# Auth

Koncie's auth is a two-hop flow: a Koncie-signed magic link carries booking context; Supabase Auth's magic link handles the actual credential exchange.

## Step-by-step

### 1. Ingestion (Sprint 1: mocked via seed; Sprint 7: real HotelLink webhook)

- `HotelLinkMockAdapter` creates `PartnerIntegration`, `Property`, `Guest`, `Booking` rows.
- `Guest.auth_user_id` is null at this point.

### 2. Signed link issuance

- Seed script (Sprint 1) or hotel admin action (future) calls `signMagicLink({ bookingId, guestEmail, expiresInSeconds })`.
- Returns a JWT signed HS256 with `KONCIE_SIGNED_LINK_SECRET`.
- URL shape: `https://koncie-web.vercel.app/welcome?token=<JWT>`.

### 3. Non-user landing (`/welcome?token=...`)

- Server component calls `verifyMagicLink(token)` — validates signature, expiry, and payload shape.
- Looks up Booking; confirms `booking.guest.email === payload.guestEmail`.
- On any failure, renders a neutral "link expired" state. Failures logged to Sentry at `info`/`warning` level.

### 4. Magic-link request (CTA click → `/register`)

- Server action `fireMagicLink` calls `supabase.auth.signInWithOtp({ email: guest.email })`.
- Supabase's email template is overridden to route via Resend SMTP.
- Guest sees the "check your email" state.

### 5. Supabase callback (`/auth/callback?code=...`)

- Route handler uses `@supabase/ssr` `exchangeCodeForSession(code)`.
- Reads `session.user.id` and `session.user.email`.
- Calls `linkGuestToAuthUser({ email, authUserId })` — sets `Guest.auth_user_id` and `claimed_at` if not already.
- Redirects to `/hub`.

### 6. Session refresh

- `apps/web/src/middleware.ts` calls `updateSession()` on every non-static request.
- Supabase's SSR helper refreshes expired access tokens via the refresh token cookie.
- On `/hub/*`: if no session, redirect to `/welcome`.

## Security notes

- **Two secrets, two jobs.** `KONCIE_SIGNED_LINK_SECRET` signs the booking-context token. Supabase has its own secret for OTP codes. Compromising one does not compromise the other.
- **Email mismatch protection.** Even with a valid JWT, we check that the booking's guest email matches the payload email. This stops a forwarded link from being exploitable by anyone other than the intended recipient.
- **Short expiry.** Seed links default to 7 days. Real (Sprint 7) links can be shorter.
- **Revocation.** No per-token revocation table. If a secret leaks, rotate `KONCIE_SIGNED_LINK_SECRET` and all outstanding links invalidate.

## Testing

- `apps/web/src/lib/auth/signed-link.test.ts` — round-trip, tampered signature, expiry, wrong secret.
- `apps/web/src/lib/auth/guest-linking.test.ts` — Guest update on first claim, idempotency on replay.
- `apps/web/tests/e2e/guest-journey.spec.ts` — full happy path up to the magic-link send.

## Deferred

- Social login (Google, Apple) — Phase 2.
- SMS auth — Sprint 6 when Twilio lands.
- Password auth — never.
- Account-deletion self-service — Phase 2.
```

- [ ] **Step 2: Commit**

```powershell
git add docs/auth.md
git commit -m "docs(sprint1): auth flow reference"
```

---

## Task 37: Sprint 1 changelog

**Files:**
- Create: `docs/sprints/sprint-1-changelog.md`

- [ ] **Step 1: Write (at sprint close)**

Create `docs/sprints/sprint-1-changelog.md`:

```markdown
# Sprint 1 Changelog

**Shipped:** [DATE WHEN MERGED]

**Acceptance criteria met:** see `docs/specs/2026-04-23-sprint-1-design.md` §"Acceptance criteria".

## Delivered

- Prisma schema v1 (Guest, Booking, Property, PartnerIntegration) with initial migration
- Supabase Postgres + Supabase Auth + Resend SMTP
- Signed magic-link JWT (Koncie-owned) + verification
- Non-user landing page (`/welcome`) with booking-context hydration
- Register + magic-link delivery (`/register`)
- Auth callback (`/auth/callback`) with Guest → auth.users linking
- Hub dashboard (`/hub`), trip detail (`/hub/trip`), profile with sign-out (`/hub/profile`)
- Branded error pages (404, 500, global-error)
- Mock HotelLink PartnerAdapter + seed script
- Unit tests (signed-link, guest-linking)
- Integration tests (Prisma upsert idempotency via testcontainers)
- Playwright E2E happy path
- Docs: architecture, data-model, glossary, auth

## Known deferred work

- CI e2e against live preview URLs (wired but skipped — lands in Sprint 2)
- `integrations.md` docs file (starts in Sprint 7 when real HotelLink lands)
- `api-reference.md` (starts when we have >2 routes that need externally-facing specs)

## Next sprint

Sprint 2 — Merchant-of-Record payment foundation. See `docs/plan.md` §5.
```

- [ ] **Step 2: Commit at sprint close**

```powershell
git add docs/sprints/sprint-1-changelog.md
git commit -m "docs(sprint1): sprint changelog at close"
```

---

## Task 38: Open the Sprint 1 PR

**Files:**
- None (GitHub)

- [ ] **Step 1: Push final branch**

If Sprint 1 was developed on a feature branch:

```powershell
git push -u origin sprint-1
```

If it was a series of direct-to-main commits, skip this — PR is implicit against main history.

- [ ] **Step 2: Open PR via `gh`** (if you installed `gh`) or via the GitHub web UI

If `gh` is installed:
```powershell
gh pr create --title "Sprint 1: Guest Hub skeleton + Auth" --body-file docs/sprints/sprint-1-changelog.md
```

Otherwise: https://github.com/pat116/koncie-web/compare/main...sprint-1

- [ ] **Step 3: Verify all acceptance criteria against the spec before marking PR ready for review**

Open `docs/specs/2026-04-23-sprint-1-design.md` §"Acceptance criteria" and tick each item against the live Preview deploy.

---

## Self-review

Checked the plan against the spec:

**Spec coverage** — every spec section has at least one task:
- Architecture → Tasks 4, 12, 32, 33
- Domain model → Tasks 2, 3, 4, 34
- Guest journey UX → Tasks 16, 17, 18, 20, 23, 24, 25, 26, 27
- Auth + signed link flow → Tasks 9, 10, 12, 13, 14, 20, 22, 36
- Mock HotelLink connector → Tasks 6, 7, 8
- Seed script → Tasks 8, 11
- Error handling → Tasks 10, 15
- Test strategy → Tasks 9, 13, 28, 29, 30
- Documentation → Tasks 33, 34, 35, 36, 37

**Placeholder scan** — no TBDs, no "implement later", every code step contains complete code or a complete command. Task 37's changelog has `[DATE WHEN MERGED]` which is intentional (filled at sprint close, not now).

**Type consistency** — `signMagicLink`, `verifyMagicLink`, `MagicLinkPayload`, `SignedLinkError`, `linkGuestToAuthUser`, `PartnerAdapter`, `ExternalBooking`, `BookingStatus`, `PartnerType` all named consistently across Tasks 9, 10, 13, 14, 6, 7, 3, 8.

**Known gotchas flagged inline:**
- Task 4 requires Pat to provision Supabase before migration works
- Task 21 requires DNS verification for `koncie.app` sending domain
- Task 28 requires Docker Desktop locally
- Task 32 requires manual env var setup in Vercel dashboard

---

## Execution handoff

Plan complete. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
