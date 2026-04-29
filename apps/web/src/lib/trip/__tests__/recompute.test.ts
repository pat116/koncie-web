import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    trip: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/db/prisma';
import { recomputeTrip } from '../recompute';

const tripWithStaleFields = {
  id: 'trip-1',
  phase: 'PRE_CONFIRMATION', // stored — should flip to PRE_ARRIVAL
  completionPercent: 0,
  flightBookingId: null,
  preparationStatus: {
    documents: { status: 'PENDING' },
    health: { status: 'PENDING' },
    weather: { status: 'PENDING' },
    currency: { status: 'PENDING' },
    customs: { status: 'PENDING' },
  },
  hotelBooking: {
    status: 'CONFIRMED',
    checkIn: new Date('2026-07-15T00:00:00Z'),
    checkOut: new Date('2026-07-22T00:00:00Z'),
    property: { timezone: 'Pacific/Fiji' },
  },
  cart: { items: [] },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('recomputeTrip', () => {
  it('writes when phase changed', async () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    (prisma.trip.findUnique as any).mockResolvedValue(tripWithStaleFields);
    (prisma.trip.update as any).mockResolvedValue({});

    const out = await recomputeTrip('trip-1', {
      now: new Date('2026-06-01T00:00:00Z'),
    });

    expect(out.changed).toBe(true);
    expect(out.phase).toBe('PRE_ARRIVAL');
    expect(out.completionPercent).toBe(0);
    expect(prisma.trip.update).toHaveBeenCalledOnce();
  });

  it('is idempotent — no write when nothing changed', async () => {
    (prisma.trip.findUnique as any).mockResolvedValue({
      ...tripWithStaleFields,
      phase: 'PRE_ARRIVAL', // already matches what derive would compute
      completionPercent: 0,
    });

    const out = await recomputeTrip('trip-1', {
      now: new Date('2026-06-01T00:00:00Z'),
    });

    expect(out.changed).toBe(false);
    expect(prisma.trip.update).not.toHaveBeenCalled();
  });

  it('throws when trip not found', async () => {
    (prisma.trip.findUnique as any).mockResolvedValue(null);
    await expect(recomputeTrip('missing')).rejects.toThrow(/not found/);
  });
});
