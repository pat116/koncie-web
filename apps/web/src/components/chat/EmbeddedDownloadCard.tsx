/**
 * Embedded "Download the Koncie app" card (Sprint-6 completion §3.S6-06).
 * Surfaces App Store + Play Store buttons inside the chat thread.
 * Links are placeholders for the demo phase — real store URLs land at
 * native-app sprint (Phase 3).
 */

import * as React from 'react';

const APP_STORE_HREF = 'https://apps.apple.com/app/id000000000';
const PLAY_STORE_HREF = 'https://play.google.com/store/apps/details?id=app.koncie';

export function EmbeddedDownloadCard() {
  return (
    <div className="mt-2 rounded-2xl border border-koncie-border bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-koncie-charcoal/60">
        Get the app
      </p>
      <p className="mt-1 text-sm text-koncie-charcoal">
        Live forecasts, on-property bookings, transfer status — in your pocket.
      </p>
      <div className="mt-3 flex gap-2">
        <a
          href={APP_STORE_HREF}
          className="inline-flex items-center rounded-full border border-koncie-navy bg-koncie-navy px-3 py-1.5 text-xs font-medium text-white"
        >
          App Store
        </a>
        <a
          href={PLAY_STORE_HREF}
          className="inline-flex items-center rounded-full border border-koncie-navy px-3 py-1.5 text-xs font-medium text-koncie-navy"
        >
          Google Play
        </a>
      </div>
    </div>
  );
}
