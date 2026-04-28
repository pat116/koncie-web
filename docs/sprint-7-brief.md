# Sprint 7 — HotelLink connector

**Duration:** ~1 week
**Owner:** Claude Code, executing autonomously (same pattern Sprint 6 shipped in — Pat confirmed at end of Sprint 6: *"lets go with sprint 7, once planned execute in claude code via powercell"*)
**Reference:** `docs/plan.md` §5 Sprint 7, `docs/plan-addendum.md` §1 (HotelLink is Kovena-owned, internal integration — no external partner contract), Sprint 6 merge commit `db298a3`
**Baseline:** `main` at `db298a3` (`Merge pull request #8 from pat116/sprint-6`)

---

## Execution posture

- **Do not wait for approval at intermediate steps.** Every scope decision in this brief is locked. Execute end-to-end through the verification bar, open the PR, ping Pat only on a genuine blocker.
- **Follow the Sprints 1–6 pattern exactly.** Branch `sprint-7` off `main`. One squash-ready commit titled `feat(sprint-7): hotellink connector`. Typecheck / lint / test / build green before push. Playwright E2E `continue-on-error` per Sprint 2-polish CI posture.
- **Migrations applied manually via Supabase SQL Editor post-merge** — do **not** add `prisma migrate deploy` to the build command (see `sprint-6-brief.md` §Migration handoff + Sprint 6 PR body for the IPv6-blocked rationale). This sprint adds a single enum-value change, so the SQL is two lines.
- **Mirror the Sprint 4 (CoverMore) + Sprint 3 (Jet Seeker) mock-adapter + test-route pattern.** Real HotelLink webhook wiring on Kovena's internal infrastructure is a parallel track (ops) — this sprint ships the Koncie side so it's ready when Kovena flips the switch.
- **Use the Sprint 6 messaging lib.** `sendMessage` + `MessageLog` are already in place. This sprint adds one new template + one new `MessageKind` enum value, wires them in on successful booking ingest.

---

## Goal

Give Koncie the ability to **ingest a hotel booking from HotelLink** and immediately:

1. Upsert the Guest + Booking atomically (idempotent via `Booking.externalRef` unique constraint from Sprint 2)
2. Dispatch a "Your Koncie account is ready" email containing a signed magic-link claim token that lands the guest on `/welcome` pre-authenticated for their booking
3. Audit the send through `MessageLog` so the admin `/admin/messages` page shows HotelLink-originated confirmations alongside the other kinds

This is the **first surface that pulls a real hotel into Koncie's loop** end-to-end. Sprint 5 built the admin dashboard; Sprint 6 built the messaging audit; Sprint 7 plugs the booking source upstream.

---

## Locked scope

### 1. New `MessageKind` enum value — `HOTEL_BOOKING_CONFIRMED`

Add to `apps/web/prisma/schema.prisma`:

```prisma
enum MessageKind {
  MAGIC_LINK
  UPSELL_REMINDER_T7
  INSURANCE_REMINDER_T3
  INSURANCE_RECEIPT
  HOTEL_BOOKING_CONFIRMED  // ← new
  OTHER
}
```

### 2. Migration — one ALTER TYPE

File: `apps/web/prisma/migrations/20260424200000_sprint_7_hotellink/migration.sql`

```sql
-- Sprint 7: HotelLink connector. Single enum-value addition; no new tables.
ALTER TYPE "MessageKind" ADD VALUE 'HOTEL_BOOKING_CONFIRMED';
```

Also update `apps/web/src/app/(admin)/admin/messages/page.tsx` `KIND_LABEL` record to add `HOTEL_BOOKING_CONFIRMED: 'Hotel Confirmed'`.

Update `apps/web/prisma/seed.ts` `MessageLog` seed row optionally — not strictly required. If easy, change the seeded kind to `HOTEL_BOOKING_CONFIRMED` and subject to "Your Koncie account is ready for Namotu Island Fiji" so the `/admin/messages` demo shows the new kind. Otherwise leave the existing MAGIC_LINK seed untouched.

### 3. HotelLink adapter — mock first

New folder `apps/web/src/adapters/hotellink-mock.ts`:

- Defines `HotelLinkWebhookPayload` shape via Zod:
  ```ts
  z.object({
    bookingRef: z.string().min(1),           // HotelLink's booking reference
    propertySlug: z.string().min(1),          // matches Property.slug (e.g. 'namotu-island-fiji')
    guest: z.object({
      email: z.string().email(),
      firstName: z.string().min(1),
      lastName: z.string().min(1),
    }),
    checkIn: z.string().datetime(),           // ISO 8601
    checkOut: z.string().datetime(),
    numGuests: z.number().int().min(1),
    status: z.enum(['CONFIRMED', 'CANCELLED', 'COMPLETED']),
  })
  ```
- Exports `HotelLinkUnavailableError` (matches `CoverMoreUnavailableError` / `JetSeekerUnavailableError` pattern)
- Provides a `mockHotelLinkWebhookPayload(overrides?)` helper for tests + the dev test route

### 4. HotelLink ingest lib — `apps/web/src/lib/hotellink/`

Files:
- `ingest.ts` — exports `ingestHotelLinkBooking(payload)` which:
  1. Validates payload via Zod
  2. Looks up `Property` by `slug` (throws `PropertyNotFoundError` if missing)
  3. Opens a `prisma.$transaction`:
     - `prisma.guest.upsert` keyed on `email` (create with firstName/lastName, or update lastSeen-like fields if you want)
     - `prisma.booking.upsert` keyed on `externalRef: bookingRef`, bound to `guestId` + `propertyId`, with the dates + numGuests + status
  4. Generates a signed claim link via `signMagicLink({ bookingId, guestEmail, expiresInSeconds: 7*24*60*60 })` (existing helper from Sprint 1)
  5. Fires `sendMessage({ kind: 'HOTEL_BOOKING_CONFIRMED', templateId: 'hotel-booking-confirmed-v1', guestId, bookingId, recipient: email, vars: { firstName, propertyName, checkIn, checkOut, claimLink } })`
  6. Returns `{ guest, booking, messageLogId }` for the caller's response payload
  7. Entire flow is idempotent: second call with same `bookingRef` updates in place, does **not** duplicate the MessageLog (use the same 14-day idempotency check as Sprint 6's cron — query MessageLog for `(guestId, bookingId, kind: HOTEL_BOOKING_CONFIRMED)` in last 14 days; skip `sendMessage` if found)
- `verify.ts` — HMAC-SHA256 signature verification. HotelLink is Kovena-owned so we define the signature scheme ourselves:
  - Header: `X-HotelLink-Signature: sha256=<hex>`
  - Computed as: `HMAC-SHA256(HOTELLINK_WEBHOOK_SECRET, timestampHeader + '.' + rawBody)`
  - Header: `X-HotelLink-Timestamp: <unix seconds>` — reject if > 5 minutes old (replay protection)
  - Export `verifyHotelLinkSignature(rawBody, signatureHeader, timestampHeader, secret): boolean`

### 5. Webhook endpoint — `apps/web/src/app/api/webhooks/hotellink/route.ts`

- POST handler, `export const dynamic = 'force-dynamic'`
- Read raw body as text BEFORE JSON parsing (needed for HMAC verification)
- Pull `X-HotelLink-Signature` + `X-HotelLink-Timestamp` headers
- Verify signature using `HOTELLINK_WEBHOOK_SECRET`; return 400 on mismatch or missing headers, with the Sentry breadcrumb pattern from the Resend webhook (do not log the secret or raw body)
- Parse JSON, call `ingestHotelLinkBooking(payload)` inside a try/catch:
  - On success: return 200 with `{ ok: true, bookingId, messageLogId }`
  - On `PropertyNotFoundError`: return 404 with `{ ok: false, reason: 'property_not_found' }` (HotelLink shouldn't retry-spam unknown properties)
  - On any other error: Sentry capture + return 500 so HotelLink retries

### 6. Template — `apps/web/src/lib/messaging/templates/hotel-booking-confirmed.ts`

React Email template matching the Sprint 6 pattern. Content:
- Subject: `Your Koncie account is ready for {{propertyName}}`
- Body: Friendly 2-paragraph welcome, check-in/check-out dates formatted, single CTA button linking to `${NEXT_PUBLIC_SITE_URL}/welcome?token=${claimToken}` that says "Open your trip hub"
- Use the Koncie brand token inline styles (navy header, sand background, green CTA) matching the other templates
- Register in `apps/web/src/lib/messaging/templates/index.ts`

### 7. Dev-only test route — `apps/web/src/app/dev-test/ingest-hotellink-for-seed-guest/route.ts`

- Mirrors `apps/web/src/app/dev-test/ingest-jetseeker-for-seed-guest/route.ts` from Sprint 3
- NODE_ENV !== 'production' OR `KONCIE_ENABLE_TEST_ROUTES === '1'` guard
- GET handler calls `ingestHotelLinkBooking` directly (skips signature verification for local testing) with a synthesized payload:
  ```ts
  mockHotelLinkWebhookPayload({
    bookingRef: 'HL-TEST-' + Date.now(),
    propertySlug: 'namotu-island-fiji',
    guest: { email: process.env.KONCIE_SEED_EMAIL ?? 'demo@koncie.app', firstName: 'Jane', lastName: 'Demo' },
    checkIn: '2026-08-04T00:00:00Z',
    checkOut: '2026-08-11T00:00:00Z',
  })
  ```
- Redirect 303 → `/hub` so the test flow can continue

### 8. Env vars Pat needs to set in Vercel (document in PR body)

- `HOTELLINK_WEBHOOK_SECRET` — any 32+ char random string; must match the value configured on Kovena's HotelLink-side emitter when the real webhook gets wired
- **Does NOT block build** — the endpoint returns 500 (Sentry-captured) if the secret is missing at runtime

### 9. Tests — target ~22 new; total 122 → ~144 passing

Follow the Sprint 5/6 `any`-typed Prisma mock + `vi.hoisted()` patterns.

- `adapters/hotellink-mock.test.ts` — 3 tests (default payload is valid against Zod, override merges correctly, throws unavailable error on designated trigger email)
- `lib/hotellink/verify.test.ts` — 5 tests (valid signature passes, wrong secret fails, expired timestamp fails, missing header fails, tampered body fails)
- `lib/hotellink/ingest.test.ts` — 8 tests (happy path: upserts Guest + Booking, fires sendMessage; idempotent: second call doesn't duplicate MessageLog within 14-day window; property not found throws; Zod validation error surfaces; transaction rollback on sendMessage failure; signed link generation shape; updates existing guest firstName if changed; status: CANCELLED doesn't fire confirmation email)
- `app/api/webhooks/hotellink/route.test.ts` — 5 tests (valid signature + happy path returns 200; bad signature returns 400; property-not-found returns 404; ingest throws → returns 500 + Sentry; missing signature header returns 400)
- `lib/messaging/templates/hotel-booking-confirmed.test.ts` — 1 test (renders with expected vars, subject + html non-empty)

### 10. Playwright E2E — `apps/web/tests/e2e/hotellink.spec.ts`

- Sign in as seed admin
- Call `/dev-test/ingest-hotellink-for-seed-guest` to trigger a synthetic ingest
- Navigate to `/admin/messages` and assert at least one `HOTEL_BOOKING_CONFIRMED` row exists with kind label "Hotel Confirmed"
- `continue-on-error` per the Sprint 2-polish CI posture

---

## Out of scope

- SiteMinder / Opera / other PMS adapters (Phase 2+ per the plan's 23+ partners trajectory)
- HotelLink booking MODIFY / CANCEL / DATE_CHANGE webhooks (Sprint 8+; the enum has `CANCELLED` + `COMPLETED` status so schema is ready, but ingest logic only fires the confirmation on `CONFIRMED`)
- Room upgrade bidding (Phase 2 per `docs/plan.md`)
- Digital check-in / digital key (Phase 2)
- Partner-facing rev-share dashboard (Phase 2)
- Real HotelLink webhook infrastructure on Kovena's side (ops track, not Koncie code)
- Multi-property admin console (Sprint 5 already scoped to single-tenant)
- De-duplication across HotelLink + OTA bookings for the same guest (Phase 2 — OTA QR-code onboarding is a separate sprint)

---

## Verification bar

Identical to Sprints 1–6:

```
pnpm -r typecheck
pnpm -r lint
pnpm -r test        # target ~144 tests green (122 baseline + ~22 new)
pnpm -r build       # rm -rf apps/web/.next if you see EINVAL readlink on edge-runtime-webpack.js
```

Known Windows/OneDrive friction: the `.next` EINVAL, the occasional `.git/index.lock`, the migration folder delete retry. All documented in `CLAUDE.md` and Sprint 5/6 handoffs. Clean them as they appear; don't fight them.

---

## PR and handoff

- Branch: `sprint-7` off `main@db298a3`
- Commit message: `feat(sprint-7): hotellink connector`
- PR title: same
- PR body structure (matches Sprint 6 pattern):
  1. Short summary (one paragraph)
  2. In scope / out of scope recap
  3. Architecture notes (webhook path, ingest lib, mock adapter, new template + MessageKind enum value)
  4. **Migration handoff** — copy the SQL below exactly so Pat can paste it into the Supabase SQL Editor post-merge
  5. **Env var handoff** — Pat must add `HOTELLINK_WEBHOOK_SECRET` in Vercel (Production + Preview) before the webhook works at runtime
  6. Test count delta
  7. Follow-ups deferred to Sprint 8+

### Migration handoff block (copy this verbatim into the PR body)

```
After merging, apply via https://supabase.com/dashboard/project/efsdbymntrmeuuzrrmvf/sql/new:

BEGIN;

ALTER TYPE "MessageKind" ADD VALUE 'HOTEL_BOOKING_CONFIRMED';

INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (
    gen_random_uuid(),
    'manual-applied-via-supabase-sql-editor',
    NOW(),
    '20260424200000_sprint_7_hotellink',
    NULL,
    NULL,
    NOW(),
    1
);

COMMIT;

SELECT migration_name FROM "_prisma_migrations" ORDER BY started_at;
-- Expect 8 rows after apply.
```

Note: `ALTER TYPE ... ADD VALUE` cannot run inside a transaction in some Postgres versions. If `BEGIN/COMMIT` rejects the ALTER, strip the transaction wrapper — the single ALTER is already atomic at the catalog level and the INSERT can commit on its own after. Try the wrapped version first, fall back to unwrapped if Postgres complains.

---

## Sprint 8 preview (not this sprint)

Per `docs/plan.md` §5 Sprint 8: **Pilot hardening**. Accessibility audit, mobile-web performance tuning against Pacific-representative network profiles, bug bash, pilot hotel staff training materials, soft launch with one Fiji hotel. Sprint 7's HotelLink ingest is the last engineering sprint before pilot hardening; after Sprint 7 merges and migration applies, production has a complete guest-to-admin loop ready for the first Namotu booking.
