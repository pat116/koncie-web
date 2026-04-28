/**
 * PhoneShell — stylised phone-themed conversation surface.
 * Source: Planning/2026-04-28-chat-ui-polish-brief.md §2.1.
 *
 * Reads as a text-message conversation at a glance, but is unambiguously
 * Koncie-branded — no Apple blue, no clock/battery/signal mock, no
 * iMessage bubble geometry.
 *
 * Layout:
 *   [DeviceFrame ≥md]
 *     [StatusBar]   "Concierge online" pill, no time/battery
 *     [ConversationHeader]   back-link to /hub/trip · CONCIERGE + property · K avatar
 *     [ConversationBody]     scrollable; children = MessageList + below-list slots
 *   [/DeviceFrame]
 *
 * Below md (`md:` = 768px) the device frame is dropped; the conversation
 * fills the screen edge-to-edge.
 */

import * as React from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

export function PhoneShell({
  propertyName,
  children,
}: {
  propertyName: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="
        min-h-screen
        bg-[var(--chat-bg)]
        md:flex md:items-center md:justify-center
        md:py-8
      "
    >
      <div
        className="
          flex min-h-screen w-full flex-col overflow-hidden
          bg-[var(--chat-bg)]
          md:min-h-0 md:h-[760px]
          md:max-w-[var(--chat-frame-max-width)]
          md:rounded-[var(--chat-frame-radius)]
          md:border md:border-[var(--chat-frame)]/20
          md:shadow-[var(--chat-frame-shadow)]
        "
      >
        <StatusBar />
        <ConversationHeader propertyName={propertyName} />
        <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
      </div>
    </div>
  );
}

function StatusBar() {
  return (
    <div className="flex items-center justify-center bg-[var(--chat-status-bg)] px-4 py-2">
      <span
        className="
          inline-flex items-center gap-1.5
          rounded-full
          bg-[var(--chat-status-pill)]
          px-2.5 py-0.5
          text-[11px] font-medium tracking-wide
          text-[var(--chat-status-pill-text)]
        "
      >
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full bg-[var(--chat-status-pill-text)]"
        />
        Concierge online
      </span>
    </div>
  );
}

function ConversationHeader({ propertyName }: { propertyName: string }) {
  return (
    <header
      className="
        flex items-center justify-between
        border-b border-[var(--chat-divider)]
        bg-[var(--chat-status-bg)]
        px-3 py-3
      "
    >
      <Link
        href="/hub/trip"
        className="
          flex items-center gap-0.5
          text-[13px] font-medium text-[var(--chat-status-text)]
          hover:opacity-70
          flex-1
          basis-0
        "
        aria-label="Back to your trip"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        <span>Trip</span>
      </Link>
      <div className="flex flex-1 basis-0 flex-col items-center text-center">
        <p
          className="
            text-[var(--chat-text-header-eyebrow)]
            font-semibold uppercase tracking-wider
            text-[var(--chat-meta-text)]
          "
        >
          Concierge
        </p>
        <p
          className="
            text-[var(--chat-text-header)]
            font-semibold
            text-[var(--chat-status-text)]
          "
        >
          {propertyName}
        </p>
      </div>
      <div className="flex flex-1 basis-0 justify-end">
        <div
          aria-hidden="true"
          className="
            flex h-7 w-7 items-center justify-center
            rounded-full
            bg-[var(--chat-bubble-guest)]
            text-[13px] font-bold
            text-[var(--chat-bubble-guest-text)]
          "
        >
          K
        </div>
      </div>
    </header>
  );
}
