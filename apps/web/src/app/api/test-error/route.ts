/**
 * Deliberate error endpoint for Sentry verification (Sprint 0 acceptance
 * criterion #6). Hit this once on the staging URL to confirm the error
 * appears in the Sentry dashboard, then forget about it — this route is
 * harmless and stays in the repo as ongoing smoke-test ammo.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(): never {
  throw new Error('Koncie Sentry smoke test — if you see this in Sentry, observability is wired.');
}
