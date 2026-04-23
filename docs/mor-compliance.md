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
