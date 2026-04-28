/**
 * EmbeddedCardShell — common chrome for in-thread CTA cards.
 * Source: Planning/2026-04-28-chat-ui-polish-brief.md §2.7.
 *
 * Used by EmbeddedDownloadCard and EmbeddedRegisterCard so both render
 * with a consistent eyebrow + title + body + CTA-row layout. Aligned
 * with the AI bubble (left side, max-width 78%, smaller corner radius
 * than bubbles to feel like a "different shape").
 */

import * as React from 'react';

export function EmbeddedCardShell({
  eyebrow,
  title,
  body,
  children,
}: {
  eyebrow: string;
  title: string;
  body: React.ReactNode;
  /// CTA buttons / links — laid out in a horizontal row with chat-card-button-gap.
  children: React.ReactNode;
}) {
  return (
    <div
      className="
        mt-2 w-fit max-w-[78%]
        rounded-[var(--chat-card-radius)]
        border border-[var(--chat-card-border)]
        bg-[var(--chat-card-bg)]
        px-[var(--chat-card-padding-x)] py-[var(--chat-card-padding-y)]
        space-y-2
      "
    >
      <p
        className="
          text-[var(--chat-text-header-eyebrow)] font-semibold uppercase tracking-wider
          text-[var(--chat-meta-text)]
        "
      >
        {eyebrow}
      </p>
      <p
        className="
          text-[var(--chat-text-body)] font-semibold
          text-[var(--chat-status-text)]
        "
      >
        {title}
      </p>
      <p className="text-sm leading-relaxed text-[var(--chat-status-text)]">
        {body}
      </p>
      <div className="flex flex-wrap gap-[var(--chat-card-button-gap)] pt-1">
        {children}
      </div>
    </div>
  );
}
