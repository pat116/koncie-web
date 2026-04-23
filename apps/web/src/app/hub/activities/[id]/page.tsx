import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { requireSignedInGuest } from '@/lib/auth/session';
import { PricePair } from '@/components/activities/price-pair';
import { convertMinorUnits } from '@/lib/money';

export const dynamic = 'force-dynamic';

interface Params {
  params: { id: string };
}

export default async function ActivityDetailPage({ params }: Params) {
  const { booking } = await requireSignedInGuest();
  const upsell = await prisma.upsell.findUnique({ where: { id: params.id } });

  if (!upsell || upsell.propertyId !== booking.propertyId || upsell.status !== 'ACTIVE') {
    notFound();
  }

  const guestDisplayAmountMinor = convertMinorUnits({
    amountMinor: upsell.priceMinor,
    from: upsell.priceCurrency,
    to: 'AUD',
  });

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <div
        className="aspect-[16/9] w-full rounded-2xl bg-koncie-sand bg-cover bg-center"
        style={{ backgroundImage: `url(${upsell.imageUrl})` }}
      />

      <h1 className="mt-6 text-3xl font-semibold text-koncie-navy">{upsell.name}</h1>
      <p className="mt-3 text-sm leading-relaxed text-koncie-charcoal">{upsell.description}</p>

      <div className="mt-6 flex items-center justify-between rounded-2xl border border-koncie-border bg-white p-4">
        <PricePair
          amountMinor={upsell.priceMinor}
          currency={upsell.priceCurrency}
          guestDisplayAmountMinor={guestDisplayAmountMinor}
          guestDisplayCurrency="AUD"
          size="lg"
        />
        <Link
          href={`/hub/checkout?upsellId=${upsell.id}`}
          className="rounded-full bg-koncie-navy px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Book now →
        </Link>
      </div>
    </main>
  );
}
