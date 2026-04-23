# Sprint 2 Design — Merchant-of-Record payment foundation

**Status:** Spec — awaiting Pat's review
**Date:** 2026-04-23
**Sprint:** 2 (reference: `docs/plan.md` §5 — "Sprint 2 — Merchant-of-Record payment foundation")
**Author:** Claude (via brainstorming session with Pat)

## TL;DR

Sprint 2 adds the payment spine Koncie needs to legitimately act as Merchant of Record for ancillary transactions. A guest on the Sprint 1 hub can now browse 4–5 seeded Namotu activities, check out a single item, pay via a mock Kovena card charge, and land on a confirmation surface that writes a compliance-shaped `Transaction` + `TrustLedgerEntry` pair to the database. Card tokenisation and saved-card UX are in scope to unblock Sprint 4's single-click insurance. Real Kovena wiring, refunds UX, chargebacks, and multi-item carts are out of scope — they arrive in Sprints 3–5.

## Goals

1. A `PaymentProvider` port with a mock Kovena adapter that can be swapped for the real Kovena wrapper in Sprint 3 without interface churn.
2. A `Transaction` row shape that can be audited end-to-end: MCC 4722 at compile time, fee split invariant enforced in Postgres, dual-currency fields frozen at capture, trust-account ref linked 1:1 to a `TrustLedgerEntry`.
3. A clickable end-to-end flow on the staging URL: `anonymous → magic link → hub → activity detail → checkout → success/fail → hub reflects purchase`.
4. Saved-card UX with first-purchase default-save behaviour, so Sprint 4's insurance attach ships without UX rework.
5. Multi-currency display (FJD base, AUD guest-facing) with the FX rate frozen on the Transaction row at capture.

## Non-goals

- Real Kovena payments integration → Sprint 3 (prototype demo only per `docs/plan-addendum.md` §6.1)
- Refund UI, chargebacks, dispute flows → Sprint 5+
- Multi-item cart / OrderHeader entity → Sprint 3 if attach-rate signal asks for it
- Insurance, flights, transfers as separate surfaces → Sprints 3–4
- Hotel-admin upsell management → Sprint 5
- Trust-account reconciliation reports → Sprint 3+
- Real KYB/KYC on providers → Phase 2 (property is pre-seeded for pilot)
- IATA Lite / ATAS accreditation paperwork → runs parallel to engineering, not in-app

## Architecture

**Ports & adapters extension.** Sprint 1 shipped one port (`PartnerAdapter`) with one adapter (`HotelLinkMockAdapter`). Sprint 2 adds a second port — `PaymentProvider` — with one adapter (`KovenaMockAdapter`). Interface is async from day one so Sprint 3's real Kovena SDK wrapper slots in without refactor.

**DI boundary.** `apps/web/src/lib/payments/provider.ts` exports a single `paymentProvider: PaymentProvider` instance. Nothing under `app/hub/checkout/*` imports the mock adapter directly — all payment calls go through that module. Sprint 3 swaps the import there.

**Synchronous mock, async-ready port.** The Sprint 2 mock is synchronous-ish (200ms `setTimeout` to mimic network). No webhook endpoint is required in Sprint 2 — charge results come back inline on the server action. When we move to real Kovena in Sprint 3, the webhook handler plugs in without changing the port signature, because the interface already returns `Promise<ChargeResult>`.

**Money handling.** New module `apps/web/src/lib/money.ts`. All monetary math goes through `decimal.js` — no JS float math anywhere. FX rate is hardcoded in Sprint 2 (FJD→AUD ≈ 0.67); Sprint 3+ fetches from a rates API.

**Stack additions** (on top of Sprint 1): `decimal.js`, `ulid` (for mock provider refs), `@supabase/auth-helpers-nextjs` unchanged, Prisma schema bumped.

## Domain model (Prisma schema v2)

Four entities touched. Two new (`Upsell`, `TrustLedgerEntry`), one significantly expanded (`Transaction`), one new for saved-card UX (`SavedCard`).

### Upsell (new)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (pk) | |
| `property_id` | uuid (fk → Property) | |
| `category` | enum | `ACTIVITY`, `TRANSFER`, `SPA`, `DINING`, `OTHER` (Sprint 2 seeds `ACTIVITY` + `SPA` only) |
| `name` | text | |
| `description` | text | |
| `price_minor` | int | minor units in `price_currency` (e.g. FJD cents) |
| `price_currency` | char(3) | ISO 4217, matches property currency |
| `provider_payout_pct` | decimal(4,2) | percentage, e.g. `85.00` = provider keeps 85%; Koncie keeps the remainder |
| `image_url` | text | |
| `status` | enum | `ACTIVE`, `INACTIVE` |
| `metadata` | jsonb | flex field for Sprint 3+ (inclusions list, duration, etc.) |
| `created_at`, `updated_at` | timestamptz | |

### Transaction (expanded — was Sprint 0 stub)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (pk) | |
| `guest_id` | uuid (fk → Guest) | |
| `booking_id` | uuid (fk → Booking) | |
| `upsell_id` | uuid (fk → Upsell) | |
| `saved_card_id` | uuid (fk → SavedCard, nullable) | null for one-off cards not saved |
| `mcc` | text, CHECK = `'4722'` | literal TypeScript type + DB constraint |
| `status` | enum | `pending`, `authorized`, `captured`, `failed`, `refunded` (Sprint 2 writes `captured` / `failed` only) |
| `amount_minor` | int | property-currency amount (FJD cents) |
| `currency` | char(3) | property currency (FJD for Namotu) |
| `provider_payout_minor` | int | what Namotu receives |
| `koncie_fee_minor` | int | Koncie's margin |
| `guest_display_currency` | char(3) | AUD for Aus/NZ guests |
| `guest_display_amount_minor` | int | display-currency amount at capture time |
| `fx_rate_at_purchase` | decimal(12,6) | frozen FX rate `currency → guest_display_currency` |
| `payment_provider` | enum | `KOVENA_MOCK` (Sprint 2); `KOVENA_LIVE`, `STRIPE`, etc. added later |
| `provider_payment_ref` | text (indexed) | opaque ref from Kovena — anchor for compliance review |
| `trust_ledger_id` | uuid (fk → TrustLedgerEntry, nullable) | null for declines; 1:1 for captures |
| `captured_at` | timestamptz (nullable) | |
| `failure_reason` | text (nullable) | pass-through from provider on decline |
| `created_at`, `updated_at` | timestamptz | |

**DB-level invariants:**

- `CHECK (mcc = '4722')`
- `CHECK (amount_minor = provider_payout_minor + koncie_fee_minor)`
- `CHECK ((status = 'captured') = (trust_ledger_id IS NOT NULL))` — every capture has a ledger entry; no captures without one

### TrustLedgerEntry (new)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (pk) | |
| `transaction_id` | uuid (fk → Transaction, UNIQUE) | 1:1 |
| `event_type` | enum | `COLLECTED`, `HELD`, `PAID_OUT`, `REFUNDED` (Sprint 2 writes `COLLECTED` only) |
| `amount_minor` | int | property-currency side |
| `currency` | char(3) | |
| `trust_account_id` | text | mock value `'trust_kovena_mor_fj_0001'` in Sprint 2; Kovena provides real IDs in Sprint 3 |
| `external_ref` | text (nullable) | Kovena's ledger-side ref when real integration lands |
| `occurred_at` | timestamptz | |
| `created_at` | timestamptz | |

### SavedCard (new)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (pk) | |
| `guest_id` | uuid (fk → Guest) | |
| `provider_token` | text | opaque Kovena token — the ONLY card field we persist |
| `brand` | enum | `VISA`, `MASTERCARD`, `AMEX`, `OTHER` |
| `last4` | char(4) | display only |
| `expiry_month` | int | 1–12 |
| `expiry_year` | int | 4-digit |
| `is_default` | boolean | one default per guest (enforced via partial unique index) |
| `created_at`, `updated_at` | timestamptz | |

**No card PAN or CVV is ever persisted.** Tokenisation runs through the mock adapter; only the opaque token + display fields land in our DB.

## Guest journey

**Entry.** `/hub` Activities card (stubbed "Coming soon" in Sprint 1) becomes live, showing the first two seeded upsells + "Browse all →" link. Booking hero stays above; an "Your add-ons" section appears below once the guest has bought something.

**Browse.** `/hub/activities` — grid of 4–5 seeded Namotu upsells. Each card: image, name, one-line blurb, dual-currency price (`FJ$75 · approx AU$50`), "View". No filters in Sprint 2.

**Detail.** `/hub/activities/[id]` — hero image, description, inclusions, price pair, "Book now" CTA → `/hub/checkout?upsellId=<id>`.

**Checkout.** `/hub/checkout` — one line item + price pair. Card section:

- Saved cards exist → default card pre-selected with "Change card" + "Use a different card"
- No saved cards → inline card form (4 fields, client-side validation only; PAN routes to Kovena mock via the tokenisation stub and never lands in our server logs)
- "Save this card for later" checkbox — defaults ON for first purchase, OFF thereafter

Confirm button reads `Pay FJ$75 ≈ AU$50`. Server action calls `paymentProvider.chargeAndCapture(...)`.

**Fail triggers** (mock adapter, Stripe convention):

- `4000000000000002` → generic decline
- `4000000000009995` → insufficient funds
- `4000000000000127` → incorrect CVC
- Expiry month 13 or past date → validation error

**Confirmation.** `/hub/checkout/success` — tick, upbeat copy, summary card (activity, scheduled date, both currencies, Kovena provider ref as guest-facing receipt number). Trust-ledger ref is **not** surfaced to the guest — internal-only.

**Failure.** `/hub/checkout/failed` — soft tone, no red siren. Plain-English pass-through of the provider's decline reason. "Try again" retains upsell + card selection. "Use a different card" drops back to the form.

**Reflected on hub.** New "Your add-ons" section lists purchased upsells with date + amount paid. Also surfaces on `/hub/trip` interleaved with the booking timeline.

**MoR-only empty state.** `/payment` (guest lands with no upsell in flight): *"Your resort booking is already paid for. You don't have any add-ons selected for payment. [Browse activities →]"* — makes the MoR-only principle legible in-product. Koncie never bills for the room itself.

**No cart in Sprint 2.** One upsell per checkout. Matches impulse-buy behaviour, avoids cart-state persistence. Sprint 3 can add a cart if attach-rate signal asks for it.

## PaymentProvider port + mock adapter

Port at `packages/types/src/payments.ts`:

```ts
export interface PaymentProvider {
  tokenizeCard(input: TokenizeCardInput): Promise<TokenizeCardResult>;
  chargeAndCapture(input: ChargeInput): Promise<ChargeResult>;
  refund(input: RefundInput): Promise<RefundResult>; // data-only stub in Sprint 2
}
```

Result types are discriminated unions (`{ success: true, … } | { success: false, reason: PaymentFailureReason }`). Declines return structured results — they are **not** thrown. Throws are reserved for infra-broken scenarios (`PaymentProviderUnavailableError`, `PaymentConfigurationError`).

Mock adapter at `apps/web/src/adapters/kovena-mock.ts`:

- 200ms `setTimeout` to mimic network
- Deterministic happy-path refs: `provider_payment_ref = kvn_mock_<ulid>`, `trust_ledger_id = tle_<ulid>`
- Fail triggers via card prefix (see Guest journey section)
- `tokenizeCard` returns a synthetic token `tok_mock_<ulid>` + derives `brand` / `last4` from the PAN
- `refund` is a data-only stub — writes no ledger entry in Sprint 2; returns `{ success: true, reason: 'data_model_only' }`

Server action flow (`apps/web/src/app/hub/checkout/actions.ts`):

1. Validate upsell exists and belongs to guest's booking's property
2. Compute amounts: `amount_minor` (FJD), `guest_display_amount_minor` (AUD) via `lib/money.ts`
3. Compute fee split: `provider_payout_minor = amount_minor * provider_payout_pct / 100` (decimal math, then floor to integer cents); `koncie_fee_minor = amount_minor - provider_payout_minor`
4. Call `paymentProvider.chargeAndCapture({ ... })`
5. On success → write `Transaction` + `TrustLedgerEntry` in one Prisma `$transaction`
6. On failure → write `Transaction` only with `status='failed'` + `failure_reason`
7. Redirect to `/hub/checkout/success` or `/hub/checkout/failed`

## MoR compliance

**Checkpoint optimised for:** *Pat opens Supabase → `transactions` table → clicks a row → can explain MCC, currency pair, fee split, trust ref, provider ref to an acquirer in under 60 seconds.*

Five load-bearing fields per Transaction row:

1. `mcc: '4722'` — literal TypeScript type + Postgres CHECK constraint
2. Fee-split invariant — `amount_minor = provider_payout_minor + koncie_fee_minor` enforced by CHECK
3. `trust_ledger_id` fk — 1:1 with a TrustLedgerEntry for captures, null for declines, enforced by CHECK
4. `provider_payment_ref` — opaque Kovena ref (indexed), doubles as guest-facing receipt number
5. Currency pair frozen at capture — `amount_minor` / `currency` / `guest_display_amount_minor` / `guest_display_currency` / `fx_rate_at_purchase` all written atomically

TrustLedgerEntry writes `event_type: 'COLLECTED'` only in Sprint 2. `HELD` / `PAID_OUT` / `REFUNDED` land when the real Kovena ledger integration ships (Sprint 3+).

**Out of scope for Sprint 2 MoR work:** real KYB/KYC, reconciliation reports, chargebacks, IATA Lite / ATAS paperwork.

## Errors, tests, docs

### Error taxonomy

| Class | Nature | Shown to guest? | Sentry? |
|---|---|---|---|
| `PaymentDeclinedError` | Business outcome (decline, insufficient funds, etc.) | Yes | No |
| `PaymentValidationError` | Client-recoverable (expiry in past, bad CVC) | Yes | No |
| `PaymentProviderUnavailableError` | Kovena timeout / 5xx | "Try again later" | Yes |
| `PaymentConfigurationError` | Our bug (missing secret, bad DI) | Generic 500 | Yes |

**Fail-safe for the nasty edge case.** Both DB writes (`Transaction` + `TrustLedgerEntry`) run inside one Prisma `$transaction`, so any intra-DB half-write rolls back cleanly. The real edge case is **Kovena captures succeed but the Prisma transaction then fails** — money has moved, we have no DB record. On catch, we log to Sentry with the Kovena `provider_payment_ref` + full input payload + guest id so ops can back-fill the rows manually. Pilot-scale only (Namotu, ~dozens of transactions); Sprint 3 upgrades this to webhook-driven replay once the real Kovena integration lands.

### Tests (TDD order, matching Sprint 1's pattern)

1. `packages/types/src/payments.test.ts` — type-only tests: MCC 4722 literal, result union discrimination
2. `apps/web/src/adapters/kovena-mock.test.ts` — Vitest, ~10 cases: happy path, each fail trigger, validation paths, token round-trip
3. `apps/web/src/lib/money.test.ts` — formatting, FX conversion, minor-unit rounding (decimal.js, no float math)
4. `apps/web/src/app/hub/checkout/actions.test.ts` — server action with mocked Prisma + mocked PaymentProvider; asserts Transaction + TrustLedgerEntry written atomically on success; asserts Transaction-only on decline
5. `apps/web/e2e/checkout.spec.ts` — Playwright: seeded guest → browse → detail → checkout (happy card) → success → hub shows add-on. Second run: fail-trigger card → failed → retry succeeds.

### Docs to author / update

- `docs/architecture.md` — add PaymentProvider to the ports-and-adapters diagram
- `docs/data-model.md` — add Upsell, Transaction (expanded), TrustLedgerEntry, SavedCard field tables
- `docs/mor-compliance.md` (new) — the 60-second acquirer walkthrough
- `docs/payments.md` (new) — port contract, mock behaviour, fail triggers, Sprint 3 swap-in guide
- `docs/sprints/sprint-2-changelog.md` — standard post-sprint artifact

## Definition of done / checkpoint

Sprint 2 is done when all of the following hold on the staging URL:

1. Seeded guest can browse 4–5 Namotu activities, view a detail page, check out, and see the success or failure surface.
2. A successful checkout writes one Transaction row + one TrustLedgerEntry row atomically, both viewable in Supabase.
3. The failure-trigger card (`4000000000000002`) produces a soft-decline UX and a failed Transaction row with null `trust_ledger_id`.
4. "Save this card" on first purchase writes a SavedCard row and pre-selects it on the second checkout.
5. Pat can open Supabase, open one row from `transactions`, and explain MCC, fee split, currency pair, trust ref, and provider ref in under 60 seconds.
6. All tests green on CI; Playwright happy-path + fail-path both passing.
7. `docs/mor-compliance.md` written and reviewed by Pat (compliance shape signed off before Sprint 3 plugs in real Kovena).

## Risks

**Postgres CHECK constraints and Prisma.** Prisma doesn't support CHECK constraints natively — they must be added via raw SQL in the migration. Mitigation: write the constraint SQL by hand, add a Vitest test that tries to insert a row violating each CHECK and asserts the Postgres error.

**FX rate drift for reconciliation.** Hardcoding FJD→AUD at 0.67 means a guest's AUD receipt may diverge from the real rate by the time reconciliation runs. Mitigation: document this is a Sprint 2 shortcut; Sprint 3 replaces with a rates-API snapshot taken at capture.

**Mock adapter tempting shortcuts.** Risk that someone reading our code in Sprint 3 assumes the mock's behaviour IS the contract. Mitigation: the port in `packages/types` is authoritative; the mock docstring explicitly says "mock-only behaviours MUST NOT be relied on outside tests".

**Card input UX vs. real tokenisation.** The Sprint 2 card form is a dumb HTML form that hands the PAN to our server action, which then calls `paymentProvider.tokenizeCard`. In production this must be replaced with Kovena's hosted card iframe (so the PAN never hits our server). Mitigation: document loudly in `docs/payments.md` and in the form component itself; tag the component with a `// TODO(sprint-3): replace with hosted iframe` comment.

## Decisions locked

1. **Seeded activity list.** Five Namotu upsells for pilot demo: *Half-day reef snorkel*, *Sunset sail*, *Resort spa treatment*, *Pro surfing lesson*, *Cultural village tour*. Seeded with realistic FJD prices and Namotu branding at `apps/web/prisma/seed.ts`.
2. **Guest-display currency.** Hardcoded AUD for all guests in Sprint 2 (pilot is Aus/NZ inbound — 100% of cohort). Sprint 3 adds booking-origin-country branching when the guest population diversifies beyond Oceania.
3. **Provider payout default.** 85% provider / 15% Koncie across all seeded Namotu upsells. Matches typical activity-desk margin conventions in the region. This is the number that anchors the Namotu pilot conversation — adjustable per-upsell via `provider_payout_pct` column before launch if Pat wants to trade margin for landing the partner.
