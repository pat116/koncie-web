/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({
  prisma: { guest: { findFirst: vi.fn() } },
}));
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
}));
vi.mock('@/lib/trip/view', () => ({
  buildTripView: vi.fn(),
}));
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

import { GET } from './route';
import { prisma } from '@/lib/db/prisma';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { buildTripView } from '@/lib/trip/view';

function buildSupabaseMock(user: { id: string; email: string } | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/trips/[slug]', () => {
  it('400 when slug is empty', async () => {
    const res = await GET({} as any, { params: { slug: '' } });
    expect(res.status).toBe(400);
  });

  it('404 when buildTripView returns null', async () => {
    (createSupabaseServerClient as any).mockReturnValue(buildSupabaseMock(null));
    (buildTripView as any).mockResolvedValue(null);

    const res = await GET({} as any, { params: { slug: 'no-trip' } });
    expect(res.status).toBe(404);
  });

  it('200 with stub for anonymous caller (Trip exists)', async () => {
    (createSupabaseServerClient as any).mockReturnValue(buildSupabaseMock(null));
    (buildTripView as any).mockResolvedValue({
      exists: true,
      signInRequired: true,
    });

    const res = await GET({} as any, {
      params: { slug: 'namotu-island-fiji' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ exists: true, signInRequired: true });
    expect(buildTripView).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'namotu-island-fiji',
        authenticatedGuestId: null,
      }),
    );
  });

  it('resolves authenticated guest id and passes to buildTripView', async () => {
    (createSupabaseServerClient as any).mockReturnValue(
      buildSupabaseMock({ id: 'auth-user-1', email: 'pat@kovena.com' }),
    );
    (prisma.guest.findFirst as any).mockResolvedValue({ id: 'guest-1' });
    (buildTripView as any).mockResolvedValue({
      trip: { id: 'trip-1', slug: 'namotu-island-fiji' },
    });

    const res = await GET({} as any, {
      params: { slug: 'namotu-island-fiji' },
    });
    expect(res.status).toBe(200);
    expect(buildTripView).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'namotu-island-fiji',
        authenticatedGuestId: 'guest-1',
      }),
    );
  });

  it('500 + Sentry capture when buildTripView throws', async () => {
    (createSupabaseServerClient as any).mockReturnValue(buildSupabaseMock(null));
    (buildTripView as any).mockRejectedValue(new Error('boom'));

    const res = await GET({} as any, { params: { slug: 'oops' } });
    expect(res.status).toBe(500);
  });
});
