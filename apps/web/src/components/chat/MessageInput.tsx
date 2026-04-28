'use client';

/**
 * Free-text message input (Sprint-6 + 2026-04-28 polish).
 * Source: Planning/2026-04-28-chat-ui-polish-brief.md §2.4.
 *
 * Visual contract:
 *  - Pill textarea that auto-grows up to 4 lines (max-height token), then
 *    scrolls internally.
 *  - 16px text — meets the iOS Safari "no zoom on focus" floor.
 *  - Send button is a 36px circular icon button (lucide ArrowUp). It
 *    APPEARS only when the input has non-whitespace content; while empty,
 *    the textarea expands to fill the row.
 *  - Per option (b) of the brief §6, this component also owns the
 *    typing-indicator slot — when a guest message is in flight, render
 *    <TypingIndicator /> ABOVE the form so MessageList can stay a
 *    Server Component.
 */

import * as React from 'react';
import { useTransition } from 'react';
import { ArrowUp } from 'lucide-react';
import { sendChatMessage } from '@/app/c/[token]/actions';
import { TypingIndicator } from './TypingIndicator';

export function MessageInput({ token }: { token: string }) {
  const [value, setValue] = React.useState('');
  const [pending, startTransition] = useTransition();
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  // Auto-grow: reset to height: auto, then set to scrollHeight clamped to
  // --chat-input-max-height (96px = 4 lines at 16px / 1.4).
  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const max = 96;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, [value]);

  const hasContent = value.trim().length > 0;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = value.trim();
    if (!body) return;
    setValue('');
    startTransition(async () => {
      await sendChatMessage({ token, body });
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a newline. Mirrors Slack/iMessage
    // muscle memory.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e);
    }
  }

  return (
    <>
      {pending ? <TypingIndicator /> : null}
      <form
        onSubmit={onSubmit}
        className="
          flex items-end gap-2
          border-t border-[var(--chat-divider)]
          bg-[var(--chat-status-bg)]
          px-4 py-3
        "
      >
        <textarea
          ref={textareaRef}
          aria-label="Message"
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Message"
          disabled={pending}
          className="
            flex-1 resize-none
            rounded-[var(--chat-input-radius)]
            border border-[var(--chat-input-border)]
            bg-[var(--chat-input-bg)]
            px-4 py-[10px]
            text-[length:var(--chat-text-input)] leading-snug
            text-[var(--chat-status-text)]
            outline-none
            focus:border-[var(--chat-bubble-guest)]
            placeholder:text-[var(--chat-input-placeholder)]
          "
          style={{
            minHeight: 'var(--chat-input-height)',
            maxHeight: 'var(--chat-input-max-height)',
          }}
        />
        {hasContent ? (
          <button
            type="submit"
            disabled={pending}
            aria-label="Send"
            className="
              shrink-0
              flex items-center justify-center
              rounded-[var(--chat-send-radius)]
              bg-[var(--chat-send-bg)]
              text-white
              transition-all duration-[160ms] ease-out
              animate-chat-send-show
              disabled:bg-[var(--chat-send-bg-disabled)]
            "
            style={{
              height: 'var(--chat-send-size)',
              width: 'var(--chat-send-size)',
            }}
          >
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </form>
    </>
  );
}
