import { prisma } from '@/lib/db/prisma';
import { requireSignedInGuest } from '@/lib/auth/session';
import { BookingHero } from '@/components/hub/booking-hero';
import { AddonsSection } from '@/components/hub/addons-section';
import { ActivityCard } from '@/components/activities/activity-card';
import { SectionCard } from '@/components/hub/section-card';
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
    <div className="px-5 pt-5">
      <BookingHero
        propertyName={booking.property.name}
        checkIn={booking.checkIn}
        checkOut={booking.checkOut}
        numGuests={booking.numGuests}
      />

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

      <div className="mt-3 space-y-3">
        <SectionCard icon="🛡️" title="Travel protection" subtitle="Coming soon" />
        <SectionCard
          icon="✈️"
          title="Flight add-ons"
          subtitle="Coming soon · via JetSeeker"
        />
      </div>
    </div>
  );
}
