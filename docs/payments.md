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
