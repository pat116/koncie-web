'use client';

/**
 * Auto-send-on-tap suggestion chips (Sprint-6 completion §3.S6-06).
 *
 * Tapping a chip pre-populates the input with the chip's `label` and
 * fires the send. The input box still allows free typing — chips are
 * just the fast path.
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
    <div className="flex flex-wrap gap-2 px-5 pb-2">
      {DEFAULT_SUGGESTIONS.map((s) => (
        <button
          key={s.slug}
          type="button"
          onClick={() => onTap(s.label)}
          disabled={pending}
          className="rounded-full border border-koncie-border bg-white px-3 py-1.5 text-xs text-koncie-navy disabled:opacity-50"
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
