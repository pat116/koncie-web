/**
 * Sprint 7 — TripView projection (S7-13).
 *
 * Server-side read-only projection consumed by `GET /api/trips/{slug}` and
 * eventually by `/trip-itinerary/{slug}` (Sprint 8 frontend). Spec doc §6.1
 * defines the canonical shape; this module is the canonical mapping.
 *
 * Auth contract (spec doc §8.5): a slug is guessable, so we can't trust it
 * for auth. Always check `Trip.guestId === authUserId` (resolved via the
 * Supabase session). Mismatches and unauthenticated callers get the thin
 * "this trip exists, sign in to view" stub — never the full projection.
 *
 * Lazy-recompute: if `Trip.phaseComputedAt` is older than 1 hour AND a
 * phase boundary may have crossed, run S7-10's `recomputeTrip` before
 * projecting. The cron is the safety-net; this is the read-time edge.
 */

import { prisma } from '@/lib/db/prisma';
import { recomputeTrip } from './recompute';
import { computePrepCompletion, computeCartCompletion, computeFlightCompletion } from './completion';

const ONE_HOUR_MS = 60 * 60 * 1000;

/** Spec doc §6.1 result shapes. Permissive at the type level — Sprint 8 may
 *  tighten as the frontend consumes specific fields. */
export type TripViewStub = { exists: true; signInRequired: true };
export type TripViewMissing = null;

export interface TripView {
  trip: {
    id: string;
    slug: string;
    phase: string;
    completionPercent: number;
    completionDrivers: {
      prepPct: number;
      cartPct: number;
      flightPct: number;
      weighting: { prep: 0.5; cart: 0.3; flight: 0.2 };
    };
  };
  property: {
    name: string;
    country: string;
    locationLabel: string;
    heroImageUrl: string | null;
    galleryImageUrls: string[];
    timezone: string;
  };
  dates: {
    start: string;
    end: string;
    nights: number;
    daysUntilCheckIn: number;
    inStay: boolean;
    daysSinceCheckOut: number;
  };
  accommodation: {
    unitName: string | null;
    bedConfig: string | null;
    view: string | null;
    sqm: number | null;
    numGuests: number;
    pricing: {
      perNightMinor: number | null;
      totalMinor: number | null;
      currency: string | null;
    };
    amenities: string[];
    specialFeatures: string[];
  };
  flights: {
    outbound: FlightCard | null;
    return: FlightCard | null;
  };
  preparation: {
    documents: { status: string; checkedAt: string | null };
    health: { status: string; checkedAt: string | null };
    weather: { status: string; checkedAt: string | null };
    currency: { status: string; checkedAt: string | null };
    customs: { status: string; checkedAt: string | null };
    completedCount: number;
    totalCount: 5;
  };
  cart: {
    state: string;
    items: CartItemView[];
    subtotalsByCurrency: Array<{ currency: string; minor: number }>;
    isEmpty: boolean;
  };
  confirmedAncillaries: AdditionalBookingLineView[];
  paymentSummary: {
    resortTotalMinor: number | null;
    resortCurrency: string | null;
    addonTotalsByCurrency: Array<{ currency: string; minor: number }>;
    morProtected: true;
  };
  recommendations: RecommendationView[];
  alerts: TripAlert[];
}

export interface FlightCard {
  carrier: string;
  flightNo: string | null;
  routeIata: string;
  date: string | null;
  gate: string | null;
  terminal: string | null;
  departureTime: string | null;
  status: string;
  originalDepartureTime?: string;
  timeChangeDeltaMinutes?: number;
  changeReason?: string;
  pnr: string | null;
}

export interface CartItemView {
  id: string;
  kind: string;
  provider: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  qty: number;
  sourceCurrency: string;
  sourceAmountMinor: number;
  displayAmountAudMinor: number;
  scheduledAt: string | null;
}

export interface AdditionalBookingLineView {
  id: string;
  kind: string;
  provider: string;
  title: string;
  amountMinor: number;
  currency: string;
  scheduledAt: string | null;
  status: string;
}

export interface RecommendationView {
  id: string;
  kind: string;
  title: string;
  imageUrl: string | null;
  priceTier: string | null;
  priceFromMinor: number | null;
  currency: string | null;
}

export interface TripAlert {
  kind: string;
  body: string;
}

export interface BuildTripViewInput {
  slug: string;
  /** The authenticated guest's id (Prisma Guest.id), or null if anonymous. */
  authenticatedGuestId: string | null;
  /** Injectable for tests. Defaults to new Date() at call. */
  now?: Date;
}

/**
 * Resolve a Trip by slug and project to TripView.
 *
 * - Returns `null` when no Trip with that slug exists (caller → 404).
 * - Returns `{ exists: true, signInRequired: true }` when the Trip exists
 *   but the requester isn't its owner (anonymous OR a different signed-in
 *   guest). Caller → 200 with stub body.
 * - Returns the full TripView when the requester is the owner.
 */
export async function buildTripView(
  input: BuildTripViewInput,
): Promise<TripView | TripViewStub | TripViewMissing> {
  const { slug, authenticatedGuestId } = input;

  const trip = await prisma.trip.findUnique({
    where: { slug },
    include: {
      hotelBooking: {
        include: { property: { include: { images: true } } },
      },
      flightBooking: true,
      cart: { include: { items: true } },
      recommendations: true,
      additionalBookingLines: true,
    },
  });

  if (!trip) return null;

  // Auth gate — owner only.
  if (!authenticatedGuestId || trip.guestId !== authenticatedGuestId) {
    return { exists: true, signInRequired: true };
  }

  const now = input.now ?? new Date();

  // Lazy recompute: if phaseComputedAt is older than 1 hour AND a boundary
  // may have moved, refresh in-band. The cron is the safety net for the
  // common case where boundaries don't shift between writes.
  const phaseStale =
    trip.phaseComputedAt &&
    now.getTime() - new Date(trip.phaseComputedAt).getTime() > ONE_HOUR_MS;

  if (phaseStale) {
    const refreshed = await recomputeTrip(trip.id, { now });
    // Mutate in place — refreshed values flow into projection below.
    trip.phase = refreshed.phase;
    trip.completionPercent = refreshed.completionPercent;
    trip.phaseComputedAt = now;
  }

  return projectTripView({ trip, now });
}

interface ProjectInput {
  trip: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  now: Date;
}

function projectTripView({ trip, now }: ProjectInput): TripView {
  const hb = trip.hotelBooking;
  const property = hb.property;
  const fb = trip.flightBooking;
  const cart = trip.cart;
  const items = (cart?.items ?? []) as Array<{ kind: string; sourceCurrency: string; sourceAmountMinor: number }>;

  const start = hb.checkIn instanceof Date ? hb.checkIn : new Date(hb.checkIn);
  const end = hb.checkOut instanceof Date ? hb.checkOut : new Date(hb.checkOut);
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysUntilCheckIn = Math.ceil(
    (start.getTime() - now.getTime()) / msPerDay,
  );
  const daysSinceCheckOut = Math.ceil(
    (now.getTime() - end.getTime()) / msPerDay,
  );

  // PropertyImage filtering — sidecar table per kickoff §12.3 lock.
  const activeImages = ((property.images ?? []) as Array<{
    imageUrl: string;
    isActive: boolean;
    displayOrder: number;
    kind: string;
  }>)
    .filter((img) => img.isActive)
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const heroImage =
    activeImages.find((img) => img.kind === 'HERO') ?? activeImages[0] ?? null;
  const galleryImageUrls = activeImages
    .filter((img) => img.kind !== 'HERO')
    .map((img) => img.imageUrl);

  // Completion drivers — recompute the components for diagnostic display.
  const prepPct = computePrepCompletion(trip.preparationStatus);
  const cartPct = computeCartCompletion(cart);
  const flightPct = computeFlightCompletion(trip.flightBookingId, cart);

  // Subtotal by source currency (display-time bucketing for the right rail).
  const subtotalsByCurrency = bucketByCurrency(items);

  const prep = (trip.preparationStatus ?? {}) as Record<
    string,
    { status?: string; checkedAt?: string | null } | undefined
  >;
  const stepView = (key: string) => ({
    status: prep[key]?.status ?? 'PENDING',
    checkedAt: prep[key]?.checkedAt ?? null,
  });
  const completedCount = ['documents', 'health', 'weather', 'currency', 'customs'].filter(
    (k) => prep[k]?.status === 'COMPLETE' || prep[k]?.status === 'NA',
  ).length;

  return {
    trip: {
      id: trip.id,
      slug: trip.slug,
      phase: trip.phase,
      completionPercent: trip.completionPercent,
      completionDrivers: {
        prepPct,
        cartPct,
        flightPct,
        weighting: { prep: 0.5, cart: 0.3, flight: 0.2 },
      },
    },
    property: {
      name: property.name,
      country: property.country,
      locationLabel: `${property.region ?? property.country}`,
      heroImageUrl: heroImage?.imageUrl ?? null,
      galleryImageUrls,
      timezone: property.timezone,
    },
    dates: {
      start: start.toISOString(),
      end: end.toISOString(),
      nights: trip.nights ?? Math.round((end.getTime() - start.getTime()) / msPerDay),
      daysUntilCheckIn,
      inStay: trip.phase === 'IN_STAY',
      daysSinceCheckOut,
    },
    accommodation: {
      unitName: hb.roomTypeName ?? null,
      bedConfig: hb.bedConfig ?? null,
      view: hb.view ?? null,
      sqm: hb.unitSqm ?? null,
      numGuests: hb.numGuests,
      pricing: {
        perNightMinor: hb.pricePerNightMinor ?? null,
        totalMinor: hb.totalPaidMinor ?? null,
        currency: hb.currency ?? null,
      },
      amenities: hb.amenities ?? [],
      specialFeatures: hb.specialFeatures ?? [],
    },
    flights: {
      outbound: fb ? mapFlightCard(fb, 'outbound') : null,
      return: fb && fb.returnAt ? mapFlightCard(fb, 'return') : null,
    },
    preparation: {
      documents: stepView('documents'),
      health: stepView('health'),
      weather: stepView('weather'),
      currency: stepView('currency'),
      customs: stepView('customs'),
      completedCount,
      totalCount: 5,
    },
    cart: {
      state: cart?.state ?? 'OPEN',
      items: items.map((it: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        id: it.id,
        kind: it.kind,
        provider: it.provider,
        title: it.title,
        description: it.description ?? null,
        imageUrl: it.imageUrl ?? null,
        qty: it.qty,
        sourceCurrency: it.sourceCurrency,
        sourceAmountMinor: it.sourceAmountMinor,
        displayAmountAudMinor: it.displayAmountAudMinor,
        scheduledAt: it.scheduledAt
          ? new Date(it.scheduledAt).toISOString()
          : null,
      })),
      subtotalsByCurrency,
      isEmpty: items.length === 0,
    },
    // Sprint 7: empty arrays. Sprint 8 populates confirmedAncillaries on
    // checkout commit. Sprint 9 populates recommendations.
    confirmedAncillaries: ((trip.additionalBookingLines ?? []) as Array<any>).map( // eslint-disable-line @typescript-eslint/no-explicit-any
      (abl) => ({
        id: abl.id,
        kind: abl.kind,
        provider: abl.provider,
        title: abl.title,
        amountMinor: abl.amountMinor,
        currency: abl.currency,
        scheduledAt: abl.scheduledAt
          ? new Date(abl.scheduledAt).toISOString()
          : null,
        status: abl.status,
      }),
    ),
    paymentSummary: {
      resortTotalMinor: hb.totalPaidMinor ?? null,
      resortCurrency: hb.currency ?? null,
      addonTotalsByCurrency: subtotalsByCurrency,
      morProtected: true,
    },
    recommendations: ((trip.recommendations ?? []) as Array<any>).map( // eslint-disable-line @typescript-eslint/no-explicit-any
      (r) => ({
        id: r.id,
        kind: r.kind,
        title: r.title,
        imageUrl: r.imageUrl ?? null,
        priceTier: r.priceTier ?? null,
        priceFromMinor: r.priceFromMinor ?? null,
        currency: r.currency ?? null,
      }),
    ),
    alerts: buildAlerts({ flightBooking: fb }),
  };
}

function bucketByCurrency(
  items: Array<{ sourceCurrency: string; sourceAmountMinor: number }>,
): Array<{ currency: string; minor: number }> {
  const m = new Map<string, number>();
  for (const it of items) {
    m.set(it.sourceCurrency, (m.get(it.sourceCurrency) ?? 0) + it.sourceAmountMinor);
  }
  return Array.from(m, ([currency, minor]) => ({ currency, minor }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapFlightCard(fb: any, leg: 'outbound' | 'return'): FlightCard {
  const dep = leg === 'outbound' ? fb.departureAt : fb.returnAt;
  const status = leg === 'outbound' ? fb.outboundStatus : fb.returnStatus;
  const flightNo =
    leg === 'outbound' ? fb.outboundFlightNumber : fb.returnFlightNumber;
  const gate = leg === 'outbound' ? fb.outboundGate : fb.returnGate;
  const terminal = leg === 'outbound' ? fb.outboundTerminal : fb.returnTerminal;
  const original =
    leg === 'outbound'
      ? fb.outboundOriginalDepartureAt
      : fb.returnOriginalDepartureAt;
  const reason =
    leg === 'outbound' ? fb.outboundChangeReason : fb.returnChangeReason;

  let timeChangeDeltaMinutes: number | undefined;
  if (original && dep) {
    timeChangeDeltaMinutes = Math.round(
      (new Date(dep).getTime() - new Date(original).getTime()) / 60000,
    );
  }

  return {
    carrier: fb.carrier,
    flightNo: flightNo ?? null,
    routeIata: `${fb.origin}-${fb.destination}`,
    date: dep ? new Date(dep).toISOString().slice(0, 10) : null,
    gate: gate ?? null,
    terminal: terminal ?? null,
    departureTime: dep ? new Date(dep).toISOString() : null,
    status: status ?? 'CONFIRMED',
    ...(original ? { originalDepartureTime: new Date(original).toISOString() } : {}),
    ...(timeChangeDeltaMinutes !== undefined ? { timeChangeDeltaMinutes } : {}),
    ...(reason ? { changeReason: reason } : {}),
    pnr: fb.pnr ?? null,
  };
}

function buildAlerts({
  flightBooking,
}: {
  flightBooking: { outboundStatus?: string; returnStatus?: string } | null;
}): TripAlert[] {
  const alerts: TripAlert[] = [];
  if (flightBooking?.outboundStatus === 'TIME_CHANGED') {
    alerts.push({
      kind: 'FLIGHT_TIME_CHANGED',
      body: 'Your outbound flight time has changed.',
    });
  }
  if (flightBooking?.returnStatus === 'TIME_CHANGED') {
    alerts.push({
      kind: 'FLIGHT_TIME_CHANGED',
      body: 'Your return flight time has changed.',
    });
  }
  return alerts;
}
