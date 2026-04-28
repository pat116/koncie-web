/**
 * TypingIndicator — three-dot animated AI bubble shown while a guest
 * message is in-flight (server action pending).
 * Source: Planning/2026-04-28-chat-ui-polish-brief.md §2.6.
 *
 * Per option (b) of brief §6: this component renders ABOVE the input bar,
 * NOT inside MessageList — that keeps MessageList a Server Component and
 * avoids hydration churn. The `pending` state lives in MessageInput /
 * SuggestionChips (already client components).
 *
 * Visually: same chrome as an AI bubble (white bg, navy text colour,
 * tail bottom-left). Three dots use the keyframes in chat.css.
 */

import * as React from 'react';

export function TypingIndicator() {
  return (
    <div className="flex items-start px-5 pb-1 pt-2">
      <div
        aria-label="Concierge is typing"
        role="status"
        className="
          flex items-center gap-1.5
          rounded-[var(--chat-bubble-radius)]
          rounded-bl-[var(--chat-bubble-tail-radius)]
          bg-[var(--chat-bubble-ai)]
          px-4 py-3
          text-[var(--chat-bubble-ai-text)]
          shadow-[var(--chat-bubble-ai-shadow)]
        "
      >
        <span className="h-2 w-2 rounded-full bg-current opacity-40 animate-chat-typing-dot-1" />
        <span className="h-2 w-2 rounded-full bg-current opacity-40 animate-chat-typing-dot-2" />
        <span className="h-2 w-2 rounded-full bg-current opacity-40 animate-chat-typing-dot-3" />
      </div>
    </div>
  );
}
