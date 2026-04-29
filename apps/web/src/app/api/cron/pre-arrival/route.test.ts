/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
}));

const { sendMessageMock, sendSmsMock, mintChatTokenMock, getOrCreateConversationMock, welcomeMock } =
  vi.hoisted(() => ({
    sendMessageMock: vi.fn(),
    sendSmsMock: vi.fn(),
    mintChatTokenMock: vi.fn(),
    getOrCreateConversationMock: vi.fn(),
    welcomeMock: vi.fn(),
  }));
vi.mock('@/lib/messaging/send', () => ({ sendMessage: sendMessageMock }));
vi.mock('@/lib/messaging/sms/twilio', () => ({ sendSms: sendSmsMock }));
vi.mock('@/lib/chat/tokens', () => ({ mintChatToken: mintChatTokenMock }));
vi.mock('@/lib/chat/store', () => ({
  getOrCreateConversation: getOrCreateConversationMock,
}));
vi.mock('@/lib/notifications/service', () => ({
  createWelcomeToResortNotification: welcomeMock,
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
  (prisma as any).hotelBooking = {
    findMany: vi.fn().mockResolvedValue([]),
  };
  (prisma as any).messageLog = {
    findFirst: vi.fn().mockResolvedValue(null),
  };
  sendMessageMock.mockResolvedValue({ delivered: true, messageLog: { id: 'log-1' } });
  sendSmsMock.mockResolvedValue({ ok: true, messageLogId: 'sms-1', sandboxed: true });
  mintChatTokenMock.mockResolvedValue('chat-token-xyz');
  getOrCreateConversationMock.mockResolvedValue({
    id: 'conv-1',
    bookingId: 'b3',
    greetingSentAt: null,
  });
  welcomeMock.mockResolvedValue(true);
});

describe('cron/pre-arrival auth', () => {
  it('returns 401 when bearer token is missing or wrong', async () => {
    const res1 = await GET(makeRequest());
    expect(res1.status).toBe(401);
    const res2 = await GET(makeRequest('Bearer nope'));
    expect(res2.status).toBe(401);
    expect((prisma as any).hotelBooking.findMany).not.toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(sendSmsMock).not.toHaveBeenCalled();
  });
});

describe('cron/pre-arrival T-7 upsell', () => {
  it('dispatches UPSELL_REMINDER_T7 for a booking in the window', async () => {
    (prisma as any).hotelBooking.findMany
      .mockResolvedValueOnce([
        {
          id: 'b1',
          guestId: 'g1',
          checkIn: new Date('2030-01-01'),
          guest: { email: 'jane@demo.com', firstName: 'Jane', phone: null },
          property: { name: 'Namotu' },
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.t7Dispatched).toBe(1);
    expect(body.t3Dispatched).toBe(0);

    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    const arg = sendMessageMock.mock.calls[0]![0];
    expect(arg.kind).toBe('UPSELL_REMINDER_T7');
  });

  it('skips when a MessageLog row already exists in the last 14 days', async () => {
    (prisma as any).hotelBooking.findMany
      .mockResolvedValueOnce([
        {
          id: 'b1',
          guestId: 'g1',
          checkIn: new Date('2030-01-01'),
          guest: { email: 'jane@demo.com', firstName: 'Jane', phone: null },
          property: { name: 'Namotu' },
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
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
  it('dispatches INSURANCE_REMINDER_T3 only when guest has no ACTIVE policy', async () => {
    (prisma as any).hotelBooking.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'b2',
          guestId: 'g2',
          checkIn: new Date('2030-02-01'),
          guest: { email: 'dave@demo.com', firstName: 'Dave', phone: null },
          property: { name: 'Namotu' },
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    const body = await res.json();
    expect(body.t3Dispatched).toBe(1);

    const t3Call = (prisma as any).hotelBooking.findMany.mock.calls[1][0];
    expect(t3Call.where.guest).toEqual({
      insurancePolicies: { none: { status: 'ACTIVE' } },
    });

    const arg = sendMessageMock.mock.calls[0]![0];
    expect(arg.kind).toBe('INSURANCE_REMINDER_T3');
  });
});

describe('cron/pre-arrival T-3 SMS', () => {
  it('dispatches PRE_ARRIVAL_SMS for a booking with a phone on file', async () => {
    (prisma as any).hotelBooking.findMany
      .mockResolvedValueOnce([]) // T-7
      .mockResolvedValueOnce([]) // T-3 email
      .mockResolvedValueOnce([   // T-3 SMS
        {
          id: 'b3',
          guestId: 'g3',
          checkIn: new Date('2030-03-01'),
          guest: { email: 'pat@demo.com', firstName: 'Pat', phone: '+61412345678' },
          property: { name: 'Namotu' },
        },
      ])
      .mockResolvedValueOnce([]); // T-0

    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    const body = await res.json();
    expect(body.smsDispatched).toBe(1);

    expect(getOrCreateConversationMock).toHaveBeenCalledWith('b3');
    expect(mintChatTokenMock).toHaveBeenCalledWith({
      bookingId: 'b3',
      conversationId: 'conv-1',
    });
    expect(sendSmsMock).toHaveBeenCalledTimes(1);
    const arg = sendSmsMock.mock.calls[0]![0];
    expect(arg.kind).toBe('PRE_ARRIVAL_SMS');
    expect(arg.to).toBe('+61412345678');
    expect(arg.vars.deepLink).toBe('https://koncie.app/c/chat-token-xyz');
    expect(arg.vars.firstName).toBe('Pat');

    // The T-3 query MUST filter on guest.phone not-null so we don't waste
    // sends on guests without a phone.
    const smsCall = (prisma as any).hotelBooking.findMany.mock.calls[2][0];
    expect(smsCall.where.guest).toEqual({ phone: { not: null } });
  });

  it('skips PRE_ARRIVAL_SMS when MessageLog dedupes', async () => {
    (prisma as any).hotelBooking.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'b3',
          guestId: 'g3',
          checkIn: new Date('2030-03-01'),
          guest: { email: 'pat@demo.com', firstName: 'Pat', phone: '+61412345678' },
          property: { name: 'Namotu' },
        },
      ])
      .mockResolvedValueOnce([]);
    (prisma as any).messageLog.findFirst.mockResolvedValue({ id: 'existing' });

    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    const body = await res.json();
    expect(body.smsDispatched).toBe(0);
    expect(body.skipped).toBe(1);
    expect(sendSmsMock).not.toHaveBeenCalled();
  });
});

describe('cron/pre-arrival T-0 welcome notification', () => {
  it('creates WELCOME_TO_RESORT notifications via the service', async () => {
    (prisma as any).hotelBooking.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'b4',
          guestId: 'g4',
          checkIn: new Date(),
          guest: { firstName: 'Pat', lastName: 'Shiels' },
          property: { name: 'Namotu' },
        },
      ]);

    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    const body = await res.json();
    expect(body.welcomeNotifications).toBe(1);
    expect(welcomeMock).toHaveBeenCalledTimes(1);
  });
});

describe('cron/pre-arrival return shape', () => {
  it('returns ok + dispatch counts on happy path with no bookings', async () => {
    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      t7Dispatched: 0,
      t3Dispatched: 0,
      smsDispatched: 0,
      welcomeNotifications: 0,
      skipped: 0,
    });
  });
});
