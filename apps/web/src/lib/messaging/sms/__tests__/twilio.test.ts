/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

import { sendSms, normalisePhoneE164 } from '../twilio';
import type { SmsTemplate } from '../types';
import { prisma } from '@/lib/db/prisma';

const stubTemplate: SmsTemplate<{ name: string }> = {
  id: 'stub-sms-v1',
  render: ({ name }) => ({ text: `hi ${name}` }),
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.KONCIE_TWILIO_MODE;
  delete process.env.KONCIE_TWILIO_ALLOWLIST;
  delete process.env.KONCIE_TWILIO_ACCOUNT_SID;
  delete process.env.KONCIE_TWILIO_AUTH_TOKEN;
  delete process.env.KONCIE_TWILIO_FROM_NUMBER;
  (prisma as any).messageLog = {
    create: vi.fn().mockImplementation(async ({ data }: any) => ({
      id: 'log-1',
      ...data,
    })),
    update: vi.fn().mockImplementation(async ({ where, data }: any) => ({
      id: where.id,
      ...data,
    })),
  };
});

describe('normalisePhoneE164', () => {
  it('passes through E.164 inputs unchanged', () => {
    expect(normalisePhoneE164('+61412345678')).toBe('+61412345678');
    expect(normalisePhoneE164('+15551234567')).toBe('+15551234567');
    expect(normalisePhoneE164('+6791234567')).toBe('+6791234567');
  });
  it('strips whitespace and punctuation, then re-formats', () => {
    expect(normalisePhoneE164(' +61 412 345 678 ')).toBe('+61412345678');
    expect(normalisePhoneE164('+1 (555) 123-4567')).toBe('+15551234567');
  });
  it('rewrites AU local 04xx... to +614xx...', () => {
    expect(normalisePhoneE164('0412345678')).toBe('+61412345678');
  });
  it('rewrites 00 IDD prefix to +', () => {
    expect(normalisePhoneE164('006791234567')).toBe('+6791234567');
  });
});

describe('sendSms sandbox mode (default)', () => {
  it('persists rendered body without calling Twilio', async () => {
    const result = await sendSms({
      kind: 'PRE_ARRIVAL_SMS',
      template: stubTemplate,
      to: '+61412345678',
      vars: { name: 'Pat' },
      bookingId: 'b1',
      guestId: 'g1',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sandboxed).toBe(true);
    const create = (prisma as any).messageLog.create.mock.calls[0][0];
    expect(create.data.metadata.sandbox).toBe(true);
    expect(create.data.metadata.body).toBe('hi Pat');
    expect(create.data.recipientPhone).toBe('+61412345678');
  });

  it('skips the allowlist guard in sandbox even for non-allowlisted destinations', async () => {
    process.env.KONCIE_TWILIO_ALLOWLIST = '+61999999999'; // someone else
    const result = await sendSms({
      kind: 'PRE_ARRIVAL_SMS',
      template: stubTemplate,
      to: '+61412345678',
      vars: { name: 'Pat' },
    });
    expect(result.ok).toBe(true);
  });
});

describe('sendSms live mode allowlist guard', () => {
  it('rejects destinations not in KONCIE_TWILIO_ALLOWLIST with FAILED MessageLog', async () => {
    process.env.KONCIE_TWILIO_MODE = 'live';
    process.env.KONCIE_TWILIO_ALLOWLIST = '+61999999999,+61888888888';
    const result = await sendSms({
      kind: 'PRE_ARRIVAL_SMS',
      template: stubTemplate,
      to: '+61412345678',
      vars: { name: 'Pat' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('not_allowlisted');
    }
    const create = (prisma as any).messageLog.create.mock.calls[0][0];
    expect(create.data.status).toBe('FAILED');
    expect(create.data.failureReason).toBe('not_allowlisted');
  });

  it('records FAILED config_missing when Twilio creds are absent in live mode for an allowlisted number', async () => {
    process.env.KONCIE_TWILIO_MODE = 'live';
    process.env.KONCIE_TWILIO_ALLOWLIST = '+61412345678';
    const result = await sendSms({
      kind: 'PRE_ARRIVAL_SMS',
      template: stubTemplate,
      to: '+61412345678',
      vars: { name: 'Pat' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('config_missing');
  });
});

describe('sendSms phone normalisation in send path', () => {
  it('writes the normalised E.164 onto the MessageLog row', async () => {
    await sendSms({
      kind: 'PRE_ARRIVAL_SMS',
      template: stubTemplate,
      to: '0412345678', // AU local input
      vars: { name: 'Pat' },
    });
    const create = (prisma as any).messageLog.create.mock.calls[0][0];
    expect(create.data.recipientPhone).toBe('+61412345678');
  });
});
