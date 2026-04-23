/**
 * Deliberate error endpoint for Sentry verification (Sprint 0 acceptance
 * criterion #6). Hit this once on the staging URL to confirm the error
 * appears in the Sentry dashboard, then forget about it — this route is
 * harmless and stays in the repo as ongoing smoke-test ammo.
 */
import * as Sentry from '@sentry/nextjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<never> {
  // Diagnostics — delete after Sentry is confirmed wired.
  console.log(
    '[koncie-smoke-test] SENTRY_DSN present:',
    Boolean(process.env.SENTRY_DSN),
    '| hub client defined:',
    Boolean(Sentry.getClient()),
  );

  const err = new Error(
    'Koncie Sentry smoke test — if you see this in Sentry, observability is wired.',
  );
  Sentry.captureException(err);
  await Sentry.flush(2000);
  throw err;
}
