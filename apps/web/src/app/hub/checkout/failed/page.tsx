import Link from 'next/link';

export const dynamic = 'force-dynamic';

const FRIENDLY_REASONS: Record<string, string> = {
  card_declined: 'Your bank declined the charge.',
  insufficient_funds: 'Your card has insufficient funds for this purchase.',
  incorrect_cvc: "The security code didn't match.",
  validation_error: "Something on the card details wasn't accepted.",
  provider_unavailable:
    "We couldn't reach our payment provider. Please try again in a moment.",
  configuration_error:
    'There was a configuration issue on our end. Please try again shortly.',
};

interface Props {
  searchParams: { reason?: string; upsellId?: string };
}

export default function CheckoutFailedPage({ searchParams }: Props) {
  const reason = searchParams.reason ?? 'card_declined';
  const message = FRIENDLY_REASONS[reason] ?? "The payment didn't go through.";
  const retryHref = searchParams.upsellId
    ? `/hub/checkout?upsellId=${searchParams.upsellId}`
    : '/hub/activities';

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col items-center px-4 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-koncie-sand text-3xl text-koncie-navy">
        !
      </div>
      <h1 className="mt-4 text-2xl font-semibold text-koncie-navy">
        Payment didn&apos;t go through
      </h1>
      <p className="mt-2 max-w-sm text-sm text-koncie-charcoal/80">{message}</p>

      <div className="mt-8 flex flex-col gap-3">
        <Link
          href={retryHref}
          className="rounded-full bg-koncie-navy px-6 py-3 text-sm font-semibold text-white"
        >
          Try again
        </Link>
        <Link href="/hub" className="text-xs text-koncie-charcoal/70 underline">
          Back to hub
        </Link>
      </div>
    </main>
  );
}
