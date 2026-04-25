import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { requireSignedInGuest } from '@/lib/auth/session';
import { CardForm } from '@/components/checkout/card-form';
import { SavedCardRow } from '@/components/checkout/saved-card-row';
import { SubmitButton } from '@/components/checkout/submit-button';
import { purchaseInsurance } from '../../actions';

export const dynamic = 'force-dynamic';

interface Props {
  params: { quoteId: string };
}

const TIER_LABELS: Record<string, string> = {
  ESSENTIALS: 'Essentials',
  COMPREHENSIVE: 'Comprehensive',
  COMPREHENSIVE_PLUS: 'Comprehensive+',
};

export default async function InsuranceCheckoutPage({ params }: Props) {
  const { guest } = await requireSignedInGuest();

  const quote = await prisma.insuranceQuote.findUnique({
    where: { id: params.quoteId },
    include: { policy: true },
  });

  if (!quote || quote.guestId !== guest.id) redirect('/hub');
  if (quote.policy) redirect('/hub');
  if (quote.expiresAt.getTime() < Date.now()) redirect('/hub');

  const savedCards = await prisma.savedCard.findMany({
    where: { guestId: guest.id },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
  const hasSavedCards = savedCards.length > 0;

  async function checkoutAction(formData: FormData) {
    'use server';
    const savedCardId = formData.get('savedCardId')?.toString();
    const cardJson = formData.get('cardInput')?.toString();
    const saveCard = formData.get('saveCard') === 'on';

    if (!quote) redirect('/hub');

    await purchaseInsurance({
      quoteId: quote.id,
      guestId: guest.id,
      savedCardId: savedCardId && savedCardId !== '__new__' ? savedCardId : undefined,
      cardInput:
        cardJson && (!savedCardId || savedCardId === '__new__') ? JSON.parse(cardJson) : undefined,
      saveCard,
    });
  }

  const premiumAud = (quote.premiumMinor / 100).toFixed(2);

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8">
      <h1 className="text-2xl font-semibold text-koncie-navy">Review &amp; pay</h1>

      <section className="mt-4 rounded-2xl border border-koncie-border bg-white p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold text-koncie-navy">
            CoverMore &middot; {TIER_LABELS[quote.tier] ?? quote.tier}
          </p>
          <p className="text-sm font-semibold text-koncie-navy">
            {premiumAud} {quote.currency}
          </p>
        </div>
        <p className="mt-1 text-[11px] text-koncie-charcoal/70">{quote.coverageSummary}</p>
        <p className="mt-2 text-[10px] uppercase tracking-wide text-koncie-charcoal/50">
          Koncie is the Merchant of Record &middot; MCC 4722
        </p>
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

        <SubmitButton label={`Pay ${premiumAud} ${quote.currency}`} />
      </form>
    </main>
  );
}
