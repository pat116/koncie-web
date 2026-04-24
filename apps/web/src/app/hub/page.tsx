import type { InsuranceTier } from '@koncie/types';
import { prisma } from '@/lib/db/prisma';
import { requireSignedInGuest } from '@/lib/auth/session';
import { syncFlightsForGuest } from '@/lib/flights/sync';
import { syncInsuranceQuotesForGuest } from '@/lib/insurance/quote';
import { resolveContextualOffers } from '@/lib/flights/contextual-offers';
import { JetSeekerUnavailableError } from '@/lib/errors/flights';
import { CoverMoreUnavailableError } from '@/lib/errors/insurance';
import { BookingHero } from '@/components/hub/booking-hero';
import { AddonsSection } from '@/components/hub/addons-section';
import { ActivityCard } from '@/components/activities/activity-card';
import { SectionCard } from '@/components/hub/section-card';
import { FlightItineraryCard } from '@/components/hub/flight-itinerary-card';
import { ContextualOffersSection } from '@/components/hub/contextual-offers-section';
import Link from 'next/link';

const PRISMA_TIER_TO_PORT: Record<string, InsuranceTier> = {
  ESSENTIALS: 'essentials',
  COMPREHENSIVE: 'comprehensive',
  COMPREHENSIVE_PLUS: 'comprehensive_plus',
};

export const dynamic = 'force-dynamic';

const LAZY_SYNC_WINDOW_MS = 60_000;

export default async function HubPage() {
  const { guest, booking } = await requireSignedInGuest();

  // Sprint 3 — Lazy-sync flights from Jet Seeker. If we've never synced OR last
  // sync > 60s ago AND no flights cached, fetch from adapter. Soft-fail: adapter
  // errors render a banner but don't block the rest of the hub.
  let syncFailed = false;
  const existingFlightCount = await prisma.flightBooking.count({
    where: { guestId: guest.id },
  });
  const staleWindowPassed =
    guest.flightsLastSyncedAt == null ||
    Date.now() - guest.flightsLastSyncedAt.getTime() > LAZY_SYNC_WINDOW_MS;
  if (existingFlightCount === 0 && staleWindowPassed) {
    try {
      await syncFlightsForGuest(guest.id);
    } catch (err) {
      if (err instanceof JetSeekerUnavailableError) {
        syncFailed = true;
      } else {
        throw err;
      }
    }
  }

  // Sprint 4 — lazy-sync CoverMore insurance quotes off the guest's flight.
  // Same 60s staleness window; soft-fail (no offer card) on adapter outage.
  const existingInsuranceCount = await prisma.insuranceQuote.count({
    where: { guestId: guest.id },
  });
  const insuranceStaleWindowPassed =
    guest.insuranceLastSyncedAt == null ||
    Date.now() - guest.insuranceLastSyncedAt.getTime() > LAZY_SYNC_WINDOW_MS;
  if (existingInsuranceCount === 0 && insuranceStaleWindowPassed) {
    try {
      await syncInsuranceQuotesForGuest(guest.id);
    } catch (err) {
      if (!(err instanceof CoverMoreUnavailableError)) throw err;
      // Soft-fail: the offer card simply doesn't render.
    }
  }

  const [upsells, transactions, flights, insuranceQuotes] = await Promise.all([
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
    prisma.flightBooking.findMany({
      where: { guestId: guest.id },
      orderBy: { departureAt: 'asc' },
    }),
    prisma.insuranceQuote.findMany({
      where: { guestId: guest.id, expiresAt: { gt: new Date() }, policy: null },
      orderBy: { premiumMinor: 'asc' },
    }),
  ]);

  const firstFlight = flights[0] ?? null;

  // For offer resolution we need the destination + an indication that ACTIVE
  // upsells exist at the property. Query those separately (not filtered to 2).
  const activeUpsellsAny = await prisma.upsell.findMany({
    where: { propertyId: booking.propertyId, status: 'ACTIVE' },
    select: { status: true },
    take: 1,
  });

  const offers = resolveContextualOffers({
    flight: firstFlight
      ? { destination: firstFlight.destination, departureAt: firstFlight.departureAt }
      : null,
    upsells: activeUpsellsAny.map((u) => ({ status: u.status })),
    insuranceQuotes: insuranceQuotes.map((q) => ({
      id: q.id,
      tier: PRISMA_TIER_TO_PORT[q.tier] ?? 'comprehensive',
      premiumMinor: q.premiumMinor,
      currency: q.currency,
      coverageSummary: q.coverageSummary,
    })),
  });

  return (
    <div className="px-5 pt-5">
      <BookingHero
        propertyName={booking.property.name}
        checkIn={booking.checkIn}
        checkOut={booking.checkOut}
        numGuests={booking.numGuests}
      />

      {firstFlight ? (
        <FlightItineraryCard flight={firstFlight} />
      ) : syncFailed ? (
        <section className="mt-2 rounded-2xl border border-koncie-border bg-koncie-sand px-5 py-4 text-sm text-koncie-charcoal">
          We couldn&apos;t reach your flight details right now. Try refreshing in a minute.
        </section>
      ) : null}

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

      <h3 className="mt-7 text-xs font-semibold uppercase tracking-wide text-koncie-navy">
        Plan your trip
      </h3>

      {upsells.length > 0 ? (
        <div className="mt-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-koncie-charcoal">Activities</p>
            <Link href="/hub/activities" className="text-xs text-koncie-navy underline">
              Browse all →
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <SectionCard
            icon="🏄"
            title="Activities"
            subtitle={`Available from ${booking.checkIn.toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })}`}
            href="/hub/activities"
          />
        </div>
      )}

      <ContextualOffersSection offers={offers} />
    </div>
  );
}
