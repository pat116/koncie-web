'use client';

/**
 * Auto-send-on-tap suggestion strip (Sprint-6 + 2026-04-28 polish).
 * Source: Planning/2026-04-28-chat-ui-polish-brief.md §2.3.
 *
 * Single-line horizontally-scrollable strip — chips MUST never wrap into
 * a second row. The `scrollbar-hide` utility (defined in chat.css) hides
 * the horizontal scrollbar to keep the phone aesthetic clean.
 *
 * Tapping a chip auto-fires `sendChatMessage` with the chip's `label` as
 * the message body. This component owns the `pending` state, but the
 * shared visual "AI is typing" indicator is rendered by MessageInput
 * (which also owns its own `pending` from the typed-input branch).
 */

import * as React from 'react';
import { useTransition } from 'react';
import { sendChatMessage } from '@/app/c/[token]/actions';
import { DEFAULT_SUGGESTIONS } from '@/config/suggestions';

export function SuggestionChips({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  function onTap(label: string) {
    startTransition(async () => {
      await sendChatMessage({ token, body: label });
    });
  }
  return (
    <div
      className="
        flex gap-2
        overflow-x-auto
        scrollbar-hide
        bg-[var(--chat-bg)]
        px-4 pb-2 pt-1
      "
      style={{ minHeight: 'var(--chat-suggestion-strip-height)' }}
    >
      {DEFAULT_SUGGESTIONS.map((s) => (
        <button
          key={s.slug}
          type="button"
          onClick={() => onTap(s.label)}
          disabled={pending}
          className="
            shrink-0
            whitespace-nowrap
            rounded-full
            border border-[var(--chat-suggestion-border)]
            bg-[var(--chat-suggestion-bg)]
            px-[var(--chat-suggestion-padding-x)] py-[var(--chat-suggestion-padding-y)]
            text-[length:var(--chat-text-suggestion)] font-medium
            text-[var(--chat-suggestion-text)]
            transition-transform duration-[120ms] ease-out
            active:scale-[0.97]
            active:bg-[var(--chat-suggestion-active)]
            disabled:opacity-50
          "
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
