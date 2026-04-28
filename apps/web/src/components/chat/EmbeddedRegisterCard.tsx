'use client';

/**
 * Embedded "Create your Koncie account" CTA inside the chat thread
 * (Sprint-6 completion §3.S6-06).
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
    <div className="mt-2 rounded-2xl border border-koncie-border bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-koncie-charcoal/60">
        Create your Koncie account
      </p>
      <p className="mt-1 text-sm text-koncie-charcoal">
        We&apos;ll email you a sign-in link — no password.
      </p>
      <button
        type="button"
        onClick={onClick}
        disabled={status === 'pending' || status === 'sent'}
        className="mt-3 inline-flex items-center rounded-full bg-koncie-green-cta px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
      >
        {status === 'pending'
          ? 'Sending…'
          : status === 'sent'
            ? 'Check your inbox'
            : 'Email me a sign-in link'}
      </button>
      {status === 'error' ? (
        <p className="mt-2 text-xs text-destructive">
          Couldn&apos;t send right now{errorDetail ? ` — ${errorDetail}` : ''}.
        </p>
      ) : null}
    </div>
  );
}
