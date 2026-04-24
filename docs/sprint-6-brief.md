# Sprint 6 — Pre-arrival comms + MessageLog

**Duration:** ~1 week
**Owner:** Claude Code, executing autonomously per Pat's explicit directive (2026-04-24: *"run sprint 6 using claude code, autonomously, with little input from me, always run with your recommendations"*)
**Reference:** `docs/plan.md` §5 Sprint 6, `docs/plan-addendum.md`, Sprint 5 merge commit `1a0027f`
**Baseline:** `main` at `1a0027f` (`Merge pull request #6 from pat116/sprint-5`)

---

## Execution posture

- **Do not wait for approval at intermediate steps.** Every scope decision in this brief is already locked. Execute end-to-end through the verification bar, open the PR, and only ping Pat if something genuinely blocks (e.g., Prisma fails to parse the schema, tests fail for a reason you can't resolve, a required env var is missing with no fallback).
- **Follow the Sprints 1–5 pattern exactly.** Branch `sprint-6` off `main`. One squash-ready commit titled `feat(sprint-6): pre-arrival comms + message log`. Typecheck / lint / test / build must be green before push. Playwright E2E is `continue-on-error` per Sprint 2-polish CI posture.
- **Migrations are applied manually via Supabase SQL Editor after merge** — see §Migration handoff at the end. Do **not** add `prisma migrate deploy` to the build command (already tried in `sprint-5-polish` PR #7, blocked by Vercel IPv6/Supabase direct-connect incompatibility).
- **Style-match prior sprints:** Prisma schema uses `///` triple-slash doc comments only (Prisma rejects `/** */`); tests mock `@/lib/db/prisma` per Sprint 3/4 pattern; route handlers under `__test__/` are guarded by `NODE_ENV !== 'production' || KONCIE_ENABLE_TEST_ROUTES === '1'`.

---

## Goal

Extend Resend (already wired in Sprint 1 for magic-link delivery) into a **full pre-arrival messaging system** with:

1. Every email send persisted to a new `MessageLog` table so `/admin/messages` (Sprint 5 stub) becomes a real per-guest timeline.
2. Three new trigger paths producing real guest-facing emails.
3. Resend webhook ingestion so delivery/bounce status updates land on the MessageLog rows.

This retires the Sprint 5 carry-over `/admin/messages` stub and fills the plan's §5 Sprint 6 slot.

---

## Locked scope

### 1. Schema — `MessageLog`

Add to `apps/web/prisma/schema.prisma` in the Sprint 6 section at the bottom:

```prisma
// ─── Sprint 6 models ─────────────────────────────────────────────────────────

enum MessageKind {
  MAGIC_LINK
  UPSELL_REMINDER_T7
  INSURANCE_REMINDER_T3
  INSURANCE_RECEIPT
  OTHER
}

enum MessageStatus {
  QUEUED
  SENT
  DELIVERED
  BOUNCED
  COMPLAINED
  FAILED
}

/// Audit log of every transactional email Koncie sends. One row per send
/// (not per recipient if bcc/cc, which we don't use). Status is updated by
/// the Resend webhook at /api/resend/webhook. Tenant-scoped for the admin
/// view via guest.bookings.some({ propertyId }).
model MessageLog {
  id                 String        @id @default(uuid()) @db.Uuid
  guestId            String?       @map("guest_id") @db.Uuid
  guest              Guest?        @relation(fields: [guestId], references: [id])
  bookingId          String?       @map("booking_id") @db.Uuid
  booking            Booking?      @relation(fields: [bookingId], references: [id])
  kind               MessageKind
  templateId         String        @map("template_id")
  recipientEmail     String        @map("recipient_email")
  subject            String
  status             MessageStatus @default(QUEUED)
  providerMessageId  String?       @unique @map("provider_message_id")
  failureReason      String?       @map("failure_reason")
  metadata           Json          @default("{}")
  sentAt             DateTime?     @map("sent_at") @db.Timestamptz
  deliveredAt        DateTime?     @map("delivered_at") @db.Timestamptz
  createdAt          DateTime      @default(now()) @map("created_at") @db.Timestamptz
  updatedAt          DateTime      @updatedAt @map("updated_at") @db.Timestamptz

  @@index([guestId, createdAt])
  @@index([bookingId, createdAt])
  @@index([kind, status, createdAt])
  @@map("message_logs")
}
```

Add back-relations on existing models:
- `Guest`: `messageLogs MessageLog[]`
- `Booking`: `messageLogs MessageLog[]`

### 2. Migration — hand-written, matches Sprint 4/5 pattern

File: `apps/web/prisma/migrations/20260424180000_sprint_6_messaging/migration.sql`

Creates: `MessageKind` + `MessageStatus` enums, `message_logs` table, three indexes, two FKs (both `ON DELETE SET NULL` so guest/booking deletion doesn't cascade into audit). Also a unique index on `provider_message_id`.

### 3. Seed update — `apps/web/prisma/seed.ts`

- Add `prisma.messageLog.deleteMany({})` at the top of the FK-safe delete order.
- Seed **one example MessageLog row** per demo guest so the admin `/admin/messages` view isn't empty on a fresh seed: kind `MAGIC_LINK`, status `DELIVERED`, linked to the seeded Jane Demo guest, `sentAt` = now, `deliveredAt` = now. Use `providerMessageId = 'seed-' + crypto.randomUUID()`.

### 4. Messaging lib — new folder `apps/web/src/lib/messaging/`

Files:
- `send.ts` — exports `sendMessage(params)` which:
  1. Renders the template (subject + html + text) via React Email
  2. Inserts a `MessageLog` row with `status: QUEUED`
  3. Calls Resend's `emails.send(...)` with `tags: [{ name: 'message_log_id', value: <uuid> }]` so the webhook can match back
  4. On success: updates the row with `providerMessageId`, `status: SENT`, `sentAt: now`
  5. On failure: updates the row with `status: FAILED`, `failureReason: <message>`; swallows the throw (log via Sentry) so a messaging outage doesn't break upstream flows
- `templates/index.ts` — template registry keyed by `templateId: string`
- `templates/magic-link.ts` — existing magic-link (refactored from `src/app/register/actions.ts` and `src/app/actions.ts`; both files currently construct Resend inline — replace with `sendMessage({ kind: 'MAGIC_LINK', templateId: 'magic-link-v1', ... })`)
- `templates/upsell-reminder-t7.ts` — "Your trip to {{propertyName}} is 7 days away" with a deep link to `/hub`
- `templates/insurance-reminder-t3.ts` — "Protect your trip before you fly" with a deep link to the insurance offer card
- `templates/insurance-receipt.ts` — policy confirmation with policy number
- Each template exports: `{ id: string; subject: (vars) => string; render: (vars) => { html: string; text: string } }`

Template rendering: **React Email components** already installed (`@react-email/components`, `@react-email/render`). Use `<Tailwind>` from `@react-email/tailwind` so the existing Koncie brand tokens (navy / sand / green) render consistently.

### 5. Triggers — Vercel Cron endpoint

- `apps/web/src/app/api/cron/pre-arrival/route.ts` — GET handler, no auth (Vercel Cron hits this via a signed header; we verify `Authorization: Bearer ${CRON_SECRET}`)
- Logic:
  - Query guests with a `CONFIRMED` booking `checkIn` between `now + 6d 12h` and `now + 7d 12h` — fire `UPSELL_REMINDER_T7` unless one was already sent for that (guestId, bookingId, kind) in the last 14 days
  - Query guests with a `CONFIRMED` booking `checkIn` between `now + 2d 12h` and `now + 3d 12h` AND no active `InsurancePolicy` — fire `INSURANCE_REMINDER_T3` unless already sent in last 14 days
  - Idempotent: re-invoking the same cron within the same hour is a no-op for already-dispatched rows
- `apps/web/vercel.json` — add Vercel Cron config (once per day at `0 2 * * *` UTC = midday Sydney): `{ "crons": [{ "path": "/api/cron/pre-arrival", "schedule": "0 2 * * *" }] }`
- New env vars Pat needs to set in Vercel:
  - `CRON_SECRET` — shared secret Vercel Cron injects as `Authorization: Bearer`. Generate a 32-char random string; document in PR body that Pat must set this in Vercel.
  - `RESEND_WEBHOOK_SECRET` — for HMAC verification of Resend events; Pat sets this to match the secret he'll configure in Resend dashboard

### 6. Resend webhook — `apps/web/src/app/api/resend/webhook/route.ts`

- POST handler. Body is raw JSON (don't parse before signature verification).
- Verify HMAC: Resend signs events with `svix-signature` / `svix-timestamp` / `svix-id` headers. Use the `svix` package (already a transitive dep of Resend; add as direct dep if not resolvable).
- On verified event, switch on `event.type`:
  - `email.sent` → no-op (already set by `send.ts`)
  - `email.delivered` → update MessageLog (match by `providerMessageId`) to `status: DELIVERED`, `deliveredAt: now`
  - `email.bounced` → `status: BOUNCED`, `failureReason: bounce.reason`
  - `email.complained` → `status: COMPLAINED`
  - `email.delivery_delayed` → leave status as SENT but write to `metadata.delayedAt`
  - unknown types → log to Sentry with breadcrumb, return 200 (Resend retries 5xx)
- Return 200 with `{ ok: true }` on success, 400 on invalid signature, 500 on DB error (Resend will retry).

### 7. Admin `/admin/messages` — backfill from stub

- `apps/web/src/lib/admin/queries.ts` — add:
  ```ts
  listMessagesForProperty(propertyId, limit = 100): Promise<AdminMessageRow[]>
  ```
  Joins via guest→bookings→propertyId scoping (same shape as Sprint 5's other admin queries).
- `apps/web/src/app/(admin)/admin/messages/page.tsx` — replace stub body with a real table:
  - Columns: When (createdAt) · Guest · Kind (enum badge) · Subject · Status (pill: QUEUED/SENT/DELIVERED/BOUNCED etc.) · Delivered (deliveredAt)
  - Match visual vocabulary of the existing Sprint 5 admin tables (koncie-sand header, koncie-border rows, brand-green for DELIVERED, destructive for BOUNCED/FAILED/COMPLAINED)

### 8. Tests — expected ~20 new

Follow Sprint 5's `any`-typed Prisma mock policy; use `vi.hoisted()` for `redirect` mocks. Expected breakdown:

- `lib/messaging/send.test.ts` — 5 tests (happy path: inserts QUEUED then updates SENT; Resend failure path writes FAILED + swallows; template lookup by id; recipient email from guest record; metadata pass-through)
- `lib/messaging/templates/*.test.ts` — 1 test per template (renders without throwing, subject + html non-empty, critical variables substituted)
- `app/api/resend/webhook/route.test.ts` — 5 tests (valid signature + delivered; bounced; invalid signature → 400; unknown event → 200 + Sentry breadcrumb; missing MessageLog match → no-op 200)
- `app/api/cron/pre-arrival/route.test.ts` — 5 tests (fires T-7 upsell reminder for guests in window; skips already-dispatched; fires T-3 insurance reminder only when no active policy; bearer auth rejects bad token; happy path returns counts)
- `lib/admin/queries.test.ts` — extend with 2 tests for `listMessagesForProperty` (tenant scoping, limit respected, ordering by createdAt desc)

### 9. Playwright E2E — `apps/web/tests/e2e/messages.spec.ts`

Sign in as seed admin, navigate to `/admin/messages`, assert the seeded-on-DB-reset MessageLog row renders with kind "Magic Link" and status DELIVERED. `continue-on-error` in CI.

### 10. Env vars to document in PR body

Pat must add these in Vercel before the cron actually works. Build succeeds without them (they're only used at runtime by the cron + webhook endpoints):

- `CRON_SECRET` — any 32+ char random string (production only; build won't need it)
- `RESEND_WEBHOOK_SECRET` — matches the secret set in Resend dashboard → Webhooks

---

## Out of scope

- SMS via Twilio (keeps scope focused; Twilio integration is a standalone sprint)
- Opt-out / unsubscribe tracking (compliance sprint later)
- Campaign / broadcast sends (transactional only)
- In-app message center for guests (email-only channel)
- Multi-language templates (English only)
- Scheduled one-off sends from the admin UI (transactional triggers only)

---

## Verification bar

Identical to Sprints 1–5:

```
pnpm -r typecheck   # clean across packages/brand, packages/types, apps/web
pnpm -r lint        # clean (pre-existing warnings OK; no new ones)
pnpm -r test        # all tests green (Sprint 5 baseline = ~99 tests; Sprint 6 target ~119)
pnpm -r build       # green; stop `next dev` before building if you see EPERM on query_engine-windows.dll.node
```

Pat's Windows/OneDrive environment has known issues — see `CLAUDE.md` and the Sprint 4/5 handoff notes. If you hit them, document the workaround in the PR body; don't fight them unnecessarily.

---

## PR and handoff

- Branch: `sprint-6` off `main@1a0027f`
- Commit message: `feat(sprint-6): pre-arrival comms + message log`
- PR title: `feat(sprint-6): pre-arrival comms + message log`
- PR body should include (in this order):
  1. Short summary
  2. Locked scope recap (in scope / out of scope)
  3. Architecture notes (MessageLog model, send.ts wrapper, trigger selection logic, webhook signature verification)
  4. **Migration handoff instructions** (see next section — copy-paste ready)
  5. **Env var handoff instructions** — Pat must add `CRON_SECRET` and `RESEND_WEBHOOK_SECRET` in Vercel before the cron + webhook endpoints work at runtime. Include the exact Vercel dashboard URL.
  6. Test count delta (`Sprint 5 baseline: X passing. Sprint 6 adds N tests; total Y.`)
  7. Follow-ups deferred to Sprint 7+

---

## Migration handoff (paste into PR body)

Vercel builds cannot run `prisma migrate deploy` against Supabase — the direct-connect URL is IPv6-only and Vercel build infra is IPv4. After merging Sprint 6, Pat must apply the migration manually:

1. Open <https://supabase.com/dashboard/project/efsdbymntrmeuuzrrmvf/sql/new>
2. Copy the contents of `apps/web/prisma/migrations/20260424180000_sprint_6_messaging/migration.sql`
3. Wrap with `BEGIN; ... COMMIT;`
4. Append the Prisma bookkeeping insert:
   ```sql
   INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
   VALUES (gen_random_uuid(), 'manual-applied-via-supabase-sql-editor', NOW(), '20260424180000_sprint_6_messaging', NULL, NULL, NOW(), 1);
   ```
5. Run, choose "Run without RLS" on the warning
6. Verify with `SELECT migration_name FROM "_prisma_migrations" ORDER BY started_at;` — should now show 7 rows

Production `/admin/messages` will still return 500 until this migration is applied.

---

## Known environment friction

- **Windows + OneDrive:** Pat's repo is under OneDrive. Git operations occasionally lock `.git/index` or fail to delete directories (`prisma/migrations/20260424160000_sprint_5_admin` caused grief on Sprint 5). Workarounds: `git reset --hard origin/main` to skip dirty-tree delete-retry; `Remove-Item .git/index.lock -Force` if index is stuck.
- **Playwright E2E in CI:** marked `continue-on-error` per Sprint 2-polish. DB-in-CI is still an open c/o; if Playwright fails in CI, that's expected and non-blocking.
- **`prisma generate` EPERM** when `next dev` is running — stop dev server before running prisma commands manually. Postinstall's generate runs before dev server exists, so fresh installs are fine.
- **OneDrive file truncation** when reading via Linux sandbox mount — not relevant to Claude Code (runs natively on Windows).

---

## Sprint 7 preview (not this sprint)

Per `docs/plan.md` §5 Sprint 7: **HotelLink connector**. Webhook booking ingestion, signed invite-link generation, partner-sandbox E2E. HotelLink is Kovena-owned per addendum §1 so this is an internal integration, not a partner-channel dance. The MessageLog built this sprint gives Sprint 7 a ready-made surface for the "your Koncie account is ready" email that fires on HotelLink booking webhook receipt.
