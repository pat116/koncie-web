import { prisma } from '@/lib/db/prisma';
import { requireSignedInGuest } from '@/lib/auth/session';
import { ActivityCard } from '@/components/activities/activity-card';

export const dynamic = 'force-dynamic';

export default async function ActivitiesPage() {
  const { booking } = await requireSignedInGuest();

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
