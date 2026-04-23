import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

// Forwards Route Handler + Server Action errors to Sentry.
// Required for Sentry SDK v8+ on Next.js 14 App Router.
export const onRequestError = Sentry.captureRequestError;
