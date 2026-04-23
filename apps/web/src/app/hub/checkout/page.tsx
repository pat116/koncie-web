import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { requireSignedInGuest } from '@/lib/auth/session';
import { CardForm } from '@/components/checkout/card-form';
import { SavedCardRow } from '@/components/checkout/saved-card-row';
import { PricePair } from '@/components/activities/price-pair';
import { convertMinorUnits } from '@/lib/money';
import { purchaseUpsell } from './actions';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: { upsellId?: string };
}

export default async function CheckoutPage({ searchParams }: Props) {
  if (!searchParams.upsellId) redirect('/payment');

  const { guest, booking } = await requireSignedInGuest();
  const upsell = await prisma.upsell.findUnique({ where: { id: searchParams.upsellId } });
  if (!upsell || upsell.propertyId !== booking.propertyId) redirect('/hub/activities');

  const savedCards = await prisma.savedCard.findMany({
    where: { guestId: guest.id },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
  const hasSavedCards = savedCards.length > 0;

  const guestDisplayAmountMinor = convertMinorUnits({
    amountMinor: upsell.priceMinor,
    from: upsell.priceCurrency,
    to: 'AUD',
  });

  async function checkoutAction(formData: FormData) {
    'use server';
    const savedCardId = formData.get('savedCardId')?.toString();
    const cardJson = formData.get('cardInput')?.toString();
    const saveCard = formData.get('saveCard') === 'on';

    if (!upsell) redirect('/hub/activities');

    await purchaseUpsell({
      upsellId: upsell.id,
      guestId: guest.id,
      bookingId: booking.id,
      savedCardId: savedCardId && savedCardId !== '__new__' ? savedCardId : undefined,
      cardInput: cardJson && (!savedCardId || savedCardId === '__new__') ? JSON.parse(cardJson) : undefined,
      saveCard,
    });
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8">
      <h1 className="text-2xl font-semibold text-koncie-navy">Review &amp; pay</h1>

      <section className="mt-4 rounded-2xl border border-koncie-border bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-koncie-navy">{upsell.name}</p>
            <p className="text-xs text-koncie-charcoal/70">{booking.property.name}</p>
          </div>
          <PricePair
            amountMinor={upsell.priceMinor}
            currency={upsell.priceCurrency}
            guestDisplayAmountMinor={guestDisplayAmountMinor}
            guestDisplayCurrency="AUD"
            size="md"
          />
        </div>
      </section>

      <form action={checkoutAction} className="mt-6 flex flex-col gap-4">
        {hasSavedCards && (
          <section className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-koncie-charcoal">Pay with</p>
            {savedCards.map((c) => (
              <SavedCardRow
                key={c.id}
                id={c.id}
                brand={c.brand}
                last4={c.last4}
                expiryMonth={c.expiryMonth}
                expiryYear={c.expiryYear}
                selected={c.isDefault}
                onSelectName="savedCardId"
              />
            ))}
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-koncie-border p-3 text-sm">
              <input type="radio" name="savedCardId" value="__new__" />
              <span>Use a different card</span>
            </label>
          </section>
        )}

        {/* New-card form — shown when no saved cards OR "Use a different card" is selected. */}
        <details open={!hasSavedCards} className="flex flex-col gap-2">
          <summary className="cursor-pointer text-xs font-semibold text-koncie-charcoal">
            Enter a new card
          </summary>
          <div className="mt-3">
            <CardForm name="cardInput" />
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs text-koncie-charcoal">
            <input type="checkbox" name="saveCard" defaultChecked={!hasSavedCards} />
            Save this card for later
          </label>
        </details>

        <button
          type="submit"
          className="mt-4 rounded-full bg-koncie-navy px-5 py-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Pay {Number(upsell.priceMinor / 100).toFixed(2)} {upsell.priceCurrency} ≈{' '}
          {Number(guestDisplayAmountMinor / 100).toFixed(2)} AUD
        </button>
      </form>
    </main>
  );
}
