/* eslint-disable @typescript-eslint/no-explicit-any */
// Loose any-typed Prisma mocks — matches Sprint 3/4/5 policy.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
}));

// resend exports a class `Resend` whose instances have `emails.send(...)`.
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

import { sendMessage } from './send';
import { prisma } from '@/lib/db/prisma';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = 'test-key';
  (prisma as any).messageLog = {
    create: vi.fn().mockImplementation(async ({ data }: any) => ({
      id: 'log-1',
      status: 'QUEUED',
      ...data,
    })),
    update: vi.fn().mockImplementation(async ({ where, data }: any) => ({
      id: where.id,
      ...data,
    })),
  };
});

describe('sendMessage happy path', () => {
  it('inserts MessageLog QUEUED then updates to SENT with providerMessageId', async () => {
    sendMock.mockResolvedValue({ data: { id: 'resend-123' }, error: null });

    const result = await sendMessage({
      kind: 'UPSELL_REMINDER_T7',
      templateId: 'upsell-reminder-t7-v1',
      to: 'jane@demo.com',
      guestId: 'g1',
      bookingId: 'b1',
      vars: {
        firstName: 'Jane',
        propertyName: 'Namotu',
        checkInDate: 'Tue 14 Jul 2026',
        hubUrl: 'https://koncie.app/hub',
      },
    });

    expect(result.delivered).toBe(true);
    expect((prisma as any).messageLog.create).toHaveBeenCalledTimes(1);
    const createArg = (prisma as any).messageLog.create.mock.calls[0][0];
    expect(createArg.data.status).toBe('QUEUED');
    expect(createArg.data.kind).toBe('UPSELL_REMINDER_T7');
    expect(createArg.data.guestId).toBe('g1');
    expect(createArg.data.bookingId).toBe('b1');
    expect(createArg.data.recipientEmail).toBe('jane@demo.com');

    expect(sendMock).toHaveBeenCalledTimes(1);
    const resendArg = sendMock.mock.calls[0]![0];
    expect(resendArg.to).toEqual(['jane@demo.com']);
    expect(resendArg.tags).toEqual([
      { name: 'message_log_id', value: 'log-1' },
    ]);

    const updateArgs = (prisma as any).messageLog.update.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: 'log-1' });
    expect(updateArgs.data.status).toBe('SENT');
    expect(updateArgs.data.providerMessageId).toBe('resend-123');
    expect(updateArgs.data.sentAt).toBeInstanceOf(Date);
  });
});

describe('sendMessage failure path', () => {
  it('updates MessageLog to FAILED with failureReason and swallows the Resend error', async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { message: 'rate_limited' },
    });

    const result = await sendMessage({
      kind: 'INSURANCE_RECEIPT',
      templateId: 'insurance-receipt-v1',
      to: 'jane@demo.com',
      vars: {
        firstName: 'Jane',
        policyNumber: 'POL-1',
        tier: 'Comprehensive',
        premiumDisplay: 'A$149.00',
        propertyName: 'Namotu',
      },
    });

    expect(result.delivered).toBe(false);
    const updateArg = (prisma as any).messageLog.update.mock.calls[0][0];
    expect(updateArg.data.status).toBe('FAILED');
    expect(updateArg.data.failureReason).toBe('rate_limited');
  });

  it('also catches thrown exceptions from resend.emails.send', async () => {
    sendMock.mockRejectedValue(new Error('network blew up'));

    const result = await sendMessage({
      kind: 'INSURANCE_REMINDER_T3',
      templateId: 'insurance-reminder-t3-v1',
      to: 'jane@demo.com',
      vars: {
        firstName: 'Jane',
        propertyName: 'Namotu',
        checkInDate: 'Tue 14 Jul 2026',
        offerUrl: 'https://koncie.app/hub',
      },
    });

    expect(result.delivered).toBe(false);
    const updateArg = (prisma as any).messageLog.update.mock.calls[0][0];
    expect(updateArg.data.status).toBe('FAILED');
    expect(updateArg.data.failureReason).toBe('network blew up');
  });
});

describe('sendMessage template lookup', () => {
  it('throws when templateId is unknown — caller bug, not a runtime messaging outage', async () => {
    await expect(
      sendMessage({
        kind: 'OTHER',
        templateId: 'does-not-exist',
        to: 'jane@demo.com',
        vars: {},
      }),
    ).rejects.toThrow(/Unknown message template/);

    // Should NOT create a MessageLog row — nothing to log against.
    expect((prisma as any).messageLog.create).not.toHaveBeenCalled();
  });
});

describe('sendMessage env guard', () => {
  it('records FAILED when RESEND_API_KEY is unset (CI/build with placeholder env)', async () => {
    delete process.env.RESEND_API_KEY;

    const result = await sendMessage({
      kind: 'UPSELL_REMINDER_T7',
      templateId: 'upsell-reminder-t7-v1',
      to: 'jane@demo.com',
      vars: {
        firstName: 'Jane',
        propertyName: 'Namotu',
        checkInDate: 'Tue 14 Jul 2026',
        hubUrl: 'https://koncie.app/hub',
      },
    });

    expect(result.delivered).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
    const updateArg = (prisma as any).messageLog.update.mock.calls[0][0];
    expect(updateArg.data.status).toBe('FAILED');
    expect(updateArg.data.failureReason).toMatch(/RESEND_API_KEY/);
  });
});
