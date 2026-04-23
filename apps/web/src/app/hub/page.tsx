import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/db/prisma';
import { BookingHero } from '@/components/hub/booking-hero';
import { SectionCard } from '@/components/hub/section-card';

export const dynamic = 'force-dynamic';

export default async function HubPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect('/welcome');

  const guest = await prisma.guest.findUnique({
    where: { email: user.email },
    include: {
      bookings: {
        orderBy: { checkIn: 'asc' },
        include: { property: true },
      },
    },
  });

  if (!guest) redirect('/welcome?error=no_guest_record');
  const next = guest.bookings[0];

  return (
    <div className="px-5 pt-5">
      {next ? (
        <BookingHero
          propertyName={next.property.name}
          checkIn={next.checkIn}
          checkOut={next.checkOut}
          numGuests={next.numGuests}
        />
      ) : (
        <div className="rounded-2xl bg-koncie-navy p-5 text-white">
          <p className="font-semibold">No upcoming trips</p>
          <p className="mt-1 text-sm text-white/70">
            You&apos;ll see your next trip here after your host sends you a
            booking.
          </p>
        </div>
      )}

      <h3 className="mt-7 text-xs font-semibold uppercase tracking-wide text-koncie-navy">
        Plan your trip
      </h3>
      <div className="mt-3 space-y-3">
        <SectionCard
          icon="🏄"
          title="Activities"
          subtitle={
            next
              ? `Available from ${next.checkIn.toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })}`
              : 'Coming soon'
          }
        />
        <SectionCard
          icon="🛡️"
          title="Travel protection"
          subtitle="Coming soon"
        />
        <SectionCard
          icon="✈️"
          title="Flight add-ons"
          subtitle="Coming soon · via JetSeeker"
        />
      </div>
    </div>
  );
}
