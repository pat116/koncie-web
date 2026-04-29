import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    trip: { findMany: vi.fn() },
  },
}));
vi.mock('@/lib/trip/recompute', () => ({
  recomputeTrip: vi.fn(),
}));
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

import { prisma } from '@/lib/db/prisma';
import { recomputeTrip } from '@/lib/trip/recompute';
import { GET } from './route';

const SECRET = 'test-cron-secret';

function buildRequest(authorization?: string) {
  const headers = new Headers();
  if (authorization) headers.set('authorization', authorization);
  return new Request('http://localhost/api/cron/recompute-trip-phase', { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
});

describe('GET /api/cron/recompute-trip-phase', () => {
  it('401 without authorization header', async () => {
    const res = await GET(buildRequest() as never);
    expect(res.status).toBe(401);
  });

  it('401 with wrong secret', async () => {
    const res = await GET(buildRequest('Bearer wrong') as never);
    expect(res.status).toBe(401);
  });

  it('processes ≤200 stale trips and reports counts', async () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const stale = [{ id: 't1' }, { id: 't2' }, { id: 't3' }];
    (prisma.trip.findMany as any).mockResolvedValue(stale);
    (recomputeTrip as any)
      .mockResolvedValueOnce({ changed: true })
      .mockResolvedValueOnce({ changed: false })
      .mockResolvedValueOnce({ changed: true });

    const res = await GET(buildRequest(`Bearer ${SECRET}`) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      scanned: 3,
      recomputed: 2,
      unchanged: 1,
      errors: 0,
      perTickBudget: 200,
    });
    expect(prisma.trip.findMany).toHaveBeenCalledOnce();
    const args = (prisma.trip.findMany as any).mock.calls[0][0];
    expect(args.take).toBe(200);
  });

  it('catches per-trip errors and counts them', async () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    (prisma.trip.findMany as any).mockResolvedValue([{ id: 't1' }, { id: 't2' }]);
    (recomputeTrip as any)
      .mockResolvedValueOnce({ changed: true })
      .mockRejectedValueOnce(new Error('boom'));

    const res = await GET(buildRequest(`Bearer ${SECRET}`) as never);
    const body = await res.json();
    expect(body.errors).toBe(1);
    expect(body.recomputed).toBe(1);
  });
});
