import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { requireSignedInGuest } from '@/lib/auth/session';
import { formatPricePair } from '@/lib/money';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: { transactionId?: string; policyId?: string; item?: string };
}

const TIER_LABELS: Record<string, string> = {
  ESSENTIALS: 'Essentials',
  COMPREHENSIVE: 'Comprehensive',
  COMPREHENSIVE_PLUS: 'Comprehensive+',
};

export default async function CheckoutSuccessPage({ searchParams }: Props) {
  const { guest } = await requireSignedInGuest();

  // Insurance branch — Sprint 4's purchaseInsurance redirects here with
  // policyId + item=insurance. The upsell branch below handles transactionId.
  if (searchParams.policyId) {
    const policy = await prisma.insurancePolicy.findUnique({
      where: { id: searchParams.policyId },
      include: { quote: true },
    });

    if (!policy || policy.guestId !== guest.id || policy.status !== 'CAPTURED') {
      notFound();
    }

    const tierLabel = TIER_LABELS[policy.quote.tier] ?? policy.quote.tier;

    return (
      <main className="mx-auto flex w-full max-w-lg flex-col items-center px-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-koncie-green/20 text-3xl">
          ✓
        </div>
        <h1 className="mt-4 text-2xl font-semibold text-koncie-navy">You&apos;re covered</h1>
        <p className="mt-2 text-sm text-koncie-charcoal/80">
          Travel protection is active. Receipt below.
        </p>

        <section className="mt-8 w-full rounded-2xl border border-koncie-border bg-white p-5 text-left">
          <p className="text-sm font-semibold text-koncie-navy">
            CoverMore &middot; {tierLabel}
          </p>
          <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-xs">
            <dt className="text-koncie-charcoal/60">Premium paid</dt>
            <dd className="text-right font-mono text-koncie-charcoal">
              {(policy.amountMinor / 100).toFixed(2)} {policy.currency}
            </dd>
            <dt className="text-koncie-charcoal/60">Receipt number</dt>
            <dd className="text-right font-mono text-koncie-charcoal">
              {policy.providerPaymentRef}
            </dd>
            {policy.policyNumber && (
              <>
                <dt className="text-koncie-charcoal/60">Policy number</dt>
                <dd className="text-right font-mono text-koncie-charcoal">
                  {policy.policyNumber}
                </dd>
              </>
            )}
            <dt className="text-koncie-charcoal/60">Captured at</dt>
            <dd className="text-right font-mono text-koncie-charcoal">
              {policy.capturedAt?.toISOString()}
            </dd>
          </dl>
        </section>

        <Link
          href="/hub"
          className="mt-8 rounded-full bg-koncie-navy px-6 py-3 text-sm font-semibold text-white"
        >
          Back to hub
        </Link>
      </main>
    );
  }

  // Upsell (activity) branch — original behaviour.
  if (!searchParams.transactionId) notFound();

  const tx = await prisma.transaction.findUnique({
    where: { id: searchParams.transactionId },
    include: { upsell: true },
  });

  if (!tx || tx.guestId !== guest.id || tx.status !== 'captured') notFound();

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col items-center px-4 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-koncie-green/20 text-3xl">
        ✓
      </div>
      <h1 className="mt-4 text-2xl font-semibold text-koncie-navy">You&apos;re booked</h1>
      <p className="mt-2 text-sm text-koncie-charcoal/80">See you at the reef. Receipt below.</p>

      <section className="mt-8 w-full rounded-2xl border border-koncie-border bg-white p-5 text-left">
        <p className="text-sm font-semibold text-koncie-navy">{tx.upsell.name}</p>
        <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-xs">
          <dt className="text-koncie-charcoal/60">Amount paid</dt>
          <dd className="text-right font-mono text-koncie-charcoal">
            {formatPricePair({
              amountMinor: tx.amountMinor,
              currency: tx.currency,
              guestDisplayAmountMinor: tx.guestDisplayAmountMinor,
              guestDisplayCurrency: tx.guestDisplayCurrency,
            })}
          </dd>
          <dt className="text-koncie-charcoal/60">Receipt number</dt>
          <dd className="text-right font-mono text-koncie-charcoal">{tx.providerPaymentRef}</dd>
          <dt className="text-koncie-charcoal/60">Captured at</dt>
          <dd className="text-right font-mono text-koncie-charcoal">
            {tx.capturedAt?.toISOString()}
          </dd>
        </dl>
      </section>

      <Link
        href="/hub"
        className="mt-8 rounded-full bg-koncie-navy px-6 py-3 text-sm font-semibold text-white"
      >
        Back to hub
      </Link>
    </main>
  );
}
