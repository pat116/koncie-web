import type { FlightBookingRead, FlightItinerarySource } from '@koncie/types';
import { JetSeekerUnavailableError } from '@/lib/errors/flights';

const NETWORK_DELAY_MS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SEED_GUEST_EMAIL = 'pat@kovena.com';
const FAIL_TRIGGER_EMAIL = 'flight-unavailable@test.com';

const SEEDED_BOOKING: FlightBookingRead = {
  externalRef: 'JS-JANE-NAMOTU-01',
  guestEmail: SEED_GUEST_EMAIL,
  origin: 'SYD',
  destination: 'NAN',
  departureAt: '2026-07-14T08:00:00+10:00',
  returnAt: '2026-07-21T14:30:00+12:00',
  carrier: 'FJ',
  metadata: { adults: 2, class: 'economy' },
};

/**
 * Mock adapter for Jet Seeker. Returns hardcoded email-matched results.
 *
 * MOCK-ONLY BEHAVIOURS (NOT the contract — see packages/types/src/flights.ts):
 * - Hardcoded email matching (real adapter queries Jet Seeker's database)
 * - 150ms fixed delay (real adapter varies with network)
 * - Fail-trigger email — real adapter fails by HTTP timeout or 5xx
 */
export class JetSeekerMockAdapter implements FlightItinerarySource {
  async fetchBookingsForGuest(email: string): Promise<FlightBookingRead[]> {
    await sleep(NETWORK_DELAY_MS);

    if (email === FAIL_TRIGGER_EMAIL) {
      throw new JetSeekerUnavailableError(
        'Jet Seeker sandbox simulated outage (mock fail-trigger email)',
      );
    }

    if (email === SEED_GUEST_EMAIL) {
      return [SEEDED_BOOKING];
    }

    return [];
  }
}
