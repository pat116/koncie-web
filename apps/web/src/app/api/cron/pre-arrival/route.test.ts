/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
}));

const { sendMessageMock } = vi.hoisted(() => ({
  sendMessageMock: vi.fn(),
}));
vi.mock('@/lib/messaging/send', () => ({
  sendMessage: sendMessageMock,
}));

import { GET } from './route';
import { prisma } from '@/lib/db/prisma';

const CRON_SECRET = 'test-cron-secret';

function makeRequest(auth?: string) {
  const headers = new Headers();
  if (auth) headers.set('authorization', auth);
  return { headers } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = CRON_SECRET;
  process.env.NEXT_PUBLIC_SITE_URL = 'https://koncie.app';
  (prisma as any).booking = {
    findMany: vi.fn().mockResolvedValue([]),
  };
  (prisma as any).messageLog = {
    findFirst: vi.fn().mockResolvedValue(null),
  };
  sendMessageMock.mockResolvedValue({ delivered: true, messageLog: { id: 'log-1' } });
});

describe('cron/pre-arrival auth', () => {
  it('returns 401 when bearer token is missing or wrong', async () => {
    const res1 = await GET(makeRequest());
    expect(res1.status).toBe(401);

    const res2 = await GET(makeRequest('Bearer nope'));
    expect(res2.status).toBe(401);

    expect((prisma as any).booking.findMany).not.toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();
  });
});

describe('cron/pre-arrival T-7 upsell', () => {
  it('dispatches UPSELL_REMINDER_T7 for a booking in the window', async () => {
    (prisma as any).booking.findMany
      .mockResolvedValueOnce([
        {
          id: 'b1',
          guestId: 'g1',
          checkIn: new Date('2030-01-01'),
          guest: { email: 'jane@demo.com', firstName: 'Jane' },
          property: { name: 'Namotu' },
        },
      ])
      .mockResolvedValueOnce([]);

    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.t7Dispatched).toBe(1);
    expect(body.t3Dispatched).toBe(0);

    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    const arg = sendMessageMock.mock.calls[0]![0];
    expect(arg.kind).toBe('UPSELL_REMINDER_T7');
    expect(arg.guestId).toBe('g1');
    expect(arg.bookingId).toBe('b1');
    expect(arg.to).toBe('jane@demo.com');
    expect(arg.vars.hubUrl).toBe('https://koncie.app/hub');
  });

  it('skips when a MessageLog row already exists in the last 14 days', async () => {
    (prisma as any).booking.findMany
      .mockResolvedValueOnce([
        {
          id: 'b1',
          guestId: 'g1',
          checkIn: new Date('2030-01-01'),
          guest: { email: 'jane@demo.com', firstName: 'Jane' },
          property: { name: 'Namotu' },
        },
      ])
      .mockResolvedValueOnce([]);
    (prisma as any).messageLog.findFirst.mockResolvedValue({ id: 'existing' });

    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    const body = await res.json();
    expect(body.t7Dispatched).toBe(0);
    expect(body.skipped).toBe(1);
    expect(sendMessageMock).not.toHaveBeenCalled();
  });
});

describe('cron/pre-arrival T-3 insurance', () => {
  it('dispatches INSURANCE_REMINDER_T3 only when guest has no ACTIVE policy (filter enforced in query)', async () => {
    (prisma as any).booking.findMany
      .mockResolvedValueOnce([]) // T-7 bucket empty
      .mockResolvedValueOnce([
        {
          id: 'b2',
          guestId: 'g2',
          checkIn: new Date('2030-02-01'),
          guest: { email: 'dave@demo.com', firstName: 'Dave' },
          property: { name: 'Namotu' },
        },
      ]);

    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    const body = await res.json();
    expect(body.t3Dispatched).toBe(1);

    // Second findMany call is the T-3 one and must filter for no ACTIVE policy.
    const t3Call = (prisma as any).booking.findMany.mock.calls[1][0];
    expect(t3Call.where.guest).toEqual({
      insurancePolicies: { none: { status: 'ACTIVE' } },
    });

    const arg = sendMessageMock.mock.calls[0]![0];
    expect(arg.kind).toBe('INSURANCE_REMINDER_T3');
    expect(arg.vars.offerUrl).toBe('https://koncie.app/hub');
  });
});

describe('cron/pre-arrival return shape', () => {
  it('returns { ok, t7Dispatched, t3Dispatched, skipped } on happy path', async () => {
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      t7Dispatched: 0,
      t3Dispatched: 0,
      skipped: 0,
    });
  });
});
