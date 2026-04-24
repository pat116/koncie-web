import * as Sentry from '@sentry/nextjs';
import type { InsuranceQuoteInput, InsuranceTier } from '@koncie/types';
import { prisma } from '@/lib/db/prisma';
import { insuranceQuoteSource } from './provider';
import { splitInsurancePremium, INSURANCE_COMMISSION_PCT } from './pricing';
import { IATA_TO_COUNTRY } from './iata-country';
import { CoverMoreUnavailableError } from '@/lib/errors/insurance';

type PrismaInsuranceTier = 'ESSENTIALS' | 'COMPREHENSIVE' | 'COMPREHENSIVE_PLUS';

/**
 * Pilot assumption: if the flight metadata doesn't carry a trip cost we
 * default to AU$3,000 — the guide price from the project brief §2 for an
 * Aus/NZ → Pacific trip. Real CoverMore scales premium by trip cost;
 * the mock doesn't care, but the value is persisted for audit.
 */
const DEFAULT_TRIP_COST_MINOR_AUD = 300_000;
const DEFAULT_TRAVELLER_AGE = 35;
const DEFAULT_TRAVELLER_COUNT = 1;

const TIER_TO_PRISMA: Record<InsuranceTier, PrismaInsuranceTier> = {
  essentials: 'ESSENTIALS',
  comprehensive: 'COMPREHENSIVE',
  comprehensive_plus: 'COMPREHENSIVE_PLUS',
};

/**
 * Syncs insurance quote offerings for a guest based on their first flight
 * itinerary. Mirrors Sprint 3's `syncFlightsForGuest`:
 *
 * - Short-circuits if the guest has no flight (nothing to quote against).
 * - Upserts by (guestId, providerRef) so repeated calls are idempotent.
 * - Deletes stale quotes whose providerRef isn't in the latest response
 *   (handles the provider dropping a tier mid-pilot).
 * - Updates Guest.insuranceLastSyncedAt ONLY on success.
 * - Wraps all DB writes in $transaction for atomicity.
 * - Adapter failures surface as CoverMoreUnavailableError (hub renders
 *   nothing in the insurance slot — soft-fail parallel to flights).
 */
export async function syncInsuranceQuotesForGuest(guestId: string): Promise<void> {
  const guest = await prisma.guest.findUniqueOrThrow({ where: { id: guestId } });

  // Need a flight to derive trip context. If there is none, no-op.
  const flight = await prisma.flightBooking.findFirst({
    where: { guestId },
    orderBy: { departureAt: 'asc' },
  });
  if (!flight) {
    return;
  }

  const input = buildQuoteInput(guest.email, flight);

  let incoming;
  try {
    incoming = await insuranceQuoteSource.fetchQuotes(input);
  } catch (err) {
    Sentry.captureException(err, { tags: { guestId, provider: 'covermore' } });
    if (err instanceof CoverMoreUnavailableError) throw err;
    throw new CoverMoreUnavailableError('Unexpected insurance adapter failure', err);
  }

  await prisma.$transaction(async (tx) => {
    for (const q of incoming) {
      const { providerPayoutMinor, koncieFeeMinor } = splitInsurancePremium(q.premiumMinor);
      await tx.insuranceQuote.upsert({
        where: {
          guestId_providerRef: { guestId, providerRef: q.providerRef },
        },
        create: {
          guestId,
          flightBookingId: flight.id,
          provider: 'CoverMore',
          providerRef: q.providerRef,
          tier: TIER_TO_PRISMA[q.tier],
          premiumMinor: q.premiumMinor,
          currency: q.currency,
          commissionPct: INSURANCE_COMMISSION_PCT.toFixed(2),
          commissionMinor: koncieFeeMinor,
          coverageSummary: q.coverageSummary,
          metadata: {
            providerPayoutMinor,
            tripCostMinor: input.tripCostMinor,
            travellers: input.travellers,
            destinationCountry: input.destinationCountry,
          },
          expiresAt: new Date(q.expiresAt),
        },
        update: {
          flightBookingId: flight.id,
          tier: TIER_TO_PRISMA[q.tier],
          premiumMinor: q.premiumMinor,
          currency: q.currency,
          commissionPct: INSURANCE_COMMISSION_PCT.toFixed(2),
          commissionMinor: koncieFeeMinor,
          coverageSummary: q.coverageSummary,
          metadata: {
            providerPayoutMinor,
            tripCostMinor: input.tripCostMinor,
            travellers: input.travellers,
            destinationCountry: input.destinationCountry,
          },
          expiresAt: new Date(q.expiresAt),
        },
      });
    }

    // Prune stale quotes the adapter no longer offers.
    const keepRefs = incoming.map((q) => q.providerRef);
    await tx.insuranceQuote.deleteMany({
      where: {
        guestId,
        ...(keepRefs.length > 0 ? { providerRef: { notIn: keepRefs } } : {}),
        // Never delete a quote that has already been converted into a policy.
        policy: null,
      },
    });

    await tx.guest.update({
      where: { id: guestId },
      data: { insuranceLastSyncedAt: new Date() },
    });
  });
}

/**
 * Derives the InsuranceQuoteInput from a FlightBooking. Pulls traveller
 * count from metadata.adults when present; falls back to a single 35yo
 * traveller at AU$3,000 trip cost. Destination country uses IATA_TO_COUNTRY.
 */
export function buildQuoteInput(
  guestEmail: string,
  flight: {
    destination: string;
    departureAt: Date;
    returnAt: Date | null;
    metadata: unknown;
  },
): InsuranceQuoteInput {
  const meta = (typeof flight.metadata === 'object' && flight.metadata !== null
    ? (flight.metadata as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  const adults = typeof meta.adults === 'number' && meta.adults > 0 ? meta.adults : DEFAULT_TRAVELLER_COUNT;
  const travellers = Array.from({ length: adults }, () => ({ age: DEFAULT_TRAVELLER_AGE }));

  const tripCostMinor = typeof meta.tripCostMinor === 'number' && meta.tripCostMinor > 0
    ? meta.tripCostMinor
    : DEFAULT_TRIP_COST_MINOR_AUD;

  const startDate = isoDate(flight.departureAt);
  const endDate = flight.returnAt ? isoDate(flight.returnAt) : isoDate(addDays(flight.departureAt, 7));

  return {
    guestEmail,
    destinationCountry: IATA_TO_COUNTRY[flight.destination] ?? 'FJ',
    destinationIATA: flight.destination,
    startDate,
    endDate,
    tripCostMinor,
    currency: 'AUD',
    travellers,
  };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}
