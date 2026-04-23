import { format, differenceInCalendarDays } from 'date-fns';
import { prisma } from '@/lib/db/prisma';
import { requireSignedInGuest } from '@/lib/auth/session';
import { AddonsSection } from '@/components/hub/addons-section';

export const dynamic = 'force-dynamic';

export default async function TripPage() {
  const { guest, booking: b } = await requireSignedInGuest();

  const transactions = await prisma.transaction.findMany({
    where: { guestId: guest.id, status: 'captured' },
    include: { upsell: true },
    orderBy: { createdAt: 'desc' },
  });

  const nights = differenceInCalendarDays(b.checkOut, b.checkIn);

  return (
    <div className="px-5 pt-5">
      <h2 className="text-xl font-bold text-koncie-navy">{b.property.name}</h2>
      <p className="mt-1 text-sm text-koncie-charcoal/80">
        {b.property.region}, {b.property.country}
      </p>

      <div className="mt-6 rounded-xl border border-koncie-border bg-white p-5">
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-koncie-charcoal/60">Check-in</dt>
            <dd className="font-semibold text-koncie-charcoal">
              {format(b.checkIn, 'EEE d MMM yyyy')}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-koncie-charcoal/60">Check-out</dt>
            <dd className="font-semibold text-koncie-charcoal">
              {format(b.checkOut, 'EEE d MMM yyyy')}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-koncie-charcoal/60">Nights</dt>
            <dd className="font-semibold text-koncie-charcoal">{nights}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-koncie-charcoal/60">Guests</dt>
            <dd className="font-semibold text-koncie-charcoal">{b.numGuests}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-koncie-charcoal/60">Booking ref</dt>
            <dd className="font-mono text-koncie-charcoal">{b.externalRef}</dd>
          </div>
        </dl>
      </div>

      <p className="mt-6 text-xs text-koncie-charcoal/60">
        Questions about your room or check-in? Contact your host directly via
        the email they sent with your booking.
      </p>

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
    </div>
  );
}
