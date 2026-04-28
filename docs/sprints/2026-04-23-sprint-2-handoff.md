# Sprint 2 — Windows Handoff Checklist

**Date produced:** 2026-04-23 (Cowork sandbox session)
**For:** Pat to execute in PowerShell on his Windows machine when back at the PC
**Reference:** `docs/plans/2026-04-23-sprint-2-plan.md`, `docs/specs/2026-04-23-sprint-2-design.md`

All Sprint 2 source code landed in this repo (via OneDrive sync from the Cowork sandbox). Sandbox unit tests are green (25 tests passing across three files). What remains is the Windows-only work: install deps, apply the Prisma migration, seed, run E2E, commit, push, open PR.

---

## What shipped from sandbox

### Sandbox test results (all green at end of session)

- `packages/types` — `3 passed` (payment type discrimination + method count + reason union)
- `apps/web/src/lib/money.test.ts` — `11 passed` (formatter × 4, FX × 4, fee split × 3)
- `apps/web/src/adapters/kovena-mock.test.ts` — `10 passed` (tokenize × 4, charge × 5, refund × 1)
- `apps/web/src/app/hub/checkout/actions.test.ts` — `4 passed` (Zod validation × 2, happy path, decline path)

Total: **28 unit tests passing** in sandbox with `decimal.js`, `ulid`, Zod + Next.js mocks. Prisma-client-typed code was not compile-checked in sandbox (proxy-blocked); your Windows typecheck is the first real type gate.

### Files created / modified (37 total)

New files (27):

- `packages/types/src/payments.ts` + `.test.ts`
- `apps/web/src/lib/errors/payments.ts`
- `apps/web/src/lib/money.ts` + `.test.ts`
- `apps/web/src/lib/payments/provider.ts` (DI boundary)
- `apps/web/src/lib/auth/session.ts` (Sprint 1 had no session helper — created per plan Task 20 Step 2)
- `apps/web/src/adapters/kovena-mock.ts` + `.test.ts`
- `apps/web/src/app/hub/checkout/{page,actions,actions.test}.tsx`
- `apps/web/src/app/hub/checkout/{success,failed}/page.tsx`
- `apps/web/src/app/hub/activities/page.tsx` + `[id]/page.tsx`
- `apps/web/src/app/payment/page.tsx`
- `apps/web/src/components/activities/{activity-card,price-pair}.tsx`
- `apps/web/src/components/checkout/{card-form,saved-card-row}.tsx`
- `apps/web/src/components/hub/addons-section.tsx`
- `apps/web/tests/e2e/checkout.spec.ts`
- `apps/web/prisma/migrations/20260423120000_sprint_2_payment_foundation/migration.sql`
- `docs/mor-compliance.md`
- `docs/payments.md`
- `docs/sprints/sprint-2-changelog.md`

Modified files (10):

- `apps/web/package.json` (added `decimal.js ^10.4.3`, `ulid ^2.3.0`)
- `apps/web/prisma/schema.prisma` (v2 — Upsell, Transaction expanded, TrustLedgerEntry, SavedCard + 5 enums)
- `apps/web/prisma/seed.ts` (5 Namotu upsells at 85% provider payout)
- `apps/web/src/app/hub/page.tsx` (Activities card live + "Your add-ons" section)
- `apps/web/src/app/hub/trip/page.tsx` (add-ons section appended)
- `packages/types/src/index.ts` (re-export payments module)
- `packages/types/package.json` (added `test` script + vitest devDep so `pnpm --filter @koncie/types test` works)
- `docs/architecture.md` (appended Payments section)
- `docs/data-model.md` (appended Sprint 2 entities)
- `.github/workflows/ci.yml` (added `e2e` job)

---

## Run these commands, in order

Assumes you're in the `koncie-web` repo root on Windows (PowerShell).

### 0. Sanity check — OneDrive has synced every file

```powershell
# Should show 'sprint_2_payment_foundation' migration folder
Get-ChildItem apps\web\prisma\migrations
# Should show sprint-2 docs
Get-ChildItem docs | Select-Object Name
# package.json should now contain decimal.js + ulid
Select-String -Path apps\web\package.json -Pattern "decimal.js|ulid"
```

If any of these come up empty, OneDrive hasn't finished syncing — wait a minute and retry, or check the OneDrive tray icon.

### 1. Create the sprint-2 branch + install deps

```powershell
git checkout main
git pull origin main
git checkout -b sprint-2
pnpm install
```

`pnpm install` will pull `decimal.js` and `ulid` (new deps) and regenerate a clean lockfile. Expected: "Progress: resolved X, reused Y, downloaded 2, added 2". If you see "prisma generate" fail on postinstall, that's fine — we re-run it explicitly next.

### 2. Generate Prisma client with the v2 schema

```powershell
pnpm --filter @koncie/web exec prisma generate
```

Expected: "Generated Prisma Client (v5.22.0)". This populates `node_modules/.prisma/client/index.d.ts` with typed models for `Upsell`, `Transaction` (v2), `TrustLedgerEntry`, `SavedCard`. Everything that depends on `@prisma/client` will now typecheck.

### 3. Typecheck + lint + unit tests

```powershell
pnpm typecheck
pnpm lint
pnpm test
```

Expected on clean state: all three green. If `pnpm typecheck` surfaces errors, they'll almost certainly be in files the subagents couldn't sandbox-typecheck — the hub pages, checkout page, success/trip pages (anything touching Prisma model types). See "Concerns to verify" below for where to look.

### 4. Apply the Sprint 2 migration

```powershell
pnpm --filter @koncie/web exec prisma migrate dev
```

Prisma will detect the new migration folder (`20260423120000_sprint_2_payment_foundation`) and apply it. Expected output includes: "The migration has been applied successfully."

Then verify the CHECK constraints landed in Postgres. In Supabase SQL editor:

```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'transactions'::regclass AND contype = 'c';
```

Expected: three named CHECKs — `transactions_mcc_4722_check`, `transactions_fee_split_check`, `transactions_capture_has_ledger_check`.

And verify the partial unique index:

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'saved_cards';
```

Expected: `saved_cards_guest_default_unique` with `WHERE (is_default = true)` in the index definition.

### 5. Seed the Namotu upsells

```powershell
pnpm --filter @koncie/web db:seed
```

Expected output ends with `[seed] 5 Namotu upsells inserted`. Verify in Supabase Table Editor → `upsells`: 5 rows, all linked to Namotu's property, `provider_payout_pct = 85.00`.

### 6. Boot the app + click-test

```powershell
pnpm --filter @koncie/web dev
```

Browser tests at `http://localhost:3000`:

1. Start demo from homepage → magic link → hub
2. Hub should show booking hero + 2 upsell preview cards + "Browse all →" link
3. Click "Browse all" → `/hub/activities` → 5 cards
4. Click any card → `/hub/activities/[id]` detail → "Book now"
5. On `/hub/checkout`: line item + card form
6. Pay with card `4242 4242 4242 4242`, any CVC, any future expiry, any name
7. → `/hub/checkout/success` with receipt number starting `kvn_mock_`
8. Back to hub → "Your add-ons" section appears with the purchase
9. Repeat step 4 with card `4000 0000 0000 0002` → `/hub/checkout/failed` with "Your bank declined the charge"
10. Click "Try again" → retry with `4242…` → success
11. Navigate to `/payment` directly (no upsell) → MoR empty state copy

### 7. Inspect one transaction row (the 60-second acquirer walkthrough)

In Supabase → `transactions` → pick any row where `status = 'captured'`:

- [ ] `mcc = '4722'` ✓
- [ ] `amount_minor = provider_payout_minor + koncie_fee_minor` ✓
- [ ] `trust_ledger_id` populated (not null) ✓
- [ ] `provider_payment_ref` starts with `kvn_mock_` ✓
- [ ] `currency = 'FJD'`, `guest_display_currency = 'AUD'`, `fx_rate_at_purchase = 0.670000` ✓

Also check the matching `trust_ledger_entries` row:

- [ ] `event_type = 'COLLECTED'`
- [ ] `trust_account_id = 'trust_kovena_mor_fj_0001'`
- [ ] `amount_minor` + `currency` match the Transaction's property-currency side

### 8. Run Playwright E2E

```powershell
pnpm --filter @koncie/web exec playwright install --with-deps chromium
pnpm --filter @koncie/web test:e2e
```

Expected: 2 passed (happy path + fail-trigger-then-retry).

If the E2E spec references `/dev-test/sign-in-as-seed-guest` and that route doesn't exist yet — that was a Sprint 1 dev helper assumption. The spec may need to sign in via the real homepage "Start demo" button. Adjust the `beforeEach` if needed; the test assertions themselves are correct.

### 9. Commit + push + PR

```powershell
git add .
git status   # review — should be ~37 files changed
git commit -m "feat(sprint-2): Merchant-of-Record payment foundation"
git push -u origin sprint-2
```

Then open the PR (template in plan Task 38 Step 5):

```powershell
gh pr create --base main --head sprint-2 --title "Sprint 2: Merchant-of-Record payment foundation" --body-file docs/sprints/sprint-2-changelog.md
```

Or the longer `gh pr create` with the test-plan checklist from plan Task 38 Step 5 if you'd rather author the PR body fresh.

### 10. Watch Vercel preview deploy, smoke it

Once the PR is open, Vercel will build a preview. Click through the same flow (steps 1–6 above) on the preview URL to confirm it's not localhost-specific.

---

## Concerns surfaced during Cowork execution — verify these on Windows

These came up as subagent self-reports and reviewer flags during the sandbox run. None are blocking, all are worth a quick eye on Windows.

1. **`requireSignedInGuest` is new** — Sprint 1 had no session helper; subagent created one at `apps/web/src/lib/auth/session.ts` matching the plan's canonical shape with one adaptation: the Guest lookup uses `OR` on `authUserId` + `email` to handle both OAuth-set sessions and the email-first Sprint 1 magic-link flow. Confirm the auth gate on `/hub/*` still works for both your seeded demo flow AND a real signup.

2. **`BookingHero` props signature** — existing component takes flat props (`propertyName`, `checkIn`, `checkOut`, `numGuests`), not the `{ booking }` object the plan snippet showed. Hub page was adapted to pass flat props — should be a no-op but confirm visually.

3. **Inline server action in `/hub/checkout/page.tsx`** — closes over `upsell`, `guest`, `booking` from the component scope. Next.js 14 serializes this; if you see a "variable not serializable" warning at runtime, move the action to `actions.ts` and pass IDs via hidden form fields (this is the canonical fallback).

4. **`vite-tsconfig-paths` + vitest path resolution** — subagent noted `@/` aliases only resolve when vitest is invoked from `apps/web/` working directory, not from monorepo root. Sandbox tests worked fine with `cd apps/web && ./node_modules/.bin/vitest run`. Your existing CI runs `pnpm test` which may already handle this; verify the CI `e2e` job passes.

5. **Enum-as-string patterns** — a few spots (`where: { status: 'ACTIVE' }`, `tx.status !== 'captured'`) use string literals where Prisma generates enum types. Should pass typecheck after `prisma generate` but confirm no red squigglies after step 2 above.

6. **Batch A test count** — plan predicted 10 passing money tests; actual is 11 (one `it` has two `expect` calls that round slightly differently). Not a bug, just a plan-arithmetic off-by-one.

7. **Minor doc gap** — `fxRateFor` function is implemented and used by the checkout action but has no dedicated test (convert/split tests cover the FX math indirectly). Nice-to-add if you want full coverage before merge.

8. **`@koncie/types/package.json` new test script** — Batch A added `"test": "vitest run"` + `vitest: ^2.1.9` devDep so the types package can run its own tests. This changes `pnpm-lock.yaml`; review the lockfile diff in the PR is expected.

---

## If something doesn't match what this doc says

The repo state on OneDrive at session end matches what's described here. If a file shown as "OK" above is missing locally, wait a minute for OneDrive to finish syncing, then retry. If it's still missing after 5 minutes, open `/sessions/zen-determined-goodall/koncie-sprint2/` in a terminal — that's the sandbox workspace with the canonical copy — and manually re-copy from there. (That path is a temporary sandbox; it disappears when the Cowork session ends, so don't rely on it long-term.)

---

## Rollback plan (if needed)

If the migration applies cleanly but something else blows up irrecoverably:

```powershell
git checkout main
git branch -D sprint-2
```

The Supabase migration is already applied — to roll that back you'd need to drop the new tables manually:

```sql
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS trust_ledger_entries CASCADE;
DROP TABLE IF EXISTS saved_cards CASCADE;
DROP TABLE IF EXISTS upsells CASCADE;
DROP TYPE IF EXISTS "TransactionStatus";
DROP TYPE IF EXISTS "PaymentProviderName";
DROP TYPE IF EXISTS "TrustLedgerEventType";
DROP TYPE IF EXISTS "UpsellCategory";
DROP TYPE IF EXISTS "UpsellStatus";
DELETE FROM _prisma_migrations WHERE migration_name = '20260423120000_sprint_2_payment_foundation';
```

Sprint 1 entities (`guests`, `bookings`, `properties`, `partner_integrations`) are untouched by this migration.
