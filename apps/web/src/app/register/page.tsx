import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { fireMagicLink } from './actions';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: {
    bookingId?: string;
    sent?: string;
    error?: string;
  };
}

export default async function RegisterPage({ searchParams }: PageProps) {
  if (!searchParams.bookingId) {
    return <Missing />;
  }

  const booking = await prisma.booking.findUnique({
    where: { id: searchParams.bookingId },
    include: { guest: true },
  });
  if (!booking) return <Missing />;

  const linkSent = searchParams.sent === '1';
  const sendError = searchParams.error === 'send_failed';

  return (
    <main className="min-h-screen bg-koncie-sand">
      <header className="bg-koncie-navy px-5 py-4 text-center">
        <h1 className="font-semibold text-white">Koncie</h1>
      </header>

      <section className="mx-auto flex max-w-md flex-col items-center px-5 pt-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-koncie-charcoal/60">
          STEP 2 OF 2
        </p>

        <div
          className="mt-6 flex h-24 w-24 items-center justify-center rounded-full bg-koncie-green/15 text-5xl"
          aria-hidden="true"
        >
          📧
        </div>

        <h2 className="mt-6 text-2xl font-bold text-koncie-navy">
          {linkSent ? 'Check your email' : 'Ready to sign in?'}
        </h2>
        <p className="mt-2 text-sm text-koncie-charcoal">
          {linkSent
            ? "We've sent a sign-in link to"
            : "We'll send a sign-in link to"}
        </p>
        <p className="mt-1 font-semibold text-koncie-navy">
          {booking.guest.email}
        </p>

        {!linkSent && (
          <form action={fireMagicLink} className="mt-6 w-full">
            <input type="hidden" name="bookingId" value={booking.id} />
            <button
              type="submit"
              className="w-full rounded-full bg-koncie-navy px-5 py-3 text-sm font-semibold text-white"
            >
              Send me a sign-in link
            </button>
          </form>
        )}

        {sendError && (
          <p className="mt-4 text-center text-xs text-red-600">
            Something went wrong sending the email. Try again in a minute.
          </p>
        )}

        {linkSent && (
          <div className="mt-8 w-full rounded-xl border border-koncie-border bg-white p-4">
            <p className="text-xs font-semibold text-koncie-navy">
              NEXT STEPS
            </p>
            <ol className="mt-2 space-y-1 text-sm text-koncie-charcoal/80">
              <li>1. Open your inbox</li>
              <li>2. Click the link from Koncie</li>
              <li>3. You&apos;ll land on your trip hub</li>
            </ol>
          </div>
        )}

        <p className="mt-10 text-xs text-koncie-charcoal/60">
          {linkSent ? "Didn't see it? Check spam, or " : ''}
          {linkSent && (
            <Link
              href={`/register?bookingId=${booking.id}`}
              className="font-semibold text-koncie-green"
            >
              resend the link
            </Link>
          )}
        </p>

        <p className="mt-4 text-xs text-koncie-charcoal/60">
          Wrong email?{' '}
          <Link
            href={`/welcome?token=`}
            className="font-semibold text-koncie-green"
          >
            go back
          </Link>
        </p>
      </section>
    </main>
  );
}

function Missing() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-koncie-sand p-6 text-center">
      <h1 className="text-2xl font-bold text-koncie-navy">
        Missing booking context
      </h1>
      <p className="mt-3 text-sm text-koncie-charcoal">
        Start from the signed link in your email.
      </p>
    </main>
  );
}
