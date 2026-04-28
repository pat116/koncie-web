'use client';

/**
 * Free-text message input (Sprint-6 completion §3.S6-06). Free-typed
 * messages fall through to the canned-response generic reply for MVP —
 * no live LLM. A small "Edit before sending" affordance below mitigates
 * accidental chip-taps (per the original brief Risk §9).
 */

import * as React from 'react';
import { useTransition } from 'react';
import { sendChatMessage } from '@/app/c/[token]/actions';

export function MessageInput({ token }: { token: string }) {
  const [value, setValue] = React.useState('');
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = value.trim();
    if (!body) return;
    setValue('');
    startTransition(async () => {
      await sendChatMessage({ token, body });
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex gap-2 border-t border-koncie-border bg-white px-5 py-3"
    >
      <input
        type="text"
        aria-label="Message"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Type a message…"
        className="flex-1 rounded-full border border-koncie-border bg-koncie-sand px-4 py-2 text-sm text-koncie-charcoal outline-none focus:border-koncie-navy"
        disabled={pending}
      />
      <button
        type="submit"
        disabled={pending || value.trim().length === 0}
        className="rounded-full bg-koncie-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        Send
      </button>
    </form>
  );
}
