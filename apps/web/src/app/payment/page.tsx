import Link from 'next/link';

export default function PaymentLandingPage() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col items-center px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-koncie-navy">Payment</h1>
      <p className="mt-4 max-w-sm text-sm text-koncie-charcoal/80">
        Your resort booking is already paid for. You don&apos;t have any add-ons selected for
        payment.
      </p>
      <Link
        href="/hub/activities"
        className="mt-6 rounded-full bg-koncie-navy px-6 py-3 text-sm font-semibold text-white"
      >
        Browse activities →
      </Link>
    </main>
  );
}
