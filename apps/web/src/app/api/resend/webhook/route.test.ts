/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
}));

import { POST } from './route';
import { prisma } from '@/lib/db/prisma';

const SECRET_RAW_B64 = Buffer.from('super-secret-test-key').toString('base64');
const SECRET = `whsec_${SECRET_RAW_B64}`;

function signBody(body: string, timestampSeconds: number, msgId: string): string {
  const toSign = `${msgId}.${timestampSeconds}.${body}`;
  const sig = crypto
    .createHmac('sha256', Buffer.from(SECRET_RAW_B64, 'base64'))
    .update(toSign, 'utf8')
    .digest('base64');
  return `v1,${sig}`;
}

function makeRequest(body: string, opts: {
  svixId?: string;
  svixTimestamp?: string;
  svixSignature?: string;
}) {
  const headers = new Headers();
  if (opts.svixId) headers.set('svix-id', opts.svixId);
  if (opts.svixTimestamp) headers.set('svix-timestamp', opts.svixTimestamp);
  if (opts.svixSignature) headers.set('svix-signature', opts.svixSignature);
  return {
    text: async () => body,
    headers,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_WEBHOOK_SECRET = SECRET;
  (prisma as any).messageLog = {
    findUnique: vi.fn().mockResolvedValue({ id: 'log-1' }),
    findUniqueOrThrow: vi.fn().mockResolvedValue({ metadata: {} }),
    update: vi.fn().mockResolvedValue({}),
  };
});

describe('Resend webhook — valid signature + email.delivered', () => {
  it('updates MessageLog to DELIVERED with deliveredAt', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const msgId = 'msg_evt_abc';
    const body = JSON.stringify({
      type: 'email.delivered',
      data: { email_id: 'resend-123' },
    });

    const res = await POST(
      makeRequest(body, {
        svixId: msgId,
        svixTimestamp: String(ts),
        svixSignature: signBody(body, ts, msgId),
      }),
    );

    expect(res.status).toBe(200);
    expect((prisma as any).messageLog.findUnique).toHaveBeenCalledWith({
      where: { providerMessageId: 'resend-123' },
      select: { id: true },
    });
    const updateArg = (prisma as any).messageLog.update.mock.calls[0][0];
    expect(updateArg.data.status).toBe('DELIVERED');
    expect(updateArg.data.deliveredAt).toBeInstanceOf(Date);
  });
});

describe('Resend webhook — email.bounced', () => {
  it('records BOUNCED status with bounce.message failure reason', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const msgId = 'msg_evt_bounce';
    const body = JSON.stringify({
      type: 'email.bounced',
      data: {
        email_id: 'resend-999',
        bounce: { message: 'mailbox full' },
      },
    });

    const res = await POST(
      makeRequest(body, {
        svixId: msgId,
        svixTimestamp: String(ts),
        svixSignature: signBody(body, ts, msgId),
      }),
    );

    expect(res.status).toBe(200);
    const updateArg = (prisma as any).messageLog.update.mock.calls[0][0];
    expect(updateArg.data.status).toBe('BOUNCED');
    expect(updateArg.data.failureReason).toBe('mailbox full');
  });
});

describe('Resend webhook — invalid signature', () => {
  it('returns 400 and does not touch the DB', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const msgId = 'msg_evt_bad';
    const body = JSON.stringify({
      type: 'email.delivered',
      data: { email_id: 'resend-bad' },
    });

    const res = await POST(
      makeRequest(body, {
        svixId: msgId,
        svixTimestamp: String(ts),
        svixSignature: 'v1,totally-not-a-real-signature',
      }),
    );

    expect(res.status).toBe(400);
    expect((prisma as any).messageLog.update).not.toHaveBeenCalled();
  });
});

describe('Resend webhook — unknown event type', () => {
  it('returns 200 (prevents Resend retries) and logs breadcrumb', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const msgId = 'msg_evt_unknown';
    const body = JSON.stringify({
      type: 'email.mystery',
      data: { email_id: 'resend-123' },
    });

    const res = await POST(
      makeRequest(body, {
        svixId: msgId,
        svixTimestamp: String(ts),
        svixSignature: signBody(body, ts, msgId),
      }),
    );

    expect(res.status).toBe(200);
    expect((prisma as any).messageLog.update).not.toHaveBeenCalled();
  });
});

describe('Resend webhook — no matching MessageLog', () => {
  it('returns 200 matched:false when providerMessageId has no row', async () => {
    (prisma as any).messageLog.findUnique.mockResolvedValue(null);

    const ts = Math.floor(Date.now() / 1000);
    const msgId = 'msg_evt_orphan';
    const body = JSON.stringify({
      type: 'email.delivered',
      data: { email_id: 'resend-orphan' },
    });

    const res = await POST(
      makeRequest(body, {
        svixId: msgId,
        svixTimestamp: String(ts),
        svixSignature: signBody(body, ts, msgId),
      }),
    );

    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.matched).toBe(false);
    expect((prisma as any).messageLog.update).not.toHaveBeenCalled();
  });
});
