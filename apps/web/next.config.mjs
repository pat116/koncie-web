import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@koncie/brand', '@koncie/types'],
  poweredByHeader: false,
  experimental: {
    // Keep the instrumentation hook on for Sentry server/edge init.
    instrumentationHook: true,
  },
};

/**
 * Sentry config is wrapped around next config so source-map upload happens
 * on `next build`. DSN and auth token come from env; if SENTRY_AUTH_TOKEN is
 * not present (e.g. local dev), source-map upload is silently skipped.
 */
const sentryOptions = {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
};

export default withSentryConfig(nextConfig, sentryOptions);
