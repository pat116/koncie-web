import * as Sentry from '@sentry/nextjs';

console.log('[koncie-smoke-test] sentry.server.config.ts loading');

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  debug: false,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
});

console.log(
  '[koncie-smoke-test] Sentry.init called — client now:',
  Boolean(Sentry.getClient()),
);
