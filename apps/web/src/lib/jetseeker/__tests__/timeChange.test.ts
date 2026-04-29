/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));

const { createNotificationMock } = vi.hoisted(() => ({
  createNotificationMock: vi.fn(),
}));
vi.mock('@/lib/notifications/service', () => ({
  createFlightTimeChangedNotification: createNotificationMock,
}));

import {
  applyJetSeekerTimeChange,
  verifyJetSeekerSignature,
  timeChangePayloadSchema,
  type TimeChangePayload,
} from '../timeChange';
import { signMockBody, namotuSeedPayload } from './mockEmitter';
import { prisma } from '@/lib/db/prisma';

const SECRET = 'unit-test-jetseeker-secret-must-be-32-chars-or-more';

beforeEach(() => {
  vi.clearAllMocks();
  (prisma as any).guest = { findUnique: vi.fn() };
  (prisma as any).flightBooking = { findFirst: vi.fn() };
  (prisma as any).hotelBooking = { findFirst: vi.fn() };
  createNotificationMock.mockResolvedValue(true);
});

describe('verifyJetSeekerSignature', () => {
  it('accepts a correctly-signed body', () => {
    const body = '{"hello":"world"}';
    const sig = signMockBody(body, SECRET);
    expect(
      verifyJetSeekerSignature({
        rawBody: body,
        signatureHeader: sig,
        secret: SECRET,
      }),
    ).toBe(true);
  });

  it('rejects a tampered body', () => {
    const body = '{"hello":"world"}';
    const sig = signMockBody(body, SECRET);
    expect(
      verifyJetSeekerSignature({
        rawBody: body + 'x',
        signatureHeader: sig,
        secret: SECRET,
      }),
    ).toBe(false);
  });

  it('rejects a missing signature header', () => {
    expect(
      verifyJetSeekerSignature({
        rawBody: 'x',
        signatureHeader: null,
        secret: SECRET,
      }),
    ).toBe(false);
  });
});

describe('timeChangePayloadSchema', () => {
  it('parses a representative Namotu payload', () => {
    const payload = namotuSeedPayload();
    const r = timeChangePayloadSchema.safeParse(payload);
    expect(r.success).toBe(true);
  });

  it('rejects an unrelated event name', () => {
    const r = timeChangePayloadSchema.safeParse({
      event: 'flight.cancelled',
      occurred_at: '2026-04-25T03:00:00Z',
      flight_booking: namotuSeedPayload().flight_booking,
    });
    expect(r.success).toBe(false);
  });
});

describe('applyJetSeekerTimeChange', () => {
  const payload: TimeChangePayload = namotuSeedPayload();

  it('queues when the guest email is unknown', async () => {
    (prisma as any).guest.findUnique.mockResolvedValue(null);
    const r = await applyJetSeekerTimeChange(payload);
    expect(r).toEqual({ kind: 'queued', reason: 'unknown_pnr_or_email' });
  });

  it('queues when no FlightBooking matches the PNR', async () => {
    (prisma as any).guest.findUnique.mockResolvedValue({ id: 'g1' });
    (prisma as any).flightBooking.findFirst.mockResolvedValue(null);
    const r = await applyJetSeekerTimeChange(payload);
    expect(r.kind).toBe('queued');
  });

  it('queues when the guest has no CONFIRMED booking', async () => {
    (prisma as any).guest.findUnique.mockResolvedValue({ id: 'g1' });
    (prisma as any).flightBooking.findFirst.mockResolvedValue({
      id: 'f1',
      guestId: 'g1',
      externalRef: 'NAMOTU-FJ-001',
      carrier: 'FJ',
    });
    (prisma as any).hotelBooking.findFirst.mockResolvedValue(null);
    const r = await applyJetSeekerTimeChange(payload);
    expect(r.kind).toBe('queued');
  });

  it('emits a FLIGHT_TIME_CHANGED notification on resolution', async () => {
    (prisma as any).guest.findUnique.mockResolvedValue({ id: 'g1' });
    (prisma as any).flightBooking.findFirst.mockResolvedValue({
      id: 'f1',
      guestId: 'g1',
      externalRef: 'NAMOTU-FJ-001',
      carrier: 'FJ',
    });
    (prisma as any).hotelBooking.findFirst.mockResolvedValue({
      id: 'b1',
      guestId: 'g1',
      status: 'CONFIRMED',
    });

    const r = await applyJetSeekerTimeChange(payload);
    expect(r).toMatchObject({ kind: 'notified', notificationCreated: true });

    expect(createNotificationMock).toHaveBeenCalledTimes(1);
    const arg = createNotificationMock.mock.calls[0]![0];
    expect(arg.providerEventKey).toBe(
      `${payload.flight_booking.jetseeker_order_id}:${payload.occurred_at}`,
    );
    expect(arg.oldDepartureLocal).toBe(payload.flight_booking.old_departure_local);
    expect(arg.newDepartureLocal).toBe(payload.flight_booking.new_departure_local);
  });

  it('idempotency surfaced via service-level dedupe — repeat returns notificationCreated=false', async () => {
    (prisma as any).guest.findUnique.mockResolvedValue({ id: 'g1' });
    (prisma as any).flightBooking.findFirst.mockResolvedValue({
      id: 'f1',
      guestId: 'g1',
      externalRef: 'NAMOTU-FJ-001',
      carrier: 'FJ',
    });
    (prisma as any).hotelBooking.findFirst.mockResolvedValue({
      id: 'b1',
      guestId: 'g1',
      status: 'CONFIRMED',
    });
    createNotificationMock.mockResolvedValue(false);

    const r = await applyJetSeekerTimeChange(payload);
    expect(r).toMatchObject({ kind: 'notified', notificationCreated: false });
  });
});
