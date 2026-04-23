'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-koncie-sand p-6 text-center">
      <h1 className="text-3xl font-bold text-koncie-navy">
        Something went wrong
      </h1>
      <p className="mt-3 max-w-sm text-koncie-charcoal">
        We&apos;ve logged what happened and someone at Koncie will take a look.
      </p>
      <button
        onClick={reset}
        className="mt-6 rounded-full bg-koncie-navy px-5 py-3 text-sm font-semibold text-white"
      >
        Try again
      </button>
    </main>
  );
}
