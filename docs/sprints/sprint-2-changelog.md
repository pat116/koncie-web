# Sprint 2 Changelog — Merchant-of-Record payment foundation

**Shipped:** TODO add date on PR merge
**Reference spec:** `docs/specs/2026-04-23-sprint-2-design.md`
**Reference plan:** `docs/plans/2026-04-23-sprint-2-plan.md`

## What shipped

- **PaymentProvider port** (`packages/types/src/payments.ts`) — async from day one; Sprint 3 wraps real Kovena.
- **KovenaMockAdapter** — tokenize + charge with Stripe-convention fail triggers; refund as data-only stub.
- **Prisma schema v2** — adds `Upsell`, `SavedCard`, `TrustLedgerEntry`; expands `Transaction` with fee split + dual currency + trust-ledger fk. DB-level CHECKs lock MoR invariants.
- **Money module** — `decimal.js`-backed formatter, hardcoded FX rates, fee-split arithmetic. No JS float math.
- **Checkout flow** — `/hub/activities` → `/hub/activities/[id]` → `/hub/checkout` → `/hub/checkout/success` | `/hub/checkout/failed`. One server action, single `$transaction` for Transaction + TrustLedgerEntry.
- **Saved-card UX** — first-purchase defaults to save-on; subsequent defaults to off; one default per guest enforced by partial unique index.
- **MoR-only `/payment` empty state** — makes the "room booking is paid for, ancillaries only" principle legible in-product.
- **Playwright E2E** — happy path + fail-trigger + retry-to-success on every PR.
- **Docs** — `architecture.md` (+PaymentProvider), `data-model.md` (+4 entities), `mor-compliance.md` (new), `payments.md` (new).

## Gotchas hit

TODO fill in during implementation — follow Sprint 1 convention.

## Open tech debt into Sprint 3

- Hardcoded FX rates → swap for rates-API snapshot on `chargeAndCapture`.
- Plaintext PAN in `card-form.tsx` → swap for Kovena hosted iframe.
- `console.error` on captured-but-db-rollback → swap for `Sentry.captureException`.
- Refund UX → Sprint 5.
- Multi-item cart → Sprint 3 if attach-rate signal asks for it.
- `trust_account_id` literal `'trust_kovena_mor_fj_0001'` → replace with Kovena-provided IDs once live adapter lands.

## Acquirer walkthrough

See `docs/mor-compliance.md` for the 60-second inspect-one-row checklist.
