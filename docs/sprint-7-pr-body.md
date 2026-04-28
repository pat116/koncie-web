# PR creation handoff

**Branch pushed:** `sprint-7` → `origin/sprint-7` (commit `d9ab02c`).

**Open PR:** https://github.com/pat116/koncie-web/pull/new/sprint-7

**Title:** `feat(sprint-7): hotellink connector`

**Base branch:** the Sprint 6 PR (#8) is still open, so this branch is forked off `sprint-6`. Either:
- Wait for #8 to merge into `main`, then open PR #9 with base `main`, or
- Open PR #9 now with base `sprint-6` and rebase onto `main` after #8 merges.

---

## Summary

Sprint 7 plugs Koncie's first real **inbound booking source** end-to-end. Ingests a HotelLink booking via HMAC-signed webhook, upserts Guest + Booking atomically, and fires a magic-link "account ready" email through the Sprint 6 messaging lib so the guest lands on `/welcome` pre-authenticated against their booking. HotelLink is Kovena-owned, so the payload + signature scheme are defined here; the HotelLink-side emitter wiring is a parallel ops track that can flip on once this is live.

## In scope

- `HOTEL_BOOKING_CONFIRMED` `MessageKind` enum value + `/admin/messages` label "Hotel Confirmed".
- HotelLink webhook payload contract (Zod) + `mockHotelLinkWebhookPayload(overrides?)` helper.
- `apps/web/src/lib/hotellink/` — `ingestHotelLinkBooking` (upsert Guest + Booking in a `$transaction`, 14-day MessageLog idempotency, 7-day signed magic-link) and `verifyHotelLinkSignature` (HMAC-SHA256 with 5-minute replay window).
- `/api/webhooks/hotellink` POST handler (200/400/404/500 response matrix tuned for HotelLink's retry semantics).
- React Email template `hotel-booking-confirmed-v1` registered in the Sprint 6 template registry.
- Dev test route `/dev-test/ingest-hotellink-for-seed-guest` mirrors the Sprint 3 Jet Seeker test-route pattern.

## Out of scope (deferred)

- SiteMinder / Opera / other PMS adapters — Phase 2+ per `docs/plan.md`.
- HotelLink MODIFY / CANCEL / DATE_CHANGE event flows — schema is ready (enum has `CANCELLED` + `COMPLETED`), Sprint 8+ will wire the email side.
- Real HotelLink webhook emitter on Kovena's side (ops track).
- De-duplication across HotelLink + OTA bookings for the same guest — Phase 2 OTA QR-code onboarding is a separate sprint.
- Native apps, room upgrade bidding, digital check-in, partner-facing rev-share dashboard — all Phase 2.

## Architecture notes

- **Webhook → verify → ingest → sendMessage** pipeline. The route reads the raw body once, verifies HMAC, then JSON-parses; signature covers the exact bytes HotelLink signed. Signature scheme: `HMAC-SHA256(secret_utf8_bytes, ${timestamp}.${rawBody})` → hex, transported as `X-HotelLink-Signature: sha256=<hex>` with `X-HotelLink-Timestamp: <unix seconds>`. We own this shape end-to-end; no third-party spec to conform to.
- **Ingest is idempotent at two layers.** (1) DB-level: `Booking.externalRef` has a `@unique` constraint, so `prisma.booking.upsert` keyed on `externalRef` handles repeat webhooks. (2) Message-level: the 14-day MessageLog look-back for `(guestId, bookingId, HOTEL_BOOKING_CONFIRMED)` prevents repeat sends (same pattern as the Sprint 6 cron).
- **Only CONFIRMED fires the email.** `CANCELLED` / `COMPLETED` still update the booking row but skip `sendMessage` — when we wire Sprint 8 MODIFY/CANCEL flows, those states will dispatch their own templates.
- **Error-path responses tuned for HotelLink retries:** 400 on bad signature / invalid JSON / invalid payload, 404 on unknown `propertySlug` (stops retry storm), 500 on anything else (retried).
- **Mock adapter replaces Sprint 0/1 scaffolding.** The old `HotelLinkMockAdapter` PartnerAdapter class read from our own DB as a fake integration — Sprint 7 replaces it with a Zod webhook-payload contract because we now accept real (synthetic or live) webhooks instead of polling HotelLink.

## Migration handoff (copy into Supabase SQL Editor post-merge)

After merging, apply via https://supabase.com/dashboard/project/efsdbymntrmeuuzrrmvf/sql/new:

```sql
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

Note: `ALTER TYPE ... ADD VALUE` cannot run inside a transaction on some Postgres versions. If `BEGIN/COMMIT` rejects the `ALTER`, strip the transaction wrapper — the single `ALTER` is atomic at the catalog level and the `INSERT` can commit on its own afterwards. Try the wrapped version first; fall back to unwrapped if Postgres complains.

## Env var handoff

Add in Vercel (Production + Preview) before the webhook is usable at runtime:

- `HOTELLINK_WEBHOOK_SECRET` — any 32+ char random string; must match the value configured on Kovena's HotelLink-side emitter when the real webhook gets wired.

Does **not** block the build — the endpoint returns 500 with a Sentry capture if the secret is missing at runtime.

## Test count delta

- 122 baseline → **146 passing** (+24 new):
  - `adapters/hotellink-mock.test.ts` — 3
  - `lib/hotellink/verify.test.ts` — 5
  - `lib/hotellink/ingest.test.ts` — 9
  - `app/api/webhooks/hotellink/route.test.ts` — 6
  - `lib/messaging/templates/hotel-booking-confirmed.test.ts` — 1
- Playwright e2e `tests/e2e/hotellink.spec.ts` added. `continue-on-error` remains set on the CI Playwright step per Sprint 2-polish posture.

## Verification bar (local, green)

- `pnpm -r typecheck` ✓
- `pnpm -r lint` ✓ (0 errors, 2 pre-existing warnings in files this sprint didn't touch)
- `pnpm -r test` ✓ 146 passing
- `pnpm -r build` ✓ `/api/webhooks/hotellink` route registered

## Test plan

- [ ] Apply the migration block above in Supabase SQL Editor and confirm 8 rows in `_prisma_migrations`.
- [ ] Add `HOTELLINK_WEBHOOK_SECRET` to Vercel env (Production + Preview).
- [ ] Visit `/dev-test/ingest-hotellink-for-seed-guest` on the preview URL while signed in as the seed guest — should redirect to `/hub`.
- [ ] Sign in as seed admin, visit `/admin/messages`, confirm a "Hotel Confirmed" row appears for the Namotu booking.
- [ ] Optional: hit `/api/webhooks/hotellink` with a curl-signed payload to exercise the real webhook path.

## Follow-ups (Sprint 8+)

- HotelLink MODIFY / CANCEL / DATE_CHANGE event flows.
- Phase 2 PMS adapters (SiteMinder, Opera, STAAH, Levart, Abode, ResBook).
- OTA QR-code onboarding + cross-source de-duplication.
- Sprint 8 is pilot hardening: a11y audit, Pacific mobile-web perf, bug bash, pilot hotel staff training, Namotu soft launch.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
