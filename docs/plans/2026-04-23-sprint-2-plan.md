# Sprint 2 Implementation Plan — Merchant-of-Record payment foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a clickable end-to-end ancillary-purchase flow on staging where a signed-in seeded guest browses 4–5 Namotu activities, pays via a mock Kovena adapter, and the resulting `Transaction` + `TrustLedgerEntry` rows carry the full MoR compliance shape (MCC 4722, fee split, dual currency, trust ref, provider ref).

**Architecture:** Adds a second port `PaymentProvider` alongside Sprint 1's `PartnerAdapter`. Mock Kovena adapter implements it synchronously for Sprint 2 (real wrapper lands in Sprint 3). Postgres enforces fee-split + MCC invariants via CHECK constraints written in raw SQL migrations. Checkout runs through one Next.js server action that wraps both DB writes in a single Prisma `$transaction` so there is no intra-DB half-write; the Kovena-captured-but-DB-rolled-back edge case is handled via Sentry alerting with `provider_payment_ref` preserved for ops reconciliation.

**Tech Stack:** Sprint 1 stack (Next.js 14.2, React 18.3, TypeScript 5.7 strict, Tailwind 3.4, Prisma 5.22, Supabase, Resend) + `decimal.js` 10.x (currency math), `ulid` 2.x (mock provider refs), Vitest 2.x, Playwright 1.49.

**Reference spec:** `docs/specs/2026-04-23-sprint-2-design.md`

---

## File Structure

### New files (by area)

**Domain types:**
- `packages/types/src/payments.ts` — `PaymentProvider` port + payment result types
- `packages/types/src/payments.test.ts` — type-only assertions

**Money module:**
- `apps/web/src/lib/money.ts` — currency formatter, FX conversion, fee-split arithmetic
- `apps/web/src/lib/money.test.ts`

**Payment adapter + DI:**
- `apps/web/src/adapters/kovena-mock.ts`
- `apps/web/src/adapters/kovena-mock.test.ts`
- `apps/web/src/lib/payments/provider.ts` — DI module exporting the singleton

**Pages (App Router):**
- `apps/web/src/app/hub/activities/page.tsx`
- `apps/web/src/app/hub/activities/[id]/page.tsx`
- `apps/web/src/app/hub/checkout/page.tsx`
- `apps/web/src/app/hub/checkout/actions.ts`
- `apps/web/src/app/hub/checkout/actions.test.ts`
- `apps/web/src/app/hub/checkout/success/page.tsx`
- `apps/web/src/app/hub/checkout/failed/page.tsx`
- `apps/web/src/app/payment/page.tsx`

**Components:**
- `apps/web/src/components/activities/activity-card.tsx`
- `apps/web/src/components/activities/price-pair.tsx`
- `apps/web/src/components/checkout/card-form.tsx`
- `apps/web/src/components/checkout/saved-card-row.tsx`
- `apps/web/src/components/hub/addons-section.tsx`

**Errors:**
- `apps/web/src/lib/errors/payments.ts` — payment-specific typed errors

**Tests:**
- `apps/web/tests/e2e/checkout.spec.ts`

**Docs:**
- `docs/mor-compliance.md` (new)
- `docs/payments.md` (new)
- `docs/sprints/sprint-2-changelog.md` (new)

### Modified files

- `apps/web/package.json` — add `decimal.js`, `ulid`
- `apps/web/prisma/schema.prisma` — add `Upsell`, expand `Transaction`, add `TrustLedgerEntry`, `SavedCard`
- `apps/web/prisma/seed.ts` — seed 5 Namotu upsells
- `apps/web/src/app/hub/page.tsx` — activate Activities card + add "Your add-ons" section
- `apps/web/src/app/hub/trip/page.tsx` — interleave add-ons into booking timeline
- `docs/architecture.md` — add PaymentProvider port
- `docs/data-model.md` — add Upsell, Transaction (v2), TrustLedgerEntry, SavedCard
- `.env.example` + `apps/web/.env.example` — document new env (hardcoded FX rate for Sprint 2)

---

## Task 1: Create sprint-2 branch + install dependencies

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Start from fresh `main`**

```powershell
git checkout main
git pull origin main
git checkout -b sprint-2
```

Expected: on new branch `sprint-2` tracking origin/main.

- [ ] **Step 2: Add runtime dependencies**

```powershell
pnpm --filter @koncie/web add decimal.js ulid
```

- [ ] **Step 3: Verify install**

```powershell
pnpm --filter @koncie/web list --depth=0 | findstr /i "decimal ulid"
```

Expected: `decimal.js 10.x`, `ulid 2.x` listed.

- [ ] **Step 4: Commit**

```powershell
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore(sprint-2): add decimal.js and ulid deps"
```

---

## Task 2: Define PaymentProvider port types

**Files:**
- Create: `packages/types/src/payments.ts`
- Modify: `packages/types/src/index.ts` (re-export)

- [ ] **Step 1: Write the port**

Create `packages/types/src/payments.ts`:

```ts
/**
 * Payment provider port. Sprint 2 has one adapter (KovenaMockAdapter); Sprint 3
 * swaps in a real Kovena wrapper. Interface is async from day one.
 *
 * Declines are structured results — NOT thrown. Throws are reserved for
 * infra-broken scenarios (see apps/web/src/lib/errors/payments.ts).
 */

export type CardBrand = 'VISA' | 'MASTERCARD' | 'AMEX' | 'OTHER';

export interface TokenizeCardInput {
  pan: string;
  expiryMonth: number;
  expiryYear: number;
  cvc: string;
  cardholderName: string;
}

export type TokenizeCardResult =
  | {
      success: true;
      providerToken: string;
      brand: CardBrand;
      last4: string;
    }
  | {
      success: false;
      reason: PaymentFailureReason;
      message: string;
    };

export interface ChargeInput {
  /** Minor units in `currency` (e.g. FJD cents) */
  amountMinor: number;
  currency: string;
  /** Split: what the provider (e.g. Namotu) receives */
  providerPayoutMinor: number;
  /** Split: Koncie's margin. Must satisfy: providerPayoutMinor + koncieFeeMinor === amountMinor */
  koncieFeeMinor: number;
  /** Opaque Kovena token from `tokenizeCard` */
  providerToken: string;
  /** Correlation context for ledger audit */
  metadata: {
    guestId: string;
    bookingId: string;
    upsellId: string;
  };
}

export type ChargeResult =
  | {
      success: true;
      /** Opaque Kovena ref — guest-facing receipt number + compliance anchor */
      providerPaymentRef: string;
      /** Opaque Kovena trust-ledger ref */
      trustLedgerExternalRef: string;
      capturedAt: string; // ISO-8601
    }
  | {
      success: false;
      reason: PaymentFailureReason;
      message: string;
    };

export interface RefundInput {
  providerPaymentRef: string;
  amountMinor: number;
}

export type RefundResult =
  | { success: true; refundRef: string }
  | { success: false; reason: 'data_model_only' | PaymentFailureReason; message: string };

export type PaymentFailureReason =
  | 'card_declined'
  | 'insufficient_funds'
  | 'incorrect_cvc'
  | 'validation_error'
  | 'provider_unavailable'
  | 'configuration_error';

export interface PaymentProvider {
  tokenizeCard(input: TokenizeCardInput): Promise<TokenizeCardResult>;
  chargeAndCapture(input: ChargeInput): Promise<ChargeResult>;
  /** Sprint 2: data-only stub. Sprint 5 wires the real refund flow. */
  refund(input: RefundInput): Promise<RefundResult>;
}
```

- [ ] **Step 2: Re-export from types index**

Modify `packages/types/src/index.ts`:

```ts
export * from './partner-adapter';
export * from './transaction';
export * from './payments';
```

- [ ] **Step 3: Type-only test**

Create `packages/types/src/payments.test.ts`:

```ts
import { describe, it, expectTypeOf } from 'vitest';
import type { ChargeResult, PaymentProvider, PaymentFailureReason } from './payments';

describe('payments types', () => {
  it('ChargeResult discriminated union narrows on success', () => {
    const r: ChargeResult = {
      success: true,
      providerPaymentRef: 'kvn_mock_abc',
      trustLedgerExternalRef: 'tle_abc',
      capturedAt: new Date().toISOString(),
    };
    if (r.success) {
      expectTypeOf(r.providerPaymentRef).toEqualTypeOf<string>();
    }
  });

  it('PaymentFailureReason covers all Sprint 2 buckets', () => {
    const reasons: PaymentFailureReason[] = [
      'card_declined',
      'insufficient_funds',
      'incorrect_cvc',
      'validation_error',
      'provider_unavailable',
      'configuration_error',
    ];
    expectTypeOf(reasons).toEqualTypeOf<PaymentFailureReason[]>();
  });

  it('PaymentProvider has three methods', () => {
    type Methods = keyof PaymentProvider;
    expectTypeOf<Methods>().toEqualTypeOf<'tokenizeCard' | 'chargeAndCapture' | 'refund'>();
  });
});
```

- [ ] **Step 4: Run typecheck**

```powershell
pnpm --filter @koncie/types typecheck
pnpm --filter @koncie/types test
```

Expected: both pass.

- [ ] **Step 5: Commit**

```powershell
git add packages/types/src/payments.ts packages/types/src/payments.test.ts packages/types/src/index.ts
git commit -m "feat(types): add PaymentProvider port with discriminated-union results"
```

---

## Task 3: Typed payment error classes

**Files:**
- Create: `apps/web/src/lib/errors/payments.ts`

- [ ] **Step 1: Write the error classes**

Create `apps/web/src/lib/errors/payments.ts`:

```ts
import type { PaymentFailureReason } from '@koncie/types';

/**
 * Business-outcome errors (declines, validation). Shown to guest, NOT sent to Sentry.
 * Thrown by the checkout server action to short-circuit out of the happy path.
 */
export class PaymentDeclinedError extends Error {
  readonly reason: PaymentFailureReason;
  constructor(reason: PaymentFailureReason, message: string) {
    super(message);
    this.name = 'PaymentDeclinedError';
    this.reason = reason;
  }
}

export class PaymentValidationError extends Error {
  readonly field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.name = 'PaymentValidationError';
    this.field = field;
  }
}

/**
 * Infra-broken errors. Sent to Sentry; guest sees a generic "try again later".
 */
export class PaymentProviderUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'PaymentProviderUnavailableError';
  }
}

export class PaymentConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentConfigurationError';
  }
}
```

- [ ] **Step 2: Commit**

```powershell
git add apps/web/src/lib/errors/payments.ts
git commit -m "feat(errors): payment error taxonomy"
```

---

## Task 4: Money module — formatter (TDD)

**Files:**
- Create: `apps/web/src/lib/money.test.ts`
- Create: `apps/web/src/lib/money.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/money.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatMoney, formatPricePair } from './money';

describe('formatMoney', () => {
  it('formats FJD with proper symbol and decimals', () => {
    expect(formatMoney(7500, 'FJD')).toBe('FJ$75.00');
  });

  it('formats AUD with proper symbol', () => {
    expect(formatMoney(5025, 'AUD')).toBe('AU$50.25');
  });

  it('handles zero', () => {
    expect(formatMoney(0, 'FJD')).toBe('FJ$0.00');
  });
});

describe('formatPricePair', () => {
  it('renders the "FJ$75 ≈ AU$50" guest-facing pair', () => {
    expect(
      formatPricePair({
        amountMinor: 7500,
        currency: 'FJD',
        guestDisplayAmountMinor: 5025,
        guestDisplayCurrency: 'AUD',
      }),
    ).toBe('FJ$75.00 ≈ AU$50.25');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
pnpm --filter @koncie/web test money.test.ts
```

Expected: FAIL — `formatMoney is not a function`.

- [ ] **Step 3: Implement**

Create `apps/web/src/lib/money.ts`:

```ts
import Decimal from 'decimal.js';

const SYMBOLS: Record<string, string> = {
  FJD: 'FJ$',
  AUD: 'AU$',
  NZD: 'NZ$',
  USD: 'US$',
};

export function formatMoney(amountMinor: number, currency: string): string {
  const symbol = SYMBOLS[currency] ?? `${currency} `;
  const major = new Decimal(amountMinor).dividedBy(100).toFixed(2);
  return `${symbol}${major}`;
}

export interface PricePairInput {
  amountMinor: number;
  currency: string;
  guestDisplayAmountMinor: number;
  guestDisplayCurrency: string;
}

export function formatPricePair(input: PricePairInput): string {
  return `${formatMoney(input.amountMinor, input.currency)} ≈ ${formatMoney(
    input.guestDisplayAmountMinor,
    input.guestDisplayCurrency,
  )}`;
}
```

- [ ] **Step 4: Run tests to verify pass**

```powershell
pnpm --filter @koncie/web test money.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/lib/money.ts apps/web/src/lib/money.test.ts
git commit -m "feat(money): currency formatter + price-pair for dual display"
```

---

## Task 5: Money module — FX conversion + fee split (TDD)

**Files:**
- Modify: `apps/web/src/lib/money.test.ts`
- Modify: `apps/web/src/lib/money.ts`

- [ ] **Step 1: Add failing tests**

Append to `apps/web/src/lib/money.test.ts`:

```ts
import { convertMinorUnits, computeFeeSplit, FX_RATES } from './money';

describe('convertMinorUnits', () => {
  it('converts FJD to AUD at hardcoded Sprint 2 rate 0.67', () => {
    expect(convertMinorUnits({ amountMinor: 7500, from: 'FJD', to: 'AUD' })).toBe(5025);
  });

  it('returns the same amount when source === destination', () => {
    expect(convertMinorUnits({ amountMinor: 1234, from: 'AUD', to: 'AUD' })).toBe(1234);
  });

  it('rounds half-up at the minor-unit boundary', () => {
    // 100 FJD * 0.67 = 67 AUD exact
    expect(convertMinorUnits({ amountMinor: 100, from: 'FJD', to: 'AUD' })).toBe(67);
    // 101 FJD * 0.67 = 67.67 → rounds to 68
    expect(convertMinorUnits({ amountMinor: 101, from: 'FJD', to: 'AUD' })).toBe(68);
  });

  it('throws on unknown currency pair', () => {
    expect(() =>
      convertMinorUnits({ amountMinor: 100, from: 'JPY', to: 'AUD' }),
    ).toThrow(/no FX rate/i);
  });
});

describe('computeFeeSplit', () => {
  it('splits 7500 FJD at 85% provider payout → 6375 provider, 1125 koncie', () => {
    const { providerPayoutMinor, koncieFeeMinor } = computeFeeSplit({
      amountMinor: 7500,
      providerPayoutPct: '85.00',
    });
    expect(providerPayoutMinor).toBe(6375);
    expect(koncieFeeMinor).toBe(1125);
    expect(providerPayoutMinor + koncieFeeMinor).toBe(7500);
  });

  it('floors provider payout and gives rounding residue to koncie', () => {
    // 100 * 85.33 / 100 = 85.33 → floor 85; koncie = 15
    const { providerPayoutMinor, koncieFeeMinor } = computeFeeSplit({
      amountMinor: 100,
      providerPayoutPct: '85.33',
    });
    expect(providerPayoutMinor).toBe(85);
    expect(koncieFeeMinor).toBe(15);
  });

  it('invariant: split always sums to input', () => {
    for (const amount of [1, 99, 7500, 12345, 100000]) {
      const { providerPayoutMinor, koncieFeeMinor } = computeFeeSplit({
        amountMinor: amount,
        providerPayoutPct: '85.00',
      });
      expect(providerPayoutMinor + koncieFeeMinor).toBe(amount);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```powershell
pnpm --filter @koncie/web test money.test.ts
```

Expected: FAIL — `convertMinorUnits is not a function`.

- [ ] **Step 3: Implement**

Append to `apps/web/src/lib/money.ts`:

```ts
/**
 * Sprint 2 uses hardcoded FX rates. Sprint 3 swaps in a rates-API snapshot
 * captured at the moment of charge and written to `Transaction.fx_rate_at_purchase`.
 */
export const FX_RATES: Record<string, Record<string, string>> = {
  FJD: { AUD: '0.67', NZD: '0.73', USD: '0.44' },
  AUD: { FJD: '1.49', NZD: '1.09', USD: '0.66' },
};

export interface ConvertInput {
  amountMinor: number;
  from: string;
  to: string;
}

export function convertMinorUnits({ amountMinor, from, to }: ConvertInput): number {
  if (from === to) return amountMinor;
  const rate = FX_RATES[from]?.[to];
  if (!rate) {
    throw new Error(`no FX rate configured for ${from} → ${to}`);
  }
  return new Decimal(amountMinor).times(rate).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

export interface FeeSplitInput {
  amountMinor: number;
  /** Decimal-precision percentage as string, e.g. "85.00" */
  providerPayoutPct: string;
}

export interface FeeSplit {
  providerPayoutMinor: number;
  koncieFeeMinor: number;
}

export function computeFeeSplit({ amountMinor, providerPayoutPct }: FeeSplitInput): FeeSplit {
  const providerPayoutMinor = new Decimal(amountMinor)
    .times(providerPayoutPct)
    .dividedBy(100)
    .toDecimalPlaces(0, Decimal.ROUND_DOWN)
    .toNumber();
  const koncieFeeMinor = amountMinor - providerPayoutMinor;
  return { providerPayoutMinor, koncieFeeMinor };
}

/** Hardcoded Sprint 2 FX anchor used by the checkout server action. */
export function fxRateFor(from: string, to: string): string {
  if (from === to) return '1.000000';
  const rate = FX_RATES[from]?.[to];
  if (!rate) throw new Error(`no FX rate configured for ${from} → ${to}`);
  return new Decimal(rate).toFixed(6);
}
```

- [ ] **Step 4: Run tests to verify pass**

```powershell
pnpm --filter @koncie/web test money.test.ts
```

Expected: 10 passed.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/lib/money.ts apps/web/src/lib/money.test.ts
git commit -m "feat(money): FX conversion + fee split with decimal.js"
```

---

## Task 6: Prisma schema — add `Upsell` model

**Files:**
- Modify: `apps/web/prisma/schema.prisma`

- [ ] **Step 1: Add enums + Upsell model**

In `apps/web/prisma/schema.prisma`, append below existing models:

```prisma
enum UpsellCategory {
  ACTIVITY
  TRANSFER
  SPA
  DINING
  OTHER
}

enum UpsellStatus {
  ACTIVE
  INACTIVE
}

model Upsell {
  id                 String         @id @default(uuid()) @db.Uuid
  propertyId         String         @map("property_id") @db.Uuid
  property           Property       @relation(fields: [propertyId], references: [id])
  category           UpsellCategory
  name               String
  description        String
  priceMinor         Int            @map("price_minor")
  priceCurrency      String         @map("price_currency") @db.Char(3)
  /// Decimal(4,2) — e.g. 85.00 = provider keeps 85%
  providerPayoutPct  Decimal        @map("provider_payout_pct") @db.Decimal(4, 2)
  imageUrl           String         @map("image_url")
  status             UpsellStatus   @default(ACTIVE)
  metadata           Json           @default("{}")
  transactions       Transaction[]
  createdAt          DateTime       @default(now()) @map("created_at") @db.Timestamptz
  updatedAt          DateTime       @updatedAt @map("updated_at") @db.Timestamptz

  @@index([propertyId, status])
  @@map("upsells")
}
```

- [ ] **Step 2: Add `upsells Upsell[]` back-relation on Property**

Modify the existing `Property` model — add inside the braces:

```prisma
  upsells    Upsell[]
```

- [ ] **Step 3: Commit (schema-only, no migration yet)**

```powershell
git add apps/web/prisma/schema.prisma
git commit -m "feat(schema): add Upsell model"
```

---

## Task 7: Prisma schema — expand `Transaction` model

**Files:**
- Modify: `apps/web/prisma/schema.prisma`

- [ ] **Step 1: Replace Sprint 0 Transaction stub (if present) with v2**

In `apps/web/prisma/schema.prisma`, add / replace the `Transaction` model:

```prisma
enum TransactionStatus {
  pending
  authorized
  captured
  failed
  refunded
}

enum PaymentProviderName {
  KOVENA_MOCK
  KOVENA_LIVE
  STRIPE
}

model Transaction {
  id                        String              @id @default(uuid()) @db.Uuid
  guestId                   String              @map("guest_id") @db.Uuid
  guest                     Guest               @relation(fields: [guestId], references: [id])
  bookingId                 String              @map("booking_id") @db.Uuid
  booking                   Booking             @relation(fields: [bookingId], references: [id])
  upsellId                  String              @map("upsell_id") @db.Uuid
  upsell                    Upsell              @relation(fields: [upsellId], references: [id])
  savedCardId               String?             @map("saved_card_id") @db.Uuid
  savedCard                 SavedCard?          @relation(fields: [savedCardId], references: [id])
  /// Always '4722' — enforced by CHECK in migration
  mcc                       String              @db.Char(4)
  status                    TransactionStatus
  amountMinor               Int                 @map("amount_minor")
  currency                  String              @db.Char(3)
  providerPayoutMinor       Int                 @map("provider_payout_minor")
  koncieFeeMinor            Int                 @map("koncie_fee_minor")
  guestDisplayCurrency      String              @map("guest_display_currency") @db.Char(3)
  guestDisplayAmountMinor   Int                 @map("guest_display_amount_minor")
  fxRateAtPurchase          Decimal             @map("fx_rate_at_purchase") @db.Decimal(12, 6)
  paymentProvider           PaymentProviderName @map("payment_provider")
  providerPaymentRef        String              @map("provider_payment_ref")
  trustLedgerId             String?             @unique @map("trust_ledger_id") @db.Uuid
  trustLedgerEntry          TrustLedgerEntry?   @relation(fields: [trustLedgerId], references: [id])
  capturedAt                DateTime?           @map("captured_at") @db.Timestamptz
  failureReason             String?             @map("failure_reason")
  createdAt                 DateTime            @default(now()) @map("created_at") @db.Timestamptz
  updatedAt                 DateTime            @updatedAt @map("updated_at") @db.Timestamptz

  @@index([guestId, createdAt])
  @@index([providerPaymentRef])
  @@map("transactions")
}
```

- [ ] **Step 2: Add back-relations on Guest and Booking**

Modify the existing `Guest` model — add inside the braces:

```prisma
  transactions Transaction[]
```

Modify the existing `Booking` model — add inside the braces:

```prisma
  transactions Transaction[]
```

- [ ] **Step 3: Commit**

```powershell
git add apps/web/prisma/schema.prisma
git commit -m "feat(schema): expand Transaction model for MoR compliance (v2)"
```

---

## Task 8: Prisma schema — add `TrustLedgerEntry` model

**Files:**
- Modify: `apps/web/prisma/schema.prisma`

- [ ] **Step 1: Add the model**

Append to `apps/web/prisma/schema.prisma`:

```prisma
enum TrustLedgerEventType {
  COLLECTED
  HELD
  PAID_OUT
  REFUNDED
}

model TrustLedgerEntry {
  id              String                @id @default(uuid()) @db.Uuid
  transaction     Transaction?
  eventType       TrustLedgerEventType  @map("event_type")
  amountMinor     Int                   @map("amount_minor")
  currency        String                @db.Char(3)
  trustAccountId  String                @map("trust_account_id")
  externalRef     String?               @map("external_ref")
  occurredAt      DateTime              @map("occurred_at") @db.Timestamptz
  createdAt       DateTime              @default(now()) @map("created_at") @db.Timestamptz

  @@index([trustAccountId, occurredAt])
  @@map("trust_ledger_entries")
}
```

- [ ] **Step 2: Commit**

```powershell
git add apps/web/prisma/schema.prisma
git commit -m "feat(schema): add TrustLedgerEntry model"
```

---

## Task 9: Prisma schema — add `SavedCard` model

**Files:**
- Modify: `apps/web/prisma/schema.prisma`

- [ ] **Step 1: Add enum + model**

Append to `apps/web/prisma/schema.prisma`:

```prisma
model SavedCard {
  id             String        @id @default(uuid()) @db.Uuid
  guestId        String        @map("guest_id") @db.Uuid
  guest          Guest         @relation(fields: [guestId], references: [id])
  providerToken  String        @map("provider_token")
  brand          String
  last4          String        @db.Char(4)
  expiryMonth    Int           @map("expiry_month")
  expiryYear     Int           @map("expiry_year")
  isDefault      Boolean       @default(false) @map("is_default")
  transactions   Transaction[]
  createdAt      DateTime      @default(now()) @map("created_at") @db.Timestamptz
  updatedAt      DateTime      @updatedAt @map("updated_at") @db.Timestamptz

  @@index([guestId])
  @@map("saved_cards")
}
```

- [ ] **Step 2: Add back-relation on Guest**

Inside the existing `Guest` model:

```prisma
  savedCards   SavedCard[]
```

- [ ] **Step 3: Commit**

```powershell
git add apps/web/prisma/schema.prisma
git commit -m "feat(schema): add SavedCard model"
```

---

## Task 10: Generate migration + append CHECK constraints

**Files:**
- Create: `apps/web/prisma/migrations/<timestamp>_sprint_2_payment_foundation/migration.sql`

- [ ] **Step 1: Generate migration from schema**

```powershell
pnpm --filter @koncie/web exec prisma migrate dev --create-only --name sprint_2_payment_foundation
```

Expected: new migration folder created under `apps/web/prisma/migrations/`. Does NOT apply yet.

- [ ] **Step 2: Append raw SQL CHECK constraints**

Open the generated `migration.sql` and append at the end:

```sql
-- Sprint 2 MoR invariants. Prisma doesn't model CHECK constraints natively;
-- these are hand-written and must survive `prisma migrate reset`.

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_mcc_4722_check"
  CHECK ("mcc" = '4722');

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_fee_split_check"
  CHECK ("amount_minor" = "provider_payout_minor" + "koncie_fee_minor");

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_capture_has_ledger_check"
  CHECK (
    ("status" = 'captured' AND "trust_ledger_id" IS NOT NULL)
    OR ("status" <> 'captured')
  );

-- One default card per guest.
CREATE UNIQUE INDEX "saved_cards_guest_default_unique"
  ON "saved_cards" ("guest_id")
  WHERE "is_default" = true;
```

- [ ] **Step 3: Apply the migration**

```powershell
pnpm --filter @koncie/web exec prisma migrate dev
```

Expected: migration applies; Prisma client regenerates.

- [ ] **Step 4: Verify constraints in Supabase**

Open Supabase SQL editor and run:

```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'transactions'::regclass AND contype = 'c';
```

Expected: three named CHECKs present.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/prisma/
git commit -m "feat(schema): apply sprint 2 migration with MoR CHECK constraints"
```

---

## Task 11: Seed 5 Namotu upsells

**Files:**
- Modify: `apps/web/prisma/seed.ts`

- [ ] **Step 1: Extend the seed with upsell inserts**

In `apps/web/prisma/seed.ts`, after the existing property insert and before the final log line, add:

```ts
  // Sprint 2 — five Namotu activity upsells
  await prisma.upsell.deleteMany({ where: { propertyId: property.id } });
  await prisma.upsell.createMany({
    data: [
      {
        propertyId: property.id,
        category: 'ACTIVITY',
        name: 'Half-day reef snorkel',
        description:
          'Guided boat trip to Namotu Lefts outer reef. Gear, lunch, and fresh coconuts included.',
        priceMinor: 7500,
        priceCurrency: 'FJD',
        providerPayoutPct: '85.00',
        imageUrl: '/images/upsells/snorkel.jpg',
      },
      {
        propertyId: property.id,
        category: 'ACTIVITY',
        name: 'Sunset sail',
        description:
          'Two-hour catamaran sail along the reef edge at golden hour. Champagne + canapés on board.',
        priceMinor: 12500,
        priceCurrency: 'FJD',
        providerPayoutPct: '85.00',
        imageUrl: '/images/upsells/sunset-sail.jpg',
      },
      {
        propertyId: property.id,
        category: 'SPA',
        name: 'Resort spa treatment',
        description:
          'Traditional Bobo massage, 60 minutes, in the over-water spa bure.',
        priceMinor: 18000,
        priceCurrency: 'FJD',
        providerPayoutPct: '85.00',
        imageUrl: '/images/upsells/spa.jpg',
      },
      {
        propertyId: property.id,
        category: 'ACTIVITY',
        name: 'Pro surfing lesson',
        description:
          '90-minute one-on-one coaching with a Namotu local pro at a beginner-friendly reef break.',
        priceMinor: 22000,
        priceCurrency: 'FJD',
        providerPayoutPct: '85.00',
        imageUrl: '/images/upsells/surf-lesson.jpg',
      },
      {
        propertyId: property.id,
        category: 'ACTIVITY',
        name: 'Cultural village tour',
        description:
          'Half-day visit to a nearby village with kava ceremony, meke dance, and village lunch.',
        priceMinor: 9500,
        priceCurrency: 'FJD',
        providerPayoutPct: '85.00',
        imageUrl: '/images/upsells/village-tour.jpg',
      },
    ],
  });
  console.log('[seed] 5 Namotu upsells inserted');
```

- [ ] **Step 2: Run the seed**

```powershell
pnpm --filter @koncie/web db:seed
```

Expected output ends with `[seed] 5 Namotu upsells inserted`.

- [ ] **Step 3: Verify in Supabase**

In Supabase Table Editor → `upsells`. Expected: 5 rows, each with `property_id` = Namotu, `provider_payout_pct = 85.00`.

- [ ] **Step 4: Commit**

```powershell
git add apps/web/prisma/seed.ts
git commit -m "feat(seed): seed five Namotu upsells"
```

---

## Task 12: KovenaMockAdapter — tokenizeCard (TDD)

**Files:**
- Create: `apps/web/src/adapters/kovena-mock.test.ts`
- Create: `apps/web/src/adapters/kovena-mock.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/adapters/kovena-mock.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { KovenaMockAdapter } from './kovena-mock';

const adapter = new KovenaMockAdapter();

describe('KovenaMockAdapter.tokenizeCard', () => {
  it('returns VISA brand + last4 for a 4*** card', async () => {
    const result = await adapter.tokenizeCard({
      pan: '4242424242424242',
      expiryMonth: 12,
      expiryYear: 2030,
      cvc: '123',
      cardholderName: 'Jane Guest',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.brand).toBe('VISA');
      expect(result.last4).toBe('4242');
      expect(result.providerToken).toMatch(/^tok_mock_/);
    }
  });

  it('returns MASTERCARD for a 5*** card', async () => {
    const result = await adapter.tokenizeCard({
      pan: '5555555555554444',
      expiryMonth: 12,
      expiryYear: 2030,
      cvc: '123',
      cardholderName: 'Jane Guest',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.brand).toBe('MASTERCARD');
  });

  it('fails validation for expiry month 13', async () => {
    const result = await adapter.tokenizeCard({
      pan: '4242424242424242',
      expiryMonth: 13,
      expiryYear: 2030,
      cvc: '123',
      cardholderName: 'Jane Guest',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe('validation_error');
  });

  it('fails validation for past expiry year', async () => {
    const result = await adapter.tokenizeCard({
      pan: '4242424242424242',
      expiryMonth: 1,
      expiryYear: 2020,
      cvc: '123',
      cardholderName: 'Jane Guest',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe('validation_error');
  });
});
```

- [ ] **Step 2: Run test**

```powershell
pnpm --filter @koncie/web test kovena-mock.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement tokenizeCard**

Create `apps/web/src/adapters/kovena-mock.ts`:

```ts
import { ulid } from 'ulid';
import type {
  CardBrand,
  ChargeInput,
  ChargeResult,
  PaymentProvider,
  RefundInput,
  RefundResult,
  TokenizeCardInput,
  TokenizeCardResult,
} from '@koncie/types';

const NETWORK_DELAY_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function brandFromPan(pan: string): CardBrand {
  const first = pan[0];
  if (first === '4') return 'VISA';
  if (first === '5') return 'MASTERCARD';
  if (first === '3') return 'AMEX';
  return 'OTHER';
}

export class KovenaMockAdapter implements PaymentProvider {
  async tokenizeCard(input: TokenizeCardInput): Promise<TokenizeCardResult> {
    await sleep(NETWORK_DELAY_MS);

    if (input.expiryMonth < 1 || input.expiryMonth > 12) {
      return {
        success: false,
        reason: 'validation_error',
        message: `Expiry month ${input.expiryMonth} is invalid`,
      };
    }

    const now = new Date();
    const expiry = new Date(input.expiryYear, input.expiryMonth - 1, 1);
    if (expiry < new Date(now.getFullYear(), now.getMonth(), 1)) {
      return {
        success: false,
        reason: 'validation_error',
        message: 'Card is expired',
      };
    }

    return {
      success: true,
      providerToken: `tok_mock_${ulid()}`,
      brand: brandFromPan(input.pan),
      last4: input.pan.slice(-4),
    };
  }

  async chargeAndCapture(_input: ChargeInput): Promise<ChargeResult> {
    throw new Error('not implemented — covered in Task 13');
  }

  async refund(_input: RefundInput): Promise<RefundResult> {
    throw new Error('not implemented — covered in Task 14');
  }
}
```

- [ ] **Step 4: Run test**

```powershell
pnpm --filter @koncie/web test kovena-mock.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/adapters/kovena-mock.ts apps/web/src/adapters/kovena-mock.test.ts
git commit -m "feat(adapter): KovenaMockAdapter.tokenizeCard"
```

---

## Task 13: KovenaMockAdapter — chargeAndCapture (TDD)

**Files:**
- Modify: `apps/web/src/adapters/kovena-mock.test.ts`
- Modify: `apps/web/src/adapters/kovena-mock.ts`

- [ ] **Step 1: Add failing tests**

Append to `apps/web/src/adapters/kovena-mock.test.ts`:

```ts
describe('KovenaMockAdapter.chargeAndCapture', () => {
  const baseInput = {
    amountMinor: 7500,
    currency: 'FJD',
    providerPayoutMinor: 6375,
    koncieFeeMinor: 1125,
    metadata: { guestId: 'g1', bookingId: 'b1', upsellId: 'u1' },
  };

  it('succeeds with a happy-path token', async () => {
    const result = await adapter.chargeAndCapture({
      ...baseInput,
      providerToken: 'tok_mock_happy_4242',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.providerPaymentRef).toMatch(/^kvn_mock_/);
      expect(result.trustLedgerExternalRef).toMatch(/^tle_/);
      expect(new Date(result.capturedAt).toString()).not.toBe('Invalid Date');
    }
  });

  it('declines for trigger card 4000000000000002 (generic decline)', async () => {
    const result = await adapter.chargeAndCapture({
      ...baseInput,
      providerToken: 'tok_mock_decline_4000000000000002',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe('card_declined');
  });

  it('declines for trigger card 4000000000009995 (insufficient funds)', async () => {
    const result = await adapter.chargeAndCapture({
      ...baseInput,
      providerToken: 'tok_mock_decline_4000000000009995',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe('insufficient_funds');
  });

  it('declines for trigger card 4000000000000127 (incorrect CVC)', async () => {
    const result = await adapter.chargeAndCapture({
      ...baseInput,
      providerToken: 'tok_mock_decline_4000000000000127',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe('incorrect_cvc');
  });

  it('rejects when fee split does not sum to amount', async () => {
    const result = await adapter.chargeAndCapture({
      ...baseInput,
      providerPayoutMinor: 6000,
      koncieFeeMinor: 1000, // 7000, not 7500
      providerToken: 'tok_mock_happy_4242',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe('validation_error');
  });
});
```

- [ ] **Step 2: Run tests to see failures**

```powershell
pnpm --filter @koncie/web test kovena-mock.test.ts
```

Expected: FAIL — `not implemented`.

- [ ] **Step 3: Implement chargeAndCapture**

Replace the `chargeAndCapture` stub in `apps/web/src/adapters/kovena-mock.ts`:

```ts
  async chargeAndCapture(input: ChargeInput): Promise<ChargeResult> {
    await sleep(NETWORK_DELAY_MS);

    if (input.providerPayoutMinor + input.koncieFeeMinor !== input.amountMinor) {
      return {
        success: false,
        reason: 'validation_error',
        message: 'fee split does not sum to amount_minor',
      };
    }

    // Fail-trigger matching — the token encodes the original PAN for the mock.
    const token = input.providerToken;
    if (token.includes('4000000000000002')) {
      return {
        success: false,
        reason: 'card_declined',
        message: 'Your card was declined.',
      };
    }
    if (token.includes('4000000000009995')) {
      return {
        success: false,
        reason: 'insufficient_funds',
        message: 'Insufficient funds on this card.',
      };
    }
    if (token.includes('4000000000000127')) {
      return {
        success: false,
        reason: 'incorrect_cvc',
        message: 'The security code was incorrect.',
      };
    }

    return {
      success: true,
      providerPaymentRef: `kvn_mock_${ulid()}`,
      trustLedgerExternalRef: `tle_${ulid()}`,
      capturedAt: new Date().toISOString(),
    };
  }
```

- [ ] **Step 4: Adjust `tokenizeCard` so the token carries the original PAN**

In `tokenizeCard`, change the happy-path return so the token embeds the PAN for the mock to reflect on:

```ts
    return {
      success: true,
      providerToken: `tok_mock_${ulid()}_${input.pan}`,
      brand: brandFromPan(input.pan),
      last4: input.pan.slice(-4),
    };
```

- [ ] **Step 5: Update the `baseInput` test fixtures to match the new token shape**

The test file already uses explicit strings like `tok_mock_decline_4000000000000002`; no edit needed because `chargeAndCapture` matches by substring. Re-run tests:

```powershell
pnpm --filter @koncie/web test kovena-mock.test.ts
```

Expected: 9 passed (4 tokenize + 5 charge).

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/adapters/kovena-mock.ts apps/web/src/adapters/kovena-mock.test.ts
git commit -m "feat(adapter): KovenaMockAdapter.chargeAndCapture with fail-trigger cards"
```

---

## Task 14: KovenaMockAdapter — refund data-only stub

**Files:**
- Modify: `apps/web/src/adapters/kovena-mock.test.ts`
- Modify: `apps/web/src/adapters/kovena-mock.ts`

- [ ] **Step 1: Add test**

Append to `apps/web/src/adapters/kovena-mock.test.ts`:

```ts
describe('KovenaMockAdapter.refund', () => {
  it('returns data_model_only in Sprint 2 (no ledger side-effect)', async () => {
    const result = await adapter.refund({
      providerPaymentRef: 'kvn_mock_abc',
      amountMinor: 7500,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe('data_model_only');
  });
});
```

- [ ] **Step 2: Implement**

Replace the `refund` stub:

```ts
  async refund(_input: RefundInput): Promise<RefundResult> {
    await sleep(NETWORK_DELAY_MS);
    return {
      success: false,
      reason: 'data_model_only',
      message:
        'Refunds are defined in the data model but not executable in Sprint 2 — see docs/payments.md',
    };
  }
```

- [ ] **Step 3: Run + commit**

```powershell
pnpm --filter @koncie/web test kovena-mock.test.ts
git add apps/web/src/adapters/kovena-mock.ts apps/web/src/adapters/kovena-mock.test.ts
git commit -m "feat(adapter): refund data-only stub"
```

Expected: 10 passed.

---

## Task 15: PaymentProvider DI module

**Files:**
- Create: `apps/web/src/lib/payments/provider.ts`

- [ ] **Step 1: Create the DI boundary**

Create `apps/web/src/lib/payments/provider.ts`:

```ts
import type { PaymentProvider } from '@koncie/types';
import { KovenaMockAdapter } from '@/adapters/kovena-mock';

/**
 * Single source of truth for the payment provider. Every server action and
 * server component imports `paymentProvider` from here — never the adapter
 * module directly. Sprint 3 swaps in the real Kovena wrapper right here.
 */
export const paymentProvider: PaymentProvider = new KovenaMockAdapter();
```

- [ ] **Step 2: Commit**

```powershell
git add apps/web/src/lib/payments/provider.ts
git commit -m "feat(payments): DI module for PaymentProvider"
```

---

## Task 16: Checkout server action — scaffolding + validation test (TDD)

**Files:**
- Create: `apps/web/src/app/hub/checkout/actions.ts`
- Create: `apps/web/src/app/hub/checkout/actions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/app/hub/checkout/actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/payments/provider', () => ({ paymentProvider: {} }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { purchaseUpsell } from './actions';

describe('purchaseUpsell input validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects missing upsellId', async () => {
    await expect(
      purchaseUpsell({
        upsellId: '',
        guestId: 'g1',
        bookingId: 'b1',
        cardInput: { pan: '4242424242424242', expiryMonth: 12, expiryYear: 2030, cvc: '123', cardholderName: 'Jane' },
        saveCard: false,
      }),
    ).rejects.toThrow(/upsellId/i);
  });

  it('rejects PAN shorter than 12 digits', async () => {
    await expect(
      purchaseUpsell({
        upsellId: 'u1',
        guestId: 'g1',
        bookingId: 'b1',
        cardInput: { pan: '4242', expiryMonth: 12, expiryYear: 2030, cvc: '123', cardholderName: 'Jane' },
        saveCard: false,
      }),
    ).rejects.toThrow(/card number/i);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```powershell
pnpm --filter @koncie/web test actions.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the server action skeleton with Zod validation**

Create `apps/web/src/app/hub/checkout/actions.ts`:

```ts
'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { paymentProvider } from '@/lib/payments/provider';
import { computeFeeSplit, convertMinorUnits, fxRateFor } from '@/lib/money';
import {
  PaymentConfigurationError,
  PaymentDeclinedError,
  PaymentValidationError,
} from '@/lib/errors/payments';
import type { PaymentFailureReason } from '@koncie/types';

const InputSchema = z.object({
  upsellId: z.string().min(1, 'upsellId is required'),
  guestId: z.string().min(1),
  bookingId: z.string().min(1),
  savedCardId: z.string().optional(),
  cardInput: z
    .object({
      pan: z.string().min(12, 'card number must be at least 12 digits').max(19),
      expiryMonth: z.number().int().min(1).max(12),
      expiryYear: z.number().int().min(2000).max(2100),
      cvc: z.string().min(3).max(4),
      cardholderName: z.string().min(1),
    })
    .optional(),
  saveCard: z.boolean(),
});

export type PurchaseInput = z.infer<typeof InputSchema>;

export async function purchaseUpsell(raw: PurchaseInput): Promise<void> {
  const input = InputSchema.parse(raw);

  if (!input.cardInput && !input.savedCardId) {
    throw new PaymentValidationError('Either cardInput or savedCardId is required');
  }

  // Remaining flow implemented in Task 17.
  throw new Error('not implemented — covered in Task 17');
}
```

- [ ] **Step 4: Run tests to verify pass**

```powershell
pnpm --filter @koncie/web test actions.test.ts
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/app/hub/checkout/actions.ts apps/web/src/app/hub/checkout/actions.test.ts
git commit -m "feat(checkout): server action skeleton with Zod input validation"
```

---

## Task 17: Checkout server action — happy path (TDD)

**Files:**
- Modify: `apps/web/src/app/hub/checkout/actions.test.ts`
- Modify: `apps/web/src/app/hub/checkout/actions.ts`

- [ ] **Step 1: Add the happy-path test**

Append to `apps/web/src/app/hub/checkout/actions.test.ts`:

```ts
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { paymentProvider } from '@/lib/payments/provider';

describe('purchaseUpsell happy path', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tokenizes, charges, and writes Transaction + TrustLedgerEntry atomically', async () => {
    (prisma as any).upsell = {
      findUnique: vi.fn().mockResolvedValue({
        id: 'u1',
        propertyId: 'p1',
        priceMinor: 7500,
        priceCurrency: 'FJD',
        providerPayoutPct: '85.00',
      }),
    };
    (prisma as any).booking = {
      findUnique: vi.fn().mockResolvedValue({ id: 'b1', guestId: 'g1', propertyId: 'p1' }),
    };
    const txRun = vi.fn().mockImplementation(async (cb) => cb(prisma));
    (prisma as any).$transaction = txRun;
    (prisma as any).trustLedgerEntry = { create: vi.fn().mockResolvedValue({ id: 'tle-uuid' }) };
    (prisma as any).transaction = { create: vi.fn().mockResolvedValue({ id: 'tx-uuid' }) };
    (prisma as any).savedCard = { create: vi.fn() };

    (paymentProvider as any).tokenizeCard = vi.fn().mockResolvedValue({
      success: true,
      providerToken: 'tok_mock_happy_4242',
      brand: 'VISA',
      last4: '4242',
    });
    (paymentProvider as any).chargeAndCapture = vi.fn().mockResolvedValue({
      success: true,
      providerPaymentRef: 'kvn_mock_abc',
      trustLedgerExternalRef: 'tle_abc',
      capturedAt: new Date().toISOString(),
    });

    await purchaseUpsell({
      upsellId: 'u1',
      guestId: 'g1',
      bookingId: 'b1',
      cardInput: {
        pan: '4242424242424242',
        expiryMonth: 12,
        expiryYear: 2030,
        cvc: '123',
        cardholderName: 'Jane Guest',
      },
      saveCard: false,
    });

    expect((prisma as any).trustLedgerEntry.create).toHaveBeenCalledTimes(1);
    expect((prisma as any).transaction.create).toHaveBeenCalledTimes(1);
    const txCall = (prisma as any).transaction.create.mock.calls[0][0];
    expect(txCall.data.mcc).toBe('4722');
    expect(txCall.data.amountMinor).toBe(7500);
    expect(txCall.data.providerPayoutMinor + txCall.data.koncieFeeMinor).toBe(7500);
    expect(txCall.data.currency).toBe('FJD');
    expect(txCall.data.guestDisplayCurrency).toBe('AUD');
    expect(redirect).toHaveBeenCalledWith(expect.stringContaining('/hub/checkout/success'));
  });
});
```

- [ ] **Step 2: Run test — expect fail**

```powershell
pnpm --filter @koncie/web test actions.test.ts
```

Expected: FAIL — `not implemented`.

- [ ] **Step 3: Implement the happy path**

Replace the final `throw new Error('not implemented …')` in `apps/web/src/app/hub/checkout/actions.ts` with:

```ts
  // 1. Load domain context + verify guest owns this booking and upsell is active.
  const booking = await prisma.booking.findUnique({ where: { id: input.bookingId } });
  if (!booking || booking.guestId !== input.guestId) {
    throw new PaymentValidationError('Booking not found or not owned by this guest');
  }

  const upsell = await prisma.upsell.findUnique({ where: { id: input.upsellId } });
  if (!upsell || upsell.propertyId !== booking.propertyId) {
    throw new PaymentValidationError('Upsell not available for this booking');
  }

  // 2. Resolve the provider token — new card or saved card.
  let providerToken: string;
  let cardBrandForSave: string | null = null;
  let cardLast4ForSave: string | null = null;

  if (input.savedCardId) {
    const saved = await prisma.savedCard.findUnique({ where: { id: input.savedCardId } });
    if (!saved || saved.guestId !== input.guestId) {
      throw new PaymentValidationError('Saved card not found');
    }
    providerToken = saved.providerToken;
  } else {
    if (!input.cardInput) throw new PaymentValidationError('cardInput required');
    const tokenResult = await paymentProvider.tokenizeCard(input.cardInput);
    if (!tokenResult.success) {
      throw new PaymentDeclinedError(tokenResult.reason, tokenResult.message);
    }
    providerToken = tokenResult.providerToken;
    cardBrandForSave = tokenResult.brand;
    cardLast4ForSave = tokenResult.last4;
  }

  // 3. Compute amounts + fee split.
  const amountMinor = upsell.priceMinor;
  const currency = upsell.priceCurrency;
  const guestDisplayCurrency = 'AUD'; // Sprint 2 decision: pilot cohort is Aus/NZ
  const guestDisplayAmountMinor = convertMinorUnits({
    amountMinor,
    from: currency,
    to: guestDisplayCurrency,
  });
  const { providerPayoutMinor, koncieFeeMinor } = computeFeeSplit({
    amountMinor,
    providerPayoutPct: upsell.providerPayoutPct.toString(),
  });

  // 4. Charge Kovena mock.
  const charge = await paymentProvider.chargeAndCapture({
    amountMinor,
    currency,
    providerPayoutMinor,
    koncieFeeMinor,
    providerToken,
    metadata: { guestId: input.guestId, bookingId: input.bookingId, upsellId: input.upsellId },
  });

  if (!charge.success) {
    // Record the failed transaction row (no ledger entry; status=failed).
    await prisma.transaction.create({
      data: {
        guestId: input.guestId,
        bookingId: input.bookingId,
        upsellId: input.upsellId,
        mcc: '4722',
        status: 'failed',
        amountMinor,
        currency,
        providerPayoutMinor,
        koncieFeeMinor,
        guestDisplayCurrency,
        guestDisplayAmountMinor,
        fxRateAtPurchase: fxRateFor(currency, guestDisplayCurrency),
        paymentProvider: 'KOVENA_MOCK',
        providerPaymentRef: `kvn_mock_failed_${crypto.randomUUID()}`,
        failureReason: `${charge.reason}: ${charge.message}`,
      },
    });
    redirect(`/hub/checkout/failed?reason=${charge.reason}&upsellId=${input.upsellId}`);
  }

  // 5. Happy path — atomic Transaction + TrustLedgerEntry.
  try {
    const transactionId = await prisma.$transaction(async (tx) => {
      const ledger = await tx.trustLedgerEntry.create({
        data: {
          eventType: 'COLLECTED',
          amountMinor,
          currency,
          trustAccountId: 'trust_kovena_mor_fj_0001',
          externalRef: charge.trustLedgerExternalRef,
          occurredAt: new Date(charge.capturedAt),
        },
      });

      const txRow = await tx.transaction.create({
        data: {
          guestId: input.guestId,
          bookingId: input.bookingId,
          upsellId: input.upsellId,
          savedCardId: input.savedCardId,
          mcc: '4722',
          status: 'captured',
          amountMinor,
          currency,
          providerPayoutMinor,
          koncieFeeMinor,
          guestDisplayCurrency,
          guestDisplayAmountMinor,
          fxRateAtPurchase: fxRateFor(currency, guestDisplayCurrency),
          paymentProvider: 'KOVENA_MOCK',
          providerPaymentRef: charge.providerPaymentRef,
          trustLedgerId: ledger.id,
          capturedAt: new Date(charge.capturedAt),
        },
      });

      if (input.saveCard && input.cardInput && cardBrandForSave && cardLast4ForSave) {
        const existingDefault = await tx.savedCard.findFirst({
          where: { guestId: input.guestId, isDefault: true },
        });
        await tx.savedCard.create({
          data: {
            guestId: input.guestId,
            providerToken,
            brand: cardBrandForSave,
            last4: cardLast4ForSave,
            expiryMonth: input.cardInput.expiryMonth,
            expiryYear: input.cardInput.expiryYear,
            isDefault: !existingDefault,
          },
        });
      }

      return txRow.id;
    });

    redirect(`/hub/checkout/success?transactionId=${transactionId}`);
  } catch (err) {
    // Kovena captured but Prisma rolled back — out-of-band reconciliation.
    if (err instanceof PaymentConfigurationError) throw err;
    // Re-throw control-flow errors (Next.js redirect()) untouched
    if (err && typeof err === 'object' && 'digest' in err) throw err;
    console.error('[sprint-2] captured-but-db-rollback', {
      providerPaymentRef: charge.providerPaymentRef,
      guestId: input.guestId,
      bookingId: input.bookingId,
      upsellId: input.upsellId,
      error: err,
    });
    // TODO(sprint-3): replace console.error with Sentry.captureException
    throw err;
  }
}
```

- [ ] **Step 4: Run tests**

```powershell
pnpm --filter @koncie/web test actions.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/app/hub/checkout/actions.ts apps/web/src/app/hub/checkout/actions.test.ts
git commit -m "feat(checkout): happy path writes Transaction + TrustLedgerEntry atomically"
```

---

## Task 18: Checkout server action — fail path test (TDD)

**Files:**
- Modify: `apps/web/src/app/hub/checkout/actions.test.ts`

- [ ] **Step 1: Add fail-path test**

Append to `apps/web/src/app/hub/checkout/actions.test.ts`:

```ts
describe('purchaseUpsell decline path', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes failed Transaction without ledger and redirects to /failed', async () => {
    (prisma as any).upsell = {
      findUnique: vi.fn().mockResolvedValue({
        id: 'u1',
        propertyId: 'p1',
        priceMinor: 7500,
        priceCurrency: 'FJD',
        providerPayoutPct: '85.00',
      }),
    };
    (prisma as any).booking = {
      findUnique: vi.fn().mockResolvedValue({ id: 'b1', guestId: 'g1', propertyId: 'p1' }),
    };
    (prisma as any).$transaction = vi.fn();
    (prisma as any).trustLedgerEntry = { create: vi.fn() };
    (prisma as any).transaction = { create: vi.fn().mockResolvedValue({ id: 'tx-fail-uuid' }) };

    (paymentProvider as any).tokenizeCard = vi.fn().mockResolvedValue({
      success: true,
      providerToken: 'tok_mock_decline_4000000000000002',
      brand: 'VISA',
      last4: '0002',
    });
    (paymentProvider as any).chargeAndCapture = vi.fn().mockResolvedValue({
      success: false,
      reason: 'card_declined',
      message: 'Your card was declined.',
    });

    await purchaseUpsell({
      upsellId: 'u1',
      guestId: 'g1',
      bookingId: 'b1',
      cardInput: {
        pan: '4000000000000002',
        expiryMonth: 12,
        expiryYear: 2030,
        cvc: '123',
        cardholderName: 'Jane',
      },
      saveCard: false,
    });

    expect((prisma as any).transaction.create).toHaveBeenCalledTimes(1);
    const createCall = (prisma as any).transaction.create.mock.calls[0][0];
    expect(createCall.data.status).toBe('failed');
    expect(createCall.data.failureReason).toMatch(/card_declined/);
    expect((prisma as any).trustLedgerEntry.create).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith(expect.stringContaining('/hub/checkout/failed'));
  });
});
```

- [ ] **Step 2: Run tests**

```powershell
pnpm --filter @koncie/web test actions.test.ts
```

Expected: 4 passed. (The fail-path logic was already implemented in Task 17; this test simply locks it.)

- [ ] **Step 3: Commit**

```powershell
git add apps/web/src/app/hub/checkout/actions.test.ts
git commit -m "test(checkout): lock decline-path Transaction + redirect behaviour"
```

---

## Task 19: Activity card + price pair components

**Files:**
- Create: `apps/web/src/components/activities/price-pair.tsx`
- Create: `apps/web/src/components/activities/activity-card.tsx`

- [ ] **Step 1: Price pair component**

Create `apps/web/src/components/activities/price-pair.tsx`:

```tsx
import { formatPricePair } from '@/lib/money';

export interface PricePairProps {
  amountMinor: number;
  currency: string;
  guestDisplayAmountMinor: number;
  guestDisplayCurrency: string;
  size?: 'sm' | 'md' | 'lg';
}

export function PricePair({ size = 'md', ...rest }: PricePairProps) {
  const classes = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base font-semibold',
  }[size];
  return <span className={`text-koncie-charcoal ${classes}`}>{formatPricePair(rest)}</span>;
}
```

- [ ] **Step 2: Activity card**

Create `apps/web/src/components/activities/activity-card.tsx`:

```tsx
import Link from 'next/link';
import { PricePair } from './price-pair';
import { convertMinorUnits } from '@/lib/money';

export interface ActivityCardProps {
  id: string;
  name: string;
  description: string;
  priceMinor: number;
  priceCurrency: string;
  imageUrl: string;
}

export function ActivityCard({
  id,
  name,
  description,
  priceMinor,
  priceCurrency,
  imageUrl,
}: ActivityCardProps) {
  const guestDisplayAmountMinor = convertMinorUnits({
    amountMinor: priceMinor,
    from: priceCurrency,
    to: 'AUD',
  });

  return (
    <Link
      href={`/hub/activities/${id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-koncie-border bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      <div
        className="aspect-[4/3] bg-koncie-sand bg-cover bg-center"
        style={{ backgroundImage: `url(${imageUrl})` }}
      />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="text-base font-semibold text-koncie-navy">{name}</h3>
        <p className="line-clamp-2 text-xs text-koncie-charcoal/80">{description}</p>
        <div className="mt-auto pt-2">
          <PricePair
            amountMinor={priceMinor}
            currency={priceCurrency}
            guestDisplayAmountMinor={guestDisplayAmountMinor}
            guestDisplayCurrency="AUD"
            size="md"
          />
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 3: Commit**

```powershell
git add apps/web/src/components/activities/
git commit -m "feat(ui): ActivityCard + PricePair components"
```

---

## Task 20: Activities browse page

**Files:**
- Create: `apps/web/src/app/hub/activities/page.tsx`

- [ ] **Step 1: Write the page**

Create `apps/web/src/app/hub/activities/page.tsx`:

```tsx
import { prisma } from '@/lib/db/prisma';
import { requireSignedInGuest } from '@/lib/auth/session';
import { ActivityCard } from '@/components/activities/activity-card';

export const dynamic = 'force-dynamic';

export default async function ActivitiesPage() {
  const { guest, booking } = await requireSignedInGuest();

  const upsells = await prisma.upsell.findMany({
    where: { propertyId: booking.propertyId, status: 'ACTIVE' },
    orderBy: { priceMinor: 'asc' },
  });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <header>
        <h1 className="text-3xl font-semibold text-koncie-navy">Activities</h1>
        <p className="mt-1 text-sm text-koncie-charcoal/80">
          Curated for your stay at {booking.property.name}. Prices shown include GST where applicable.
        </p>
      </header>

      {upsells.length === 0 ? (
        <p className="text-sm text-koncie-charcoal/70">
          Nothing published for this property yet. Check back closer to your arrival date.
        </p>
      ) : (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Verify the helper exists**

`requireSignedInGuest` should already exist from Sprint 1. If the signature differs, adapt the destructure to return `{ guest, booking: { ...include property } }`. If it does NOT return booking, extend it now:

```ts
// apps/web/src/lib/auth/session.ts — ensure this shape exists
export async function requireSignedInGuest() {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/register');
  const guest = await prisma.guest.findFirst({
    where: { authUserId: user.id },
    include: {
      bookings: { include: { property: true }, orderBy: { checkIn: 'desc' }, take: 1 },
    },
  });
  if (!guest || guest.bookings.length === 0) redirect('/welcome');
  return { guest, booking: guest.bookings[0] };
}
```

- [ ] **Step 3: Manual smoke test**

Run dev server, sign in with the magic link, navigate to `/hub/activities`. Expected: 5 cards (snorkel, sail, spa, surf, village).

```powershell
pnpm --filter @koncie/web dev
```

- [ ] **Step 4: Commit**

```powershell
git add apps/web/src/app/hub/activities/page.tsx apps/web/src/lib/auth/session.ts
git commit -m "feat(hub): activities browse page"
```

---

## Task 21: Activity detail page

**Files:**
- Create: `apps/web/src/app/hub/activities/[id]/page.tsx`

- [ ] **Step 1: Write the page**

Create `apps/web/src/app/hub/activities/[id]/page.tsx`:

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { requireSignedInGuest } from '@/lib/auth/session';
import { PricePair } from '@/components/activities/price-pair';
import { convertMinorUnits } from '@/lib/money';

export const dynamic = 'force-dynamic';

interface Params {
  params: { id: string };
}

export default async function ActivityDetailPage({ params }: Params) {
  const { booking } = await requireSignedInGuest();
  const upsell = await prisma.upsell.findUnique({ where: { id: params.id } });

  if (!upsell || upsell.propertyId !== booking.propertyId || upsell.status !== 'ACTIVE') {
    notFound();
  }

  const guestDisplayAmountMinor = convertMinorUnits({
    amountMinor: upsell.priceMinor,
    from: upsell.priceCurrency,
    to: 'AUD',
  });

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <div
        className="aspect-[16/9] w-full rounded-2xl bg-koncie-sand bg-cover bg-center"
        style={{ backgroundImage: `url(${upsell.imageUrl})` }}
      />

      <h1 className="mt-6 text-3xl font-semibold text-koncie-navy">{upsell.name}</h1>
      <p className="mt-3 text-sm leading-relaxed text-koncie-charcoal">{upsell.description}</p>

      <div className="mt-6 flex items-center justify-between rounded-2xl border border-koncie-border bg-white p-4">
        <PricePair
          amountMinor={upsell.priceMinor}
          currency={upsell.priceCurrency}
          guestDisplayAmountMinor={guestDisplayAmountMinor}
          guestDisplayCurrency="AUD"
          size="lg"
        />
        <Link
          href={`/hub/checkout?upsellId=${upsell.id}`}
          className="rounded-full bg-koncie-navy px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Book now →
        </Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
git add apps/web/src/app/hub/activities/[id]/page.tsx
git commit -m "feat(hub): activity detail page with Book now CTA"
```

---

## Task 22: Card form component

**Files:**
- Create: `apps/web/src/components/checkout/card-form.tsx`

- [ ] **Step 1: Write the client component**

Create `apps/web/src/components/checkout/card-form.tsx`:

```tsx
'use client';

import { useState } from 'react';

export interface CardFormValues {
  pan: string;
  expiryMonth: number;
  expiryYear: number;
  cvc: string;
  cardholderName: string;
}

interface CardFormProps {
  name: string; // hidden input JSON payload name
}

/**
 * TODO(sprint-3): replace with Kovena's hosted card iframe so the PAN never
 * touches our server. Sprint 2 mock accepts plaintext PAN for fail-trigger testing.
 */
export function CardForm({ name }: CardFormProps) {
  const [values, setValues] = useState<CardFormValues>({
    pan: '',
    expiryMonth: 12,
    expiryYear: new Date().getFullYear() + 1,
    cvc: '',
    cardholderName: '',
  });

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-xs font-semibold text-koncie-charcoal">
        Card number
        <input
          type="text"
          inputMode="numeric"
          autoComplete="cc-number"
          value={values.pan}
          onChange={(e) => setValues({ ...values, pan: e.target.value.replace(/\s/g, '') })}
          placeholder="4242 4242 4242 4242"
          className="rounded-lg border border-koncie-border bg-white px-3 py-2 font-mono text-sm"
          required
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold text-koncie-charcoal">
          Expiry
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              max={12}
              value={values.expiryMonth}
              onChange={(e) => setValues({ ...values, expiryMonth: Number(e.target.value) })}
              className="w-16 rounded-lg border border-koncie-border bg-white px-2 py-2 text-sm"
              required
            />
            <span className="self-center">/</span>
            <input
              type="number"
              min={2000}
              max={2100}
              value={values.expiryYear}
              onChange={(e) => setValues({ ...values, expiryYear: Number(e.target.value) })}
              className="w-24 rounded-lg border border-koncie-border bg-white px-2 py-2 text-sm"
              required
            />
          </div>
        </label>

        <label className="flex flex-col gap-1 text-xs font-semibold text-koncie-charcoal">
          CVC
          <input
            type="text"
            inputMode="numeric"
            autoComplete="cc-csc"
            value={values.cvc}
            onChange={(e) => setValues({ ...values, cvc: e.target.value })}
            placeholder="123"
            className="rounded-lg border border-koncie-border bg-white px-3 py-2 text-sm"
            required
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-xs font-semibold text-koncie-charcoal">
        Name on card
        <input
          type="text"
          autoComplete="cc-name"
          value={values.cardholderName}
          onChange={(e) => setValues({ ...values, cardholderName: e.target.value })}
          className="rounded-lg border border-koncie-border bg-white px-3 py-2 text-sm"
          required
        />
      </label>

      <input type="hidden" name={name} value={JSON.stringify(values)} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
git add apps/web/src/components/checkout/card-form.tsx
git commit -m "feat(checkout): CardForm client component (plaintext PAN — mock only)"
```

---

## Task 23: Saved-card row component

**Files:**
- Create: `apps/web/src/components/checkout/saved-card-row.tsx`

- [ ] **Step 1: Write the component**

Create `apps/web/src/components/checkout/saved-card-row.tsx`:

```tsx
export interface SavedCardRowProps {
  id: string;
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  selected: boolean;
  onSelectName: string; // radio input name
}

const BRAND_SYMBOL: Record<string, string> = {
  VISA: 'Visa',
  MASTERCARD: 'Mastercard',
  AMEX: 'Amex',
  OTHER: 'Card',
};

export function SavedCardRow({
  id,
  brand,
  last4,
  expiryMonth,
  expiryYear,
  selected,
  onSelectName,
}: SavedCardRowProps) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-koncie-border bg-white p-3 text-sm">
      <input type="radio" name={onSelectName} value={id} defaultChecked={selected} />
      <span className="flex-1">
        <span className="font-semibold text-koncie-navy">
          {BRAND_SYMBOL[brand] ?? 'Card'} ending {last4}
        </span>
        <span className="ml-2 text-xs text-koncie-charcoal/60">
          Expires {String(expiryMonth).padStart(2, '0')}/{String(expiryYear).slice(-2)}
        </span>
      </span>
    </label>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
git add apps/web/src/components/checkout/saved-card-row.tsx
git commit -m "feat(checkout): SavedCardRow component"
```

---

## Task 24: Checkout page

**Files:**
- Create: `apps/web/src/app/hub/checkout/page.tsx`

- [ ] **Step 1: Write the page**

Create `apps/web/src/app/hub/checkout/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { requireSignedInGuest } from '@/lib/auth/session';
import { CardForm } from '@/components/checkout/card-form';
import { SavedCardRow } from '@/components/checkout/saved-card-row';
import { PricePair } from '@/components/activities/price-pair';
import { convertMinorUnits } from '@/lib/money';
import { purchaseUpsell } from './actions';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: { upsellId?: string };
}

export default async function CheckoutPage({ searchParams }: Props) {
  if (!searchParams.upsellId) redirect('/payment');

  const { guest, booking } = await requireSignedInGuest();
  const upsell = await prisma.upsell.findUnique({ where: { id: searchParams.upsellId } });
  if (!upsell || upsell.propertyId !== booking.propertyId) redirect('/hub/activities');

  const savedCards = await prisma.savedCard.findMany({
    where: { guestId: guest.id },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
  const hasSavedCards = savedCards.length > 0;

  const guestDisplayAmountMinor = convertMinorUnits({
    amountMinor: upsell.priceMinor,
    from: upsell.priceCurrency,
    to: 'AUD',
  });

  async function checkoutAction(formData: FormData) {
    'use server';
    const savedCardId = formData.get('savedCardId')?.toString();
    const cardJson = formData.get('cardInput')?.toString();
    const saveCard = formData.get('saveCard') === 'on';

    if (!upsell) redirect('/hub/activities');

    await purchaseUpsell({
      upsellId: upsell.id,
      guestId: guest.id,
      bookingId: booking.id,
      savedCardId: savedCardId && savedCardId !== '__new__' ? savedCardId : undefined,
      cardInput: cardJson && (!savedCardId || savedCardId === '__new__') ? JSON.parse(cardJson) : undefined,
      saveCard,
    });
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8">
      <h1 className="text-2xl font-semibold text-koncie-navy">Review &amp; pay</h1>

      <section className="mt-4 rounded-2xl border border-koncie-border bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-koncie-navy">{upsell.name}</p>
            <p className="text-xs text-koncie-charcoal/70">{booking.property.name}</p>
          </div>
          <PricePair
            amountMinor={upsell.priceMinor}
            currency={upsell.priceCurrency}
            guestDisplayAmountMinor={guestDisplayAmountMinor}
            guestDisplayCurrency="AUD"
            size="md"
          />
        </div>
      </section>

      <form action={checkoutAction} className="mt-6 flex flex-col gap-4">
        {hasSavedCards && (
          <section className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-koncie-charcoal">Pay with</p>
            {savedCards.map((c) => (
              <SavedCardRow
                key={c.id}
                id={c.id}
                brand={c.brand}
                last4={c.last4}
                expiryMonth={c.expiryMonth}
                expiryYear={c.expiryYear}
                selected={c.isDefault}
                onSelectName="savedCardId"
              />
            ))}
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-koncie-border p-3 text-sm">
              <input type="radio" name="savedCardId" value="__new__" />
              <span>Use a different card</span>
            </label>
          </section>
        )}

        {/* New-card form — shown when no saved cards OR "Use a different card" is selected. */}
        <details open={!hasSavedCards} className="flex flex-col gap-2">
          <summary className="cursor-pointer text-xs font-semibold text-koncie-charcoal">
            Enter a new card
          </summary>
          <div className="mt-3">
            <CardForm name="cardInput" />
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs text-koncie-charcoal">
            <input type="checkbox" name="saveCard" defaultChecked={!hasSavedCards} />
            Save this card for later
          </label>
        </details>

        <button
          type="submit"
          className="mt-4 rounded-full bg-koncie-navy px-5 py-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Pay {Number(upsell.priceMinor / 100).toFixed(2)} {upsell.priceCurrency} ≈{' '}
          {Number(guestDisplayAmountMinor / 100).toFixed(2)} AUD
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Manual smoke test**

```powershell
pnpm --filter @koncie/web dev
```

Navigate: `/hub/activities` → click a card → `/hub/activities/<id>` → Book now → `/hub/checkout`. Expected: upsell summary + card form + pay button.

- [ ] **Step 3: Commit**

```powershell
git add apps/web/src/app/hub/checkout/page.tsx
git commit -m "feat(checkout): checkout page with saved-card picker + new-card form"
```

---

## Task 25: Success page

**Files:**
- Create: `apps/web/src/app/hub/checkout/success/page.tsx`

- [ ] **Step 1: Write the page**

Create `apps/web/src/app/hub/checkout/success/page.tsx`:

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { requireSignedInGuest } from '@/lib/auth/session';
import { formatPricePair } from '@/lib/money';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: { transactionId?: string };
}

export default async function CheckoutSuccessPage({ searchParams }: Props) {
  if (!searchParams.transactionId) notFound();
  const { guest } = await requireSignedInGuest();

  const tx = await prisma.transaction.findUnique({
    where: { id: searchParams.transactionId },
    include: { upsell: true },
  });

  if (!tx || tx.guestId !== guest.id || tx.status !== 'captured') notFound();

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col items-center px-4 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-koncie-green/20 text-3xl">
        ✓
      </div>
      <h1 className="mt-4 text-2xl font-semibold text-koncie-navy">You're booked</h1>
      <p className="mt-2 text-sm text-koncie-charcoal/80">See you at the reef. Receipt below.</p>

      <section className="mt-8 w-full rounded-2xl border border-koncie-border bg-white p-5 text-left">
        <p className="text-sm font-semibold text-koncie-navy">{tx.upsell.name}</p>
        <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-xs">
          <dt className="text-koncie-charcoal/60">Amount paid</dt>
          <dd className="text-right font-mono text-koncie-charcoal">
            {formatPricePair({
              amountMinor: tx.amountMinor,
              currency: tx.currency,
              guestDisplayAmountMinor: tx.guestDisplayAmountMinor,
              guestDisplayCurrency: tx.guestDisplayCurrency,
            })}
          </dd>
          <dt className="text-koncie-charcoal/60">Receipt number</dt>
          <dd className="text-right font-mono text-koncie-charcoal">{tx.providerPaymentRef}</dd>
          <dt className="text-koncie-charcoal/60">Captured at</dt>
          <dd className="text-right font-mono text-koncie-charcoal">
            {tx.capturedAt?.toISOString()}
          </dd>
        </dl>
      </section>

      <Link
        href="/hub"
        className="mt-8 rounded-full bg-koncie-navy px-6 py-3 text-sm font-semibold text-white"
      >
        Back to hub
      </Link>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
git add apps/web/src/app/hub/checkout/success/page.tsx
git commit -m "feat(checkout): success confirmation with receipt breakdown"
```

---

## Task 26: Failed page

**Files:**
- Create: `apps/web/src/app/hub/checkout/failed/page.tsx`

- [ ] **Step 1: Write the page**

Create `apps/web/src/app/hub/checkout/failed/page.tsx`:

```tsx
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const FRIENDLY_REASONS: Record<string, string> = {
  card_declined: 'Your bank declined the charge.',
  insufficient_funds: 'Your card has insufficient funds for this purchase.',
  incorrect_cvc: 'The security code didn’t match.',
  validation_error: 'Something on the card details wasn’t accepted.',
  provider_unavailable: 'We couldn’t reach our payment provider. Please try again in a moment.',
  configuration_error: 'There was a configuration issue on our end. Please try again shortly.',
};

interface Props {
  searchParams: { reason?: string; upsellId?: string };
}

export default function CheckoutFailedPage({ searchParams }: Props) {
  const reason = searchParams.reason ?? 'card_declined';
  const message = FRIENDLY_REASONS[reason] ?? 'The payment didn’t go through.';
  const retryHref = searchParams.upsellId ? `/hub/checkout?upsellId=${searchParams.upsellId}` : '/hub/activities';

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col items-center px-4 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-koncie-sand text-3xl text-koncie-navy">
        !
      </div>
      <h1 className="mt-4 text-2xl font-semibold text-koncie-navy">Payment didn’t go through</h1>
      <p className="mt-2 max-w-sm text-sm text-koncie-charcoal/80">{message}</p>

      <div className="mt-8 flex flex-col gap-3">
        <Link
          href={retryHref}
          className="rounded-full bg-koncie-navy px-6 py-3 text-sm font-semibold text-white"
        >
          Try again
        </Link>
        <Link href="/hub" className="text-xs text-koncie-charcoal/70 underline">
          Back to hub
        </Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
git add apps/web/src/app/hub/checkout/failed/page.tsx
git commit -m "feat(checkout): soft failure page with retry"
```

---

## Task 27: /payment MoR empty-state page

**Files:**
- Create: `apps/web/src/app/payment/page.tsx`

- [ ] **Step 1: Write the page**

Create `apps/web/src/app/payment/page.tsx`:

```tsx
import Link from 'next/link';

export default function PaymentLandingPage() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col items-center px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-koncie-navy">Payment</h1>
      <p className="mt-4 max-w-sm text-sm text-koncie-charcoal/80">
        Your resort booking is already paid for. You don’t have any add-ons selected for payment.
      </p>
      <Link
        href="/hub/activities"
        className="mt-6 rounded-full bg-koncie-navy px-6 py-3 text-sm font-semibold text-white"
      >
        Browse activities →
      </Link>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```powershell
git add apps/web/src/app/payment/page.tsx
git commit -m "feat(payment): MoR-only empty state"
```

---

## Task 28: "Your add-ons" hub section + hub integration

**Files:**
- Create: `apps/web/src/components/hub/addons-section.tsx`
- Modify: `apps/web/src/app/hub/page.tsx`

- [ ] **Step 1: Write the component**

Create `apps/web/src/components/hub/addons-section.tsx`:

```tsx
import { formatPricePair } from '@/lib/money';

interface AddonRow {
  id: string;
  name: string;
  createdAt: Date;
  amountMinor: number;
  currency: string;
  guestDisplayAmountMinor: number;
  guestDisplayCurrency: string;
}

export function AddonsSection({ rows }: { rows: AddonRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="mt-6 rounded-2xl border border-koncie-border bg-white p-4">
      <h2 className="text-sm font-semibold text-koncie-navy">Your add-ons</h2>
      <ul className="mt-3 flex flex-col divide-y divide-koncie-border/60">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between py-3">
            <span className="text-sm text-koncie-charcoal">{r.name}</span>
            <span className="text-xs font-mono text-koncie-charcoal/80">
              {formatPricePair({
                amountMinor: r.amountMinor,
                currency: r.currency,
                guestDisplayAmountMinor: r.guestDisplayAmountMinor,
                guestDisplayCurrency: r.guestDisplayCurrency,
              })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: Wire it into the hub page**

Modify `apps/web/src/app/hub/page.tsx`. Replace the stubbed "Activities · Coming soon" card with a live block, and add the add-ons section below the booking hero:

```tsx
import { prisma } from '@/lib/db/prisma';
import { requireSignedInGuest } from '@/lib/auth/session';
import { BookingHero } from '@/components/hub/booking-hero';
import { AddonsSection } from '@/components/hub/addons-section';
import { ActivityCard } from '@/components/activities/activity-card';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function HubPage() {
  const { guest, booking } = await requireSignedInGuest();

  const [upsells, transactions] = await Promise.all([
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
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <BookingHero booking={booking} />

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
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```powershell
git add apps/web/src/components/hub/addons-section.tsx apps/web/src/app/hub/page.tsx
git commit -m "feat(hub): activate Activities card + 'Your add-ons' section"
```

---

## Task 29: Trip page — interleave add-ons into booking timeline

**Files:**
- Modify: `apps/web/src/app/hub/trip/page.tsx`

- [ ] **Step 1: Update trip page**

Modify `apps/web/src/app/hub/trip/page.tsx` — append below the booking detail:

```tsx
import { prisma } from '@/lib/db/prisma';
import { requireSignedInGuest } from '@/lib/auth/session';
import { AddonsSection } from '@/components/hub/addons-section';

export const dynamic = 'force-dynamic';

export default async function TripPage() {
  const { guest, booking } = await requireSignedInGuest();

  const transactions = await prisma.transaction.findMany({
    where: { guestId: guest.id, status: 'captured' },
    include: { upsell: true },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      {/* ...existing booking detail render... */}

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
    </main>
  );
}
```

If the existing trip page already has imports and a main wrapper, merge — keep the existing booking-detail markup and drop `<AddonsSection …/>` at the bottom.

- [ ] **Step 2: Commit**

```powershell
git add apps/web/src/app/hub/trip/page.tsx
git commit -m "feat(trip): surface captured add-ons under booking timeline"
```

---

## Task 30: Playwright E2E — happy path

**Files:**
- Create: `apps/web/tests/e2e/checkout.spec.ts`

- [ ] **Step 1: Write the spec**

Create `apps/web/tests/e2e/checkout.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('Sprint 2 checkout', () => {
  test.beforeEach(async ({ page }) => {
    // Assumes the dev helper `/__test__/sign-in-as-seed-guest` exists from Sprint 1.
    await page.goto('/__test__/sign-in-as-seed-guest');
    await expect(page).toHaveURL(/\/hub$/);
  });

  test('happy path — Half-day reef snorkel → paid', async ({ page }) => {
    await page.getByRole('link', { name: /browse all/i }).click();
    await expect(page).toHaveURL(/\/hub\/activities$/);

    await page.getByRole('link', { name: /Half-day reef snorkel/i }).click();
    await page.getByRole('link', { name: /book now/i }).click();

    await page.getByLabel(/card number/i).fill('4242424242424242');
    await page.getByLabel(/cvc/i).fill('123');
    await page.getByLabel(/name on card/i).fill('Jane Guest');

    await page.getByRole('button', { name: /pay/i }).click();

    await expect(page).toHaveURL(/\/hub\/checkout\/success/);
    await expect(page.getByText(/you.?re booked/i)).toBeVisible();
    await expect(page.getByText(/kvn_mock_/)).toBeVisible();

    await page.getByRole('link', { name: /back to hub/i }).click();
    await expect(page.getByText(/your add-ons/i)).toBeVisible();
    await expect(page.getByText(/half-day reef snorkel/i)).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the spec**

```powershell
pnpm --filter @koncie/web exec playwright test tests/e2e/checkout.spec.ts --project=chromium
```

Expected: 1 passed.

- [ ] **Step 3: Commit**

```powershell
git add apps/web/tests/e2e/checkout.spec.ts
git commit -m "test(e2e): happy-path checkout with seeded Namotu upsell"
```

---

## Task 31: Playwright E2E — fail-trigger card

**Files:**
- Modify: `apps/web/tests/e2e/checkout.spec.ts`

- [ ] **Step 1: Add fail-path spec**

Append to `apps/web/tests/e2e/checkout.spec.ts`:

```ts
test.describe('Sprint 2 checkout — fail trigger', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/__test__/sign-in-as-seed-guest');
  });

  test('4000000000000002 declines and retry succeeds', async ({ page }) => {
    await page.goto('/hub/activities');
    await page.getByRole('link', { name: /Sunset sail/i }).click();
    await page.getByRole('link', { name: /book now/i }).click();

    await page.getByLabel(/card number/i).fill('4000000000000002');
    await page.getByLabel(/cvc/i).fill('123');
    await page.getByLabel(/name on card/i).fill('Jane Guest');

    await page.getByRole('button', { name: /pay/i }).click();

    await expect(page).toHaveURL(/\/hub\/checkout\/failed/);
    await expect(page.getByText(/didn.?t go through/i)).toBeVisible();

    // Retry with happy card
    await page.getByRole('link', { name: /try again/i }).click();
    await page.getByLabel(/card number/i).fill('4242424242424242');
    await page.getByLabel(/cvc/i).fill('123');
    await page.getByLabel(/name on card/i).fill('Jane Guest');
    await page.getByRole('button', { name: /pay/i }).click();

    await expect(page).toHaveURL(/\/hub\/checkout\/success/);
  });
});
```

- [ ] **Step 2: Run + commit**

```powershell
pnpm --filter @koncie/web exec playwright test tests/e2e/checkout.spec.ts --project=chromium
git add apps/web/tests/e2e/checkout.spec.ts
git commit -m "test(e2e): fail-trigger decline + retry-to-success"
```

Expected: 2 passed.

---

## Task 32: Update root CI with Sprint 2 test coverage

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Ensure Vitest + Playwright jobs cover the new paths**

Open `.github/workflows/ci.yml`. The Sprint 1 CI already runs `pnpm test` and `pnpm build`. Add Playwright to a separate job if not present:

```yaml
  e2e:
    name: Playwright E2E
    runs-on: ubuntu-latest
    timeout-minutes: 20
    needs: checks
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.33.1
          run_install: false
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @koncie/web exec playwright install --with-deps chromium
      - env:
          DATABASE_URL: 'postgresql://ci:ci@localhost:5432/ci?pgbouncer=true'
          DIRECT_URL: 'postgresql://ci:ci@localhost:5432/ci'
          NEXT_PUBLIC_SUPABASE_URL: 'https://ci.placeholder.supabase.co'
          NEXT_PUBLIC_SUPABASE_ANON_KEY: 'ci-placeholder'
          SUPABASE_SERVICE_ROLE_KEY: 'ci-placeholder'
          KONCIE_SIGNED_LINK_SECRET: 'ci-placeholder-at-least-32-chars-long-xxx'
          NEXT_PUBLIC_SITE_URL: 'http://localhost:3000'
        run: pnpm --filter @koncie/web test:e2e
```

If the job already exists from Sprint 1, add `tests/e2e/checkout.spec.ts` is covered by the existing glob — verify by reading the Playwright config. No change needed in that case.

- [ ] **Step 2: Commit**

```powershell
git add .github/workflows/ci.yml
git commit -m "ci: ensure e2e job covers Sprint 2 checkout spec"
```

---

## Task 33: Docs — architecture.md

**Files:**
- Modify: `docs/architecture.md`

- [ ] **Step 1: Add the Payments section**

Append to `docs/architecture.md`:

```markdown
## Payments (Sprint 2+)

Sprint 2 adds the `PaymentProvider` port alongside the Sprint 1 `PartnerAdapter`.

```
[ app/hub/checkout/* ]
        │
        ▼
[ lib/payments/provider.ts ]  <-- DI boundary
        │
        ▼
[ PaymentProvider interface ]  (packages/types/src/payments.ts)
        │
        ▼
[ KovenaMockAdapter ]  (Sprint 2)
[ KovenaLiveAdapter ]  (Sprint 3 — not yet written)
```

**Key rule.** Nothing under `app/hub/checkout/*` imports the adapter directly. All traffic goes through the DI module. Sprint 3 swaps the exported instance in one line.

**Merchant-of-Record posture.** Every Transaction row carries `mcc='4722'`, a fee split (`amount_minor = provider_payout_minor + koncie_fee_minor`), and a 1:1 reference to a `TrustLedgerEntry` on capture. These invariants are enforced by Postgres CHECK constraints — see `docs/mor-compliance.md`.
```

- [ ] **Step 2: Commit**

```powershell
git add docs/architecture.md
git commit -m "docs(architecture): add PaymentProvider port + MoR posture"
```

---

## Task 34: Docs — data-model.md

**Files:**
- Modify: `docs/data-model.md`

- [ ] **Step 1: Append v2 entities**

Append to `docs/data-model.md`:

```markdown
## Sprint 2 additions

### Upsell

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (pk) | |
| `property_id` | uuid (fk → Property) | |
| `category` | enum | `ACTIVITY`, `TRANSFER`, `SPA`, `DINING`, `OTHER` |
| `name` | text | |
| `description` | text | |
| `price_minor` | int | minor units in `price_currency` |
| `price_currency` | char(3) | ISO 4217 |
| `provider_payout_pct` | decimal(4,2) | e.g. `85.00` |
| `image_url` | text | |
| `status` | enum | `ACTIVE` / `INACTIVE` |
| `metadata` | jsonb | |
| `created_at`, `updated_at` | timestamptz | |

### Transaction (v2 — expanded from Sprint 0 stub)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (pk) | |
| `guest_id` | uuid (fk → Guest) | |
| `booking_id` | uuid (fk → Booking) | |
| `upsell_id` | uuid (fk → Upsell) | |
| `saved_card_id` | uuid (fk → SavedCard, nullable) | |
| `mcc` | char(4), CHECK = `'4722'` | |
| `status` | enum | `pending`, `authorized`, `captured`, `failed`, `refunded` |
| `amount_minor` | int | property-currency amount |
| `currency` | char(3) | property currency |
| `provider_payout_minor` | int | |
| `koncie_fee_minor` | int | |
| `guest_display_currency` | char(3) | |
| `guest_display_amount_minor` | int | |
| `fx_rate_at_purchase` | decimal(12,6) | frozen at capture |
| `payment_provider` | enum | `KOVENA_MOCK` in Sprint 2 |
| `provider_payment_ref` | text, indexed | |
| `trust_ledger_id` | uuid (fk, nullable) | 1:1 with TrustLedgerEntry on capture |
| `captured_at` | timestamptz, nullable | |
| `failure_reason` | text, nullable | |

**DB-level CHECKs:**
- `mcc = '4722'`
- `amount_minor = provider_payout_minor + koncie_fee_minor`
- `(status = 'captured') = (trust_ledger_id IS NOT NULL)`

### TrustLedgerEntry

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (pk) | |
| `event_type` | enum | `COLLECTED`, `HELD`, `PAID_OUT`, `REFUNDED` |
| `amount_minor` | int | |
| `currency` | char(3) | |
| `trust_account_id` | text | mock `'trust_kovena_mor_fj_0001'` in Sprint 2 |
| `external_ref` | text, nullable | |
| `occurred_at` | timestamptz | |
| `created_at` | timestamptz | |

### SavedCard

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (pk) | |
| `guest_id` | uuid (fk → Guest) | |
| `provider_token` | text | opaque Kovena token |
| `brand` | text | `VISA`/`MASTERCARD`/`AMEX`/`OTHER` |
| `last4` | char(4) | |
| `expiry_month`, `expiry_year` | int | |
| `is_default` | boolean | partial unique index `(guest_id) WHERE is_default = true` |
```

- [ ] **Step 2: Commit**

```powershell
git add docs/data-model.md
git commit -m "docs(data-model): Sprint 2 entities + CHECK constraints"
```

---

## Task 35: Docs — mor-compliance.md (new)

**Files:**
- Create: `docs/mor-compliance.md`

- [ ] **Step 1: Write the doc**

Create `docs/mor-compliance.md`:

```markdown
# Merchant-of-Record compliance — the 60-second acquirer walkthrough

Koncie operates as Merchant of Record for all ancillary transactions. This doc is the
reference an acquirer or compliance reviewer uses to inspect one `transactions` row
and confirm we're shaped correctly.

## How to read a transactions row

Open Supabase → `transactions` → pick any row where `status = 'captured'`. The five
load-bearing fields:

| Field | What it proves |
|---|---|
| `mcc = '4722'` | This is a travel-agent transaction, not a direct hotel booking. Enforced at compile time and by Postgres CHECK. |
| Fee split: `amount_minor = provider_payout_minor + koncie_fee_minor` | Margin is transparent and auditable. Enforced by Postgres CHECK. |
| `trust_ledger_id` → `trust_ledger_entries` | 1:1 link to the collected-funds ledger entry. Enforced by a CHECK that forbids captured rows with null ledger refs. |
| `provider_payment_ref` | Opaque ref into Kovena's own system. Doubles as the guest-facing receipt number shown on `/hub/checkout/success`. |
| Currency pair (`currency`, `amount_minor`, `guest_display_currency`, `guest_display_amount_minor`, `fx_rate_at_purchase`) | A guest disputing an AUD statement charge can be reconciled back to the FJD capture without re-computing FX. |

## What's NOT in scope for Sprint 2

- Real KYB/KYC on providers — pilot property is pre-seeded.
- Reconciliation reports — Sprint 3+ once the real Kovena adapter lands.
- Chargebacks / disputes — Sprint 5+.
- IATA Lite / ATAS accreditation paperwork — runs parallel to engineering, not in-app.

## Out-of-band recovery path

If Kovena captures succeed but the Prisma `$transaction` rolls back, the charge
is logged via `console.error` (Sprint 2) or `Sentry.captureException` (Sprint 3) with the
`provider_payment_ref`. Ops can then back-fill the rows manually. This is pilot-scale
only — Sprint 3 upgrades to webhook-driven replay.
```

- [ ] **Step 2: Commit**

```powershell
git add docs/mor-compliance.md
git commit -m "docs(mor): acquirer walkthrough of one transactions row"
```

---

## Task 36: Docs — payments.md (new)

**Files:**
- Create: `docs/payments.md`

- [ ] **Step 1: Write the doc**

Create `docs/payments.md`:

```markdown
# Payments — port contract + Sprint 3 swap guide

## Contract

The authoritative contract is `packages/types/src/payments.ts`. Any adapter MUST:

1. Return structured `{ success: false, reason, message }` for business outcomes (declines, validation). **Never throw.**
2. Reserve throws for infra-broken scenarios (`PaymentProviderUnavailableError`, `PaymentConfigurationError`).
3. Keep `tokenizeCard` and `chargeAndCapture` idempotent within the bounds of one ULID per call — the charge endpoint in particular must return the same `provider_payment_ref` for a repeated call with the same input (Sprint 3 concern; mock can ignore idempotency).

## Mock-only behaviours

`KovenaMockAdapter` includes behaviours the real adapter MUST NOT rely on:

- Card brand is inferred from PAN prefix (`4*` = VISA, `5*` = MC, `3*` = AMEX).
- Fail triggers live in the token string (e.g. `tok_mock_..._4000000000000002`). Real Kovena decisions come from the bank network.
- `capturedAt` is `new Date().toISOString()` — real captures come from Kovena's response.

These are isolated behind `if (process.env.NODE_ENV === 'test')` gates where they could leak into integration tests.

## Fail triggers (card prefix match)

| Card prefix | Result |
|---|---|
| `4000000000000002` | generic decline |
| `4000000000009995` | insufficient funds |
| `4000000000000127` | incorrect CVC |
| Expiry month 13 or past date | validation error at tokenize |
| Any other 4*/5*/3* card | happy path |

## Sprint 3 swap-in guide

When the real Kovena SDK lands:

1. Implement `KovenaLiveAdapter extends PaymentProvider` at `apps/web/src/adapters/kovena-live.ts`.
2. Swap the export in `apps/web/src/lib/payments/provider.ts`:

```ts
// Before:
export const paymentProvider: PaymentProvider = new KovenaMockAdapter();
// After:
import { KovenaLiveAdapter } from '@/adapters/kovena-live';
export const paymentProvider: PaymentProvider = new KovenaLiveAdapter({
  apiKey: process.env.KOVENA_API_KEY!,
  environment: process.env.KOVENA_ENV as 'sandbox' | 'live',
});
```

3. Replace `apps/web/src/components/checkout/card-form.tsx` with Kovena's hosted card iframe so the PAN never hits our server.
4. Replace the `console.error` recovery path in `actions.ts` with `Sentry.captureException`.
5. Swap the hardcoded `FX_RATES` in `lib/money.ts` for a rates-API snapshot fetched before charge, and persist it on `fx_rate_at_purchase`.

## Production card-data warning

Sprint 2's `CardForm` accepts a plaintext PAN and hands it to the server action,
which calls `paymentProvider.tokenizeCard`. **This must be replaced before any
real PAN is accepted** — see `TODO(sprint-3)` markers in `card-form.tsx`.
```

- [ ] **Step 2: Commit**

```powershell
git add docs/payments.md
git commit -m "docs(payments): port contract + Sprint 3 swap guide"
```

---

## Task 37: Docs — sprint-2-changelog.md (new)

**Files:**
- Create: `docs/sprints/sprint-2-changelog.md`

- [ ] **Step 1: Write the changelog**

Create `docs/sprints/sprint-2-changelog.md`:

```markdown
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
```

- [ ] **Step 2: Commit**

```powershell
git add docs/sprints/sprint-2-changelog.md
git commit -m "docs(sprint-2): shipped changelog scaffold"
```

---

## Task 38: Open the Sprint 2 PR

**Files:**
- (no source changes)

- [ ] **Step 1: Push the branch**

```powershell
git push -u origin sprint-2
```

- [ ] **Step 2: Verify Vercel preview deploys clean**

Watch Vercel dashboard. Expected: green build, new preview URL.

- [ ] **Step 3: Smoke the preview end-to-end**

On the preview URL: sign in with magic link → `/hub/activities` → pick any upsell → `/hub/checkout` → pay with `4242424242424242` → land on success page → confirm add-on appears in `/hub` "Your add-ons" section → re-run flow with `4000000000000002` → confirm failed page + retry works.

- [ ] **Step 4: Verify one row in Supabase**

Open Supabase → `transactions` → pick the just-captured row. Confirm:
- `mcc` = `4722`
- `amount_minor = provider_payout_minor + koncie_fee_minor`
- `trust_ledger_id` not null
- `provider_payment_ref` starts with `kvn_mock_`
- `guest_display_currency` = `AUD`, `fx_rate_at_purchase` = `0.670000`

- [ ] **Step 5: Open the PR**

```powershell
gh pr create --base main --head sprint-2 --title "Sprint 2: Merchant-of-Record payment foundation" --body "$(cat <<'EOF'
## Summary

- PaymentProvider port + KovenaMockAdapter (Sprint 3 swaps in real Kovena)
- Prisma schema v2: Upsell, TrustLedgerEntry, SavedCard, expanded Transaction with MoR CHECKs
- Checkout flow: browse → detail → checkout → success/fail with saved-card UX
- Playwright E2E: happy path + fail-trigger + retry
- Docs: architecture, data-model, mor-compliance (new), payments (new)

See `docs/sprints/sprint-2-changelog.md` for full shipped list.
See `docs/mor-compliance.md` for the 60-second acquirer walkthrough.

## Test plan

- [ ] CI green (typecheck, lint, build, test, e2e)
- [ ] Vercel preview deploys clean
- [ ] Magic-link sign-in → /hub/activities → book any upsell with 4242... → success page renders receipt
- [ ] Retry with 4000000000000002 → failed page → retry with 4242... → success
- [ ] Supabase: one `transactions` row passes the 60-second acquirer walkthrough
- [ ] Supabase: matching `trust_ledger_entries` row with `event_type = 'COLLECTED'`
- [ ] "Your add-ons" section renders on /hub and /hub/trip

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Paste the PR URL into the Sprint 2 progress memory** (optional)

---

## Plan complete.
