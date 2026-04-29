/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({
  prisma: { trip: { findUnique: vi.fn() } },
}));
vi.mock('../recompute', () => ({
  recomputeTrip: vi.fn(),
}));

import { prisma } from '@/lib/db/prisma';
import { recomputeTrip } from '../recompute';
import { buildTripView, type TripView } from '../view';

const NOW = new Date('2026-08-01T00:00:00Z');

const FULL_TRIP = {
  id: 'trip-1',
  slug: 'namotu-island-fiji',
  guestId: 'guest-1',
  flightBookingId: null,
  phase: 'PRE_ARRIVAL',
  phaseComputedAt: new Date('2026-08-01T00:00:00Z'),
  completionPercent: 30,
  preparationStatus: {
    documents: { status: 'COMPLETE', checkedAt: '2026-07-30T10:00:00Z' },
    health: { status: 'PENDING', checkedAt: null },
    weather: { status: 'NA', checkedAt: '2026-07-30T11:00:00Z' },
    currency: { status: 'PENDING', checkedAt: null },
    customs: { status: 'PENDING', checkedAt: null },
  },
  metadata: {},
  nights: 7,
  hotelBooking: {
    id: 'b-1',
    status: 'CONFIRMED',
    checkIn: new Date('2026-08-04T00:00:00Z'),
    checkOut: new Date('2026-08-11T00:00:00Z'),
    numGuests: 2,
    roomTypeName: 'Beachfront Bure',
    bedConfig: 'King',
    view: 'Ocean',
    unitSqm: 45,
    amenities: ['wifi', 'aircon'],
    specialFeatures: ['outdoor-shower'],
    pricePerNightMinor: 80000,
    totalPaidMinor: 616000,
    currency: 'FJD',
    property: {
      name: 'Namotu Island Fiji',
      country: 'FJ',
      region: 'Mamanucas',
      timezone: 'Pacific/Fiji',
      images: [
        { imageUrl: '/img/hero.jpg', isActive: true, displayOrder: 0, kind: 'HERO' },
        { imageUrl: '/img/g1.jpg', isActive: true, displayOrder: 1, kind: 'GALLERY' },
        { imageUrl: '/img/g2.jpg', isActive: true, displayOrder: 2, kind: 'GALLERY' },
        { imageUrl: '/img/inactive.jpg', isActive: false, displayOrder: 3, kind: 'GALLERY' },
      ],
    },
  },
  flightBooking: null,
  cart: { state: 'OPEN', items: [] },
  recommendations: [],
  additionalBookingLines: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildTripView', () => {
  it('returns null when slug not found', async () => {
    (prisma.trip.findUnique as any).mockResolvedValue(null);
    const view = await buildTripView({
      slug: 'no-such-trip',
      authenticatedGuestId: 'guest-1',
      now: NOW,
    });
    expect(view).toBeNull();
  });

  it('returns sign-in-required stub when caller is anonymous', async () => {
    (prisma.trip.findUnique as any).mockResolvedValue(FULL_TRIP);
    const view = await buildTripView({
      slug: 'namotu-island-fiji',
      authenticatedGuestId: null,
      now: NOW,
    });
    expect(view).toEqual({ exists: true, signInRequired: true });
  });

  it('returns sign-in-required stub when caller is a different guest', async () => {
    (prisma.trip.findUnique as any).mockResolvedValue(FULL_TRIP);
    const view = await buildTripView({
      slug: 'namotu-island-fiji',
      authenticatedGuestId: 'a-different-guest',
      now: NOW,
    });
    expect(view).toEqual({ exists: true, signInRequired: true });
  });

  it('returns full TripView for the owner', async () => {
    (prisma.trip.findUnique as any).mockResolvedValue(FULL_TRIP);
    const view = (await buildTripView({
      slug: 'namotu-island-fiji',
      authenticatedGuestId: 'guest-1',
      now: NOW,
    })) as TripView;

    expect(view).not.toBeNull();
    expect(view.trip.slug).toBe('namotu-island-fiji');
    expect(view.trip.phase).toBe('PRE_ARRIVAL');
    expect(view.property.name).toBe('Namotu Island Fiji');
    expect(view.property.timezone).toBe('Pacific/Fiji');
    expect(view.dates.nights).toBe(7);
    expect(view.dates.inStay).toBe(false);
    expect(view.accommodation.unitName).toBe('Beachfront Bure');
    expect(view.accommodation.amenities).toEqual(['wifi', 'aircon']);
    expect(view.preparation.documents.status).toBe('COMPLETE');
    expect(view.preparation.completedCount).toBe(2); // documents + weather (NA)
    expect(view.cart.state).toBe('OPEN');
    expect(view.cart.isEmpty).toBe(true);
    expect(view.flights.outbound).toBeNull();
    expect(view.recommendations).toEqual([]);
    expect(view.confirmedAncillaries).toEqual([]);
    expect(view.alerts).toEqual([]);
  });

  it('hero image picks the HERO-kind active image; gallery filters out inactive', async () => {
    (prisma.trip.findUnique as any).mockResolvedValue(FULL_TRIP);
    const view = (await buildTripView({
      slug: 'namotu-island-fiji',
      authenticatedGuestId: 'guest-1',
      now: NOW,
    })) as TripView;
    expect(view.property.heroImageUrl).toBe('/img/hero.jpg');
    expect(view.property.galleryImageUrls).toEqual(['/img/g1.jpg', '/img/g2.jpg']);
  });

  it('lazy-recomputes when phaseComputedAt is older than 1 hour', async () => {
    const stale = {
      ...FULL_TRIP,
      phaseComputedAt: new Date('2026-07-31T22:00:00Z'), // 26 hours ago
    };
    (prisma.trip.findUnique as any).mockResolvedValue(stale);
    (recomputeTrip as any).mockResolvedValue({
      tripId: 'trip-1',
      changed: true,
      phase: 'IN_STAY',
      completionPercent: 45,
    });

    const view = (await buildTripView({
      slug: 'namotu-island-fiji',
      authenticatedGuestId: 'guest-1',
      now: NOW,
    })) as TripView;

    expect(recomputeTrip).toHaveBeenCalledWith('trip-1', { now: NOW });
    expect(view.trip.phase).toBe('IN_STAY');
    expect(view.trip.completionPercent).toBe(45);
  });

  it('does NOT recompute when phaseComputedAt is fresh', async () => {
    (prisma.trip.findUnique as any).mockResolvedValue(FULL_TRIP);
    await buildTripView({
      slug: 'namotu-island-fiji',
      authenticatedGuestId: 'guest-1',
      now: NOW,
    });
    expect(recomputeTrip).not.toHaveBeenCalled();
  });

  it('emits FLIGHT_TIME_CHANGED alert when outbound has TIME_CHANGED status', async () => {
    (prisma.trip.findUnique as any).mockResolvedValue({
      ...FULL_TRIP,
      flightBookingId: 'fb-1',
      flightBooking: {
        carrier: 'FJ',
        externalRef: 'NAMOTU-FJ-001',
        origin: 'SYD',
        destination: 'NAN',
        departureAt: new Date('2026-08-04T11:30:00Z'),
        returnAt: null,
        outboundFlightNumber: 'FJ911',
        outboundStatus: 'TIME_CHANGED',
        outboundOriginalDepartureAt: new Date('2026-08-04T08:00:00Z'),
        outboundChangeReason: 'schedule_change',
        outboundGate: null,
        outboundTerminal: null,
        returnStatus: null,
        pnr: 'PNR-XYZ',
      },
    });
    const view = (await buildTripView({
      slug: 'namotu-island-fiji',
      authenticatedGuestId: 'guest-1',
      now: NOW,
    })) as TripView;
    expect(view.alerts.some((a) => a.kind === 'FLIGHT_TIME_CHANGED')).toBe(true);
    expect(view.flights.outbound?.status).toBe('TIME_CHANGED');
    expect(view.flights.outbound?.timeChangeDeltaMinutes).toBe(210); // 3.5h
  });
});
