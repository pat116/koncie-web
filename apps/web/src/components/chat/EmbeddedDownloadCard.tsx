/**
 * Embedded "Download the Koncie app" card (Sprint-6 + 2026-04-28 polish).
 * Surfaces App Store + Play Store buttons inside the chat thread.
 * Links are placeholders for the demo phase — real store URLs land at
 * native-app sprint (Phase 3).
 */

import * as React from 'react';
import { EmbeddedCardShell } from './EmbeddedCardShell';

const APP_STORE_HREF = 'https://apps.apple.com/app/id000000000';
const PLAY_STORE_HREF = 'https://play.google.com/store/apps/details?id=app.koncie';

export function EmbeddedDownloadCard() {
  return (
    <EmbeddedCardShell
      eyebrow="Get the app"
      title="Koncie in your pocket"
      body="Live forecasts, on-property bookings, transfer status — wherever you are."
    >
      <a
        href={APP_STORE_HREF}
        className="
          inline-flex items-center
          rounded-full
          bg-[var(--chat-frame)]
          px-3 py-1.5
          text-xs font-medium
          text-white
        "
      >
        App Store
      </a>
      <a
        href={PLAY_STORE_HREF}
        className="
          inline-flex items-center
          rounded-full
          border border-[var(--chat-frame)]
          px-3 py-1.5
          text-xs font-medium
          text-[var(--chat-frame)]
        "
      >
        Google Play
      </a>
    </EmbeddedCardShell>
  );
}
