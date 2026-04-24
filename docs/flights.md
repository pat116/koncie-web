# Flights — port contract + Sprint-N swap guide

## Contract

The authoritative contract is `packages/types/src/flights.ts`. Any adapter MUST:

1. Be **read-only**. Return `FlightBookingRead[]` from `fetchBookingsForGuest(email)`. Koncie does not book flights — bookings happen inside Jet Seeker's OTA.
2. Return empty array for unknown guest emails (business outcome, not an error).
3. Throw `JetSeekerUnavailableError` for infra failures (network, 5xx, auth). Do not throw for unknown-email, malformed-email, or any other business outcome.
4. Return ISO-8601 `departureAt` / `returnAt` strings (adapter converts native Jet Seeker representation).
5. Return 3-char IATA airport codes and 2-char IATA carrier codes.

## Mock-only behaviours

`JetSeekerMockAdapter` includes behaviours the real adapter MUST NOT rely on:

- Hardcoded email-matched responses (real adapter queries Jet Seeker's database)
- Fixed 150ms delay (real adapter varies with network)
- Fail-trigger email `flight-unavailable@test.com` — real adapter fails via HTTP

The port in `packages/types` is the contract. These mock behaviours are fixtures for local testing only.

## Fail triggers

| Input | Result |
|---|---|
| Email `flight-unavailable@test.com` | throws `JetSeekerUnavailableError` |
| Email `pat@kovena.com` (seed) | returns 1 SYD↔NAN round-trip |
| Any other email | returns `[]` |

## `IATA_TO_CITY` extension rules

`apps/web/src/lib/flights/iata.ts` holds the minimal IATA → city lookup used by the insurance-stub offer's `destinationLabel`.

Extension criteria:

- Add a code only after product confirms we want to surface it in offer copy
- Keep the lookup < ~50 entries; at that scale swap for a proper reference table or a maintained package (e.g. `iata-tz-map`)
- Missing codes fall back to the raw IATA code in offer copy — acceptable for non-pilot destinations

## Sprint-N swap-in guide

When real Jet Seeker API access lands:

1. Implement `JetSeekerLiveAdapter extends FlightItinerarySource` at `apps/web/src/adapters/jetseeker-live.ts`
2. Swap the export in `apps/web/src/lib/flights/provider.ts`:

```ts
// Before:
export const flightItinerarySource: FlightItinerarySource = new JetSeekerMockAdapter();
// After:
import { JetSeekerLiveAdapter } from '@/adapters/jetseeker-live';
export const flightItinerarySource: FlightItinerarySource = new JetSeekerLiveAdapter({
  apiKey: process.env.JETSEEKER_API_KEY!,
  environment: process.env.JETSEEKER_ENV as 'sandbox' | 'production',
});
```

3. Replace the `console.error` in `sync.ts` with `Sentry.captureException`
4. Drop the hardcoded `SEED_GUEST_EMAIL` / `FAIL_TRIGGER_EMAIL` branches
5. Consider a webhook endpoint at `app/api/webhooks/jetseeker/booking/route.ts` so new bookings push to Koncie without waiting for the 60-second lazy-sync
