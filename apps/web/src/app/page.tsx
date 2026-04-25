import { startDemo } from './actions';

/**
 * Pre-launch demo launcher. Gives stakeholders a one-click entry point
 * into the seeded guest journey without needing a real booking email.
 */
export default function HomePage() {
  return (
    <main id="main-content" tabIndex={-1} className="flex min-h-screen flex-col items-center justify-center bg-koncie-sand px-6 py-12 outline-none">
      <h1
        className="select-none text-6xl font-semibold tracking-tight sm:text-7xl"
        style={{
          backgroundImage:
            'linear-gradient(135deg, hsl(var(--koncie-navy)) 0%, hsl(var(--koncie-green)) 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          color: 'transparent',
        }}
      >
        Koncie
      </h1>

      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-koncie-charcoal/60">
        Pre-launch demo
      </p>

      <section className="mt-10 w-full max-w-md rounded-2xl border border-koncie-border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-koncie-navy">
          What you&apos;re about to see
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-koncie-charcoal">
          Koncie is Kovena&apos;s post-booking guest experience — the
          companion app a traveller lands in after booking with one of the
          30,000+ properties on our network.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-koncie-charcoal">
          The demo below simulates a guest — <em>Jane</em> — who has just
          booked a 7-night stay at{' '}
          <strong>Namotu Island Fiji</strong> (our Q2 pilot property).
          You&apos;ll see the personalised landing page, magic-link sign-up
          flow, and the signed-in trip hub.
        </p>

        <form action={startDemo} className="mt-6">
          <button
            type="submit"
            className="w-full rounded-full bg-koncie-navy px-5 py-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Start the demo →
          </button>
        </form>

        <p className="mt-4 text-xs text-koncie-charcoal/60">
          Takes you to{' '}
          <code className="rounded bg-koncie-sand px-1 py-0.5">/welcome</code>{' '}
          with a freshly-signed 30-minute demo link.
        </p>
      </section>

      <details className="mt-6 w-full max-w-md text-sm text-koncie-charcoal/80">
        <summary className="cursor-pointer font-semibold text-koncie-navy">
          What&apos;s real vs stubbed in this demo?
        </summary>
        <ul className="mt-3 space-y-2 pl-5 text-xs leading-relaxed text-koncie-charcoal/80">
          <li>
            <strong>Real:</strong> Postgres-backed booking + guest records,
            signed JWT magic links, Supabase Auth with email-delivery via
            Resend, the full two-hop sign-in flow, and session-gated hub
            pages.
          </li>
          <li>
            <strong>Stubbed:</strong> Activities / travel protection / flight
            add-ons panels (surfaces arrive in Sprints 3–4). HotelLink feed
            is mocked; real ingestion lands in Sprint 7.
          </li>
          <li>
            <strong>One caveat:</strong> the magic-link email currently
            delivers only to{' '}
            <code className="rounded bg-koncie-sand px-1 py-0.5">
              pat@kovena.com
            </code>{' '}
            because Resend&apos;s sandbox domain restricts recipients until
            we verify <code>koncie.app</code>. The demo is fully clickable
            through the &quot;Check your email&quot; state without that.
          </li>
        </ul>
      </details>
    </main>
  );
}
