import { NextResponse } from 'next/server';

/**
 * Sprint 0 healthcheck.
 *
 * Returns JSON with git SHA (from Vercel's env), environment, and a
 * timestamp. Used by uptime checks and by Sprint 0 acceptance criteria —
 * every staging deploy must return `status: "ok"` here.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  const version =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GITHUB_SHA ??
    'dev';

  return NextResponse.json({
    status: 'ok',
    version,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown',
    timestamp: new Date().toISOString(),
  });
}
