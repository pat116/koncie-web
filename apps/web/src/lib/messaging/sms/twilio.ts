/**
 * Twilio SMS sender (Sprint-6 completion §3.S6-02).
 *
 * Trial-account only for the demo phase. The verified-numbers allowlist is
 * required by Twilio trial AND acts as a guardrail so the demo build cannot
 * accidentally SMS a real guest.
 *
 * Mode semantics:
 *   - `sandbox` (default) — no Twilio API call. Persists rendered body to
 *     MessageLog with `metadata.sandbox=true`. ALLOWLIST GUARD IS SKIPPED in
 *     sandbox so the demo can preview SMS sends to non-allowlisted numbers
 *     (completion brief §8 risk-mitigation locks this ordering).
 *   - `live` — applies the allowlist guard before hitting Twilio. Refused
 *     destinations write a `FAILED` MessageLog row with
 *     `failureReason="not_allowlisted"`.
 *
 * Phone normalisation handles AU (`+61…`), US (`+1…`), Pacific (`+679…` Fiji).
 *
 * Parallel to `messaging/send.ts` (email path). The two senders share the
 * MessageLog table and the QUEUED→SENT/FAILED lifecycle, but the SMS body
 * is text-only and templates conform to a separate `SmsTemplate<Vars>` type.
 */

import * as Sentry from '@sentry/nextjs';
import type { MessageKind } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  getTwilioMode,
  type SmsSendResult,
  type SmsTemplate,
} from './types';

export type SendSmsInput<Vars> = {
  kind: MessageKind;
  template: SmsTemplate<Vars>;
  to: string;
  vars: Vars;
  guestId?: string;
  bookingId?: string;
  metadata?: Record<string, unknown>;
};

const TRIAL_GSM7_LIMIT = 160;

/**
 * Normalise a phone number to E.164. Accepts:
 *   - already E.164 (`+61…`, `+1…`, `+679…`) — passes through
 *   - AU local (`04xx…` or `4xx…` — heuristic: 10-digit starting 04, 11-digit
 *     starting with 614 implied trunk) → `+61…`
 *   - bare digits with leading `00` (AU IDD prefix) → `+…`
 *
 * Anything we can't parse confidently is returned as-is (Twilio will reject).
 */
export function normalisePhoneE164(input: string): string {
  const trimmed = input.trim().replace(/[\s\-()]/g, '');
  if (trimmed.startsWith('+')) return trimmed;
  if (trimmed.startsWith('00')) return `+${trimmed.slice(2)}`;
  // AU local: 04xx xxx xxx → +614xx xxx xxx
  if (/^04\d{8}$/.test(trimmed)) return `+61${trimmed.slice(1)}`;
  // US local: 10 digits starting 1–9 with no leading 0 → assume +1
  if (/^[1-9]\d{9}$/.test(trimmed)) return `+1${trimmed}`;
  return trimmed;
}

function getAllowlist(): Set<string> {
  const raw = process.env.KONCIE_TWILIO_ALLOWLIST ?? '';
  return new Set(
    raw
      .split(',')
      .map((s) => normalisePhoneE164(s))
      .filter(Boolean),
  );
}

function bodyTooLong(text: string): boolean {
  // GSM-7 7-bit alphabet. We don't enforce the limit — just warn (cost
  // doubles for >160).
  return text.length > TRIAL_GSM7_LIMIT;
}

export async function sendSms<Vars>(
  input: SendSmsInput<Vars>,
): Promise<SmsSendResult> {
  const mode = getTwilioMode();
  const to = normalisePhoneE164(input.to);
  const rendered = input.template.render(input.vars);
  const text = rendered.text;

  if (bodyTooLong(text)) {
    Sentry.addBreadcrumb({
      category: 'sms.twilio',
      level: 'warning',
      message: `SMS body exceeds ${TRIAL_GSM7_LIMIT} chars (${text.length}); cost doubles`,
    });
  }

  // Allowlist guard. Only applies in `live` mode — sandbox MUST short-circuit
  // the guard so demo previews to a non-allowlisted number still produce a
  // sandboxed MessageLog row (completion brief §8 risk-mitigation).
  if (mode === 'live') {
    const allowlist = getAllowlist();
    if (!allowlist.has(to)) {
      const log = await prisma.messageLog.create({
        data: {
          guestId: input.guestId,
          bookingId: input.bookingId,
          kind: input.kind,
          templateId: input.template.id,
          recipientPhone: to,
          subject: `SMS to ${to}`,
          status: 'FAILED',
          failureReason: 'not_allowlisted',
          metadata: {
            ...(input.metadata ?? {}),
            channel: 'sms',
            mode: 'live',
            bodyPreview: text.slice(0, 80),
          } as object,
        },
      });
      return {
        ok: false,
        reason: 'not_allowlisted',
        messageLogId: log.id,
      };
    }
  }

  // Sandbox mode (or live + allowlisted): create a QUEUED row first so the
  // audit captures the attempt regardless of outcome.
  const queued = await prisma.messageLog.create({
    data: {
      guestId: input.guestId,
      bookingId: input.bookingId,
      kind: input.kind,
      templateId: input.template.id,
      recipientPhone: to,
      subject: `SMS to ${to}`,
      status: 'QUEUED',
      metadata: {
        ...(input.metadata ?? {}),
        channel: 'sms',
        mode,
        ...(mode === 'sandbox' ? { sandbox: true, body: text } : {}),
      } as object,
    },
  });

  if (mode === 'sandbox') {
    const updated = await prisma.messageLog.update({
      where: { id: queued.id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
      },
    });
    return {
      ok: true,
      messageLogId: updated.id,
      sandboxed: true,
    };
  }

  // Live mode — call Twilio.
  const accountSid = process.env.KONCIE_TWILIO_ACCOUNT_SID;
  const authToken = process.env.KONCIE_TWILIO_AUTH_TOKEN;
  const from = process.env.KONCIE_TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !from) {
    const updated = await prisma.messageLog.update({
      where: { id: queued.id },
      data: {
        status: 'FAILED',
        failureReason: 'twilio_credentials_missing',
      },
    });
    return {
      ok: false,
      reason: 'config_missing',
      messageLogId: updated.id,
    };
  }

  try {
    const params = new URLSearchParams();
    params.append('To', to);
    params.append('From', from);
    params.append('Body', text);

    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${auth}`,
        },
        body: params,
      },
    );
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      const updated = await prisma.messageLog.update({
        where: { id: queued.id },
        data: {
          status: 'FAILED',
          failureReason: `twilio_${res.status}: ${errBody.slice(0, 200)}`,
        },
      });
      Sentry.captureMessage(
        `Twilio send failed ${res.status}`,
        'error',
      );
      return {
        ok: false,
        reason: 'send_failed',
        messageLogId: updated.id,
        detail: `${res.status}`,
      };
    }
    const data = (await res.json()) as { sid?: string };
    const updated = await prisma.messageLog.update({
      where: { id: queued.id },
      data: {
        status: 'SENT',
        providerMessageId: data.sid ?? null,
        sentAt: new Date(),
      },
    });
    return {
      ok: true,
      messageLogId: updated.id,
      sandboxed: false,
      providerMessageId: data.sid,
    };
  } catch (err) {
    const updated = await prisma.messageLog.update({
      where: { id: queued.id },
      data: {
        status: 'FAILED',
        failureReason: err instanceof Error ? err.message : String(err),
      },
    });
    Sentry.captureException(err, {
      tags: { messageLogId: queued.id, templateId: input.template.id },
    });
    return {
      ok: false,
      reason: 'send_failed',
      messageLogId: updated.id,
      detail: err instanceof Error ? err.message : undefined,
    };
  }
}
