import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-koncie-sand p-6 text-center">
      <h1 className="text-3xl font-bold text-koncie-navy">Page not found</h1>
      <p className="mt-3 max-w-sm text-koncie-charcoal">
        The link you followed is either expired or belongs to a different trip.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-full bg-koncie-navy px-5 py-3 text-sm font-semibold text-white"
      >
        Back to Koncie
      </Link>
    </main>
  );
}
