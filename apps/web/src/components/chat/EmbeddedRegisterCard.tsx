'use client';

/**
 * Embedded "Create your Koncie account" CTA inside the chat thread
 * (Sprint-6 completion + 2026-04-28 polish).
 *
 * Click handler fires the `triggerRegisterMagicLink` server action — that
 * action mints a bridge token (with `origin` payload) and embeds it as
 * `?bt=…` on the Supabase OTP magic-link redirect. Following the link
 * lands the now-authenticated guest back inside the originating modal
 * with state rehydrated (S6-07 post-auth landing handler).
 */

import * as React from 'react';
import { triggerRegisterMagicLink } from '@/app/c/[token]/actions';
import type { OriginCardKind } from '@/lib/chat/tokens';
import { EmbeddedCardShell } from './EmbeddedCardShell';

type Status = 'idle' | 'pending' | 'sent' | 'error';

export function EmbeddedRegisterCard({
  reason,
  originCardKind,
  originModalState,
}: {
  reason: string;
  originCardKind: OriginCardKind;
  originModalState: Record<string, unknown>;
}) {
  const [status, setStatus] = React.useState<Status>('idle');
  const [errorDetail, setErrorDetail] = React.useState<string | null>(null);

  async function onClick() {
    setStatus('pending');
    setErrorDetail(null);
    const res = await triggerRegisterMagicLink({
      reason,
      originCardKind,
      originModalState,
    });
    if (res.ok) {
      setStatus('sent');
    } else {
      setStatus('error');
      setErrorDetail(res.detail ?? null);
    }
  }

  return (
    <EmbeddedCardShell
      eyebrow="Create account"
      title="Save your trip to Koncie"
      body="We'll email you a sign-in link — no password."
    >
      <button
        type="button"
        onClick={onClick}
        disabled={status === 'pending' || status === 'sent'}
        className="
          inline-flex items-center
          rounded-full
          bg-[var(--chat-send-bg)]
          px-4 py-1.5
          text-xs font-semibold
          text-white
          disabled:opacity-60
        "
      >
        {status === 'pending'
          ? 'Sending…'
          : status === 'sent'
            ? 'Check your inbox'
            : 'Email me a sign-in link'}
      </button>
      {status === 'error' ? (
        <span className="text-xs text-destructive">
          Couldn&apos;t send right now{errorDetail ? ` — ${errorDetail}` : ''}.
        </span>
      ) : null}
    </EmbeddedCardShell>
  );
}
