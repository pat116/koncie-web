import type { BookingStatus, MessageKind, MessageStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

/** A row in the admin guests list. Aggregated across the guest's bookings. */
export type AdminGuestRow = {
  guestId: string;
  email: string;
  firstName: string;
  lastName: string;
  bookingCount: number;
  nextCheckIn: Date | null;
  lastActivity: Date | null;
  claimed: boolean;
};

/** A row in the admin bookings list — union of hotel + flight bookings. */
export type AdminBookingRow =
  | {
      kind: 'hotel';
      id: string;
      guestEmail: string;
      externalRef: string;
      checkIn: Date;
      checkOut: Date;
      numGuests: number;
      status: BookingStatus;
      propertyName: string;
    }
  | {
      kind: 'flight';
      id: string;
      guestEmail: string;
      externalRef: string;
      origin: string;
      destination: string;
      departureAt: Date;
      returnAt: Date | null;
      carrier: string;
    };

/** Priority alert — database-derived feed surfaced in the admin UI. */
export type PriorityAlert = {
  id: string;
  severity: 'warning' | 'critical';
  kind:
    | 'payment_failed'
    | 'insurance_policy_failed'
    | 'insurance_quote_expiring'
    | 'unclaimed_near_arrival';
  message: string;
  guestEmail: string;
  occurredAt: Date;
};

/** Revenue KPI tile data. Currency is AUD across the MVP per Sprint 4. */
export type RevenueKpis = {
  currency: 'AUD';
  totalCapturedMinor: number;
  upsellCapturedMinor: number;
  insuranceCapturedMinor: number;
  flightCapturedMinor: number; // always 0 for MVP — Jet Seeker owns its own ledger
  guestCount: number;
  bookingsConfirmed: number;
  upsellAttachRate: number; // 0..1
  insuranceAttachRate: number; // 0..1
  flightAttachRate: number; // 0..1 — based on FlightBooking rows, not revenue
};

/**
 * Fetch guests with at least one booking at the given property.
 * Aggregates per guest so the admin sees one row even if a guest has
 * multiple bookings at this property.
 */
export async function listGuestsForProperty(
  propertyId: string,
): Promise<AdminGuestRow[]> {
  const guests = await prisma.guest.findMany({
    where: { bookings: { some: { propertyId } } },
    include: {
      bookings: {
        where: { propertyId },
        orderBy: { checkIn: 'asc' },
      },
      transactions: {
        where: { booking: { propertyId } },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return guests.map((g) => {
    const upcoming = g.bookings.find((b) => b.checkIn >= new Date());
    const lastActivity =
      g.transactions[0]?.createdAt ?? g.updatedAt ?? null;
    return {
      guestId: g.id,
      email: g.email,
      firstName: g.firstName,
      lastName: g.lastName,
      bookingCount: g.bookings.length,
      nextCheckIn: upcoming?.checkIn ?? null,
      lastActivity,
      claimed: g.claimedAt !== null,
    };
  });
}

/**
 * Union hotel + flight bookings for admin display. We join flight bookings
 * in via the guest-at-this-property relation rather than a direct FK — the
 * Koncie member-area model treats any flight the guest has ingested as
 * relevant context for the property admin (Sprint 3 addendum §2).
 */
export async function listBookingsForProperty(
  propertyId: string,
): Promise<AdminBookingRow[]> {
  const hotel = await prisma.booking.findMany({
    where: { propertyId },
    include: {
      guest: { select: { email: true } },
      property: { select: { name: true } },
    },
    orderBy: { checkIn: 'desc' },
  });

  const flights = await prisma.flightBooking.findMany({
    where: { guest: { bookings: { some: { propertyId } } } },
    include: { guest: { select: { email: true } } },
    orderBy: { departureAt: 'desc' },
  });

  const hotelRows: AdminBookingRow[] = hotel.map((b) => ({
    kind: 'hotel',
    id: b.id,
    guestEmail: b.guest.email,
    externalRef: b.externalRef,
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    numGuests: b.numGuests,
    status: b.status,
    propertyName: b.property.name,
  }));

  const flightRows: AdminBookingRow[] = flights.map((f) => ({
    kind: 'flight',
    id: f.id,
    guestEmail: f.guest.email,
    externalRef: f.externalRef,
    origin: f.origin,
    destination: f.destination,
    departureAt: f.departureAt,
    returnAt: f.returnAt,
    carrier: f.carrier,
  }));

  // Stable ordering across kinds: most-recent activity first.
  return [...hotelRows, ...flightRows].sort((a, b) => {
    const ta = a.kind === 'hotel' ? a.checkIn.getTime() : a.departureAt.getTime();
    const tb = b.kind === 'hotel' ? b.checkIn.getTime() : b.departureAt.getTime();
    return tb - ta;
  });
}

/**
 * Database-derived priority alerts. Sentry-sourced alerts can land in Phase 2
 * behind the same return shape with zero caller changes.
 *
 * Alerts are scoped to guests-with-a-booking-at-this-property so tenant
 * scoping is preserved.
 */
export async function listPriorityAlerts(
  propertyId: string,
  now: Date = new Date(),
): Promise<PriorityAlert[]> {
  const alerts: PriorityAlert[] = [];

  const guestFilter = { bookings: { some: { propertyId } } };

  // Failed payments — MCC 4722, ancillary only.
  const failedTx = await prisma.transaction.findMany({
    where: {
      status: 'failed',
      guest: guestFilter,
    },
    include: { guest: { select: { email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 25,
  });
  for (const tx of failedTx) {
    alerts.push({
      id: `tx:${tx.id}`,
      severity: 'warning',
      kind: 'payment_failed',
      message: `Upsell payment failed (${tx.failureReason ?? 'reason unknown'})`,
      guestEmail: tx.guest.email,
      occurredAt: tx.createdAt,
    });
  }

  // Failed insurance policies.
  const failedPolicies = await prisma.insurancePolicy.findMany({
    where: {
      status: 'FAILED',
      guest: guestFilter,
    },
    include: { guest: { select: { email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 25,
  });
  for (const p of failedPolicies) {
    alerts.push({
      id: `policy:${p.id}`,
      severity: 'critical',
      kind: 'insurance_policy_failed',
      message: `Insurance policy capture failed (${p.failureReason ?? 'reason unknown'})`,
      guestEmail: p.guest.email,
      occurredAt: p.createdAt,
    });
  }

  // Insurance quotes expiring in the next 72h without a policy.
  const soon = new Date(now.getTime() + 72 * 60 * 60 * 1000);
  const expiringQuotes = await prisma.insuranceQuote.findMany({
    where: {
      expiresAt: { gt: now, lt: soon },
      policy: null,
      guest: guestFilter,
    },
    include: { guest: { select: { email: true } } },
    orderBy: { expiresAt: 'asc' },
    take: 25,
  });
  for (const q of expiringQuotes) {
    alerts.push({
      id: `quote:${q.id}`,
      severity: 'warning',
      kind: 'insurance_quote_expiring',
      message: `Insurance quote (${q.tier.toLowerCase()}) expires ${q.expiresAt.toISOString()}`,
      guestEmail: q.guest.email,
      occurredAt: q.expiresAt,
    });
  }

  // Unclaimed guest <= 72h from check-in.
  const unclaimedGuests = await prisma.guest.findMany({
    where: {
      claimedAt: null,
      bookings: {
        some: { propertyId, checkIn: { gt: now, lt: soon } },
      },
    },
    include: {
      bookings: {
        where: { propertyId },
        orderBy: { checkIn: 'asc' },
        take: 1,
      },
    },
    take: 25,
  });
  for (const g of unclaimedGuests) {
    const nextBooking = g.bookings[0];
    if (!nextBooking) continue;
    alerts.push({
      id: `unclaimed:${g.id}`,
      severity: 'warning',
      kind: 'unclaimed_near_arrival',
      message: `Guest arriving ${nextBooking.checkIn.toDateString()} hasn't claimed their Koncie account`,
      guestEmail: g.email,
      occurredAt: nextBooking.checkIn,
    });
  }

  // Most recent first, critical first on ties.
  return alerts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
    return b.occurredAt.getTime() - a.occurredAt.getTime();
  });
}

/**
 * Revenue KPI tile maths.
 *
 * Attach rates use `confirmed bookings` as denominator — aligns with the
 * board-deck attach-rate definition (>5% insurance, >3% flights per
 * confirmed booking).
 *
 * Per Sprint-8 gating decision Q1 (locked 2026-04-25), flight purchase is
 * fully embedded in Koncie: flights JOIN the Koncie cart and settle through
 * Kovena's AUD merchant facility alongside tours/transfers/dining/insurance.
 * Flight revenue is therefore counted at the Koncie level — same revenue
 * surface as other ancillaries.
 */
export async function computeRevenueKpis(
  propertyId: string,
): Promise<RevenueKpis> {
  const guestFilter = { bookings: { some: { propertyId } } };

  const [
    capturedTx,
    capturedInsurance,
    guestCount,
    bookingsConfirmed,
    flightBookings,
    insurancePoliciesTotal,
  ] = await Promise.all([
    prisma.transaction.aggregate({
      _sum: { koncieFeeMinor: true, amountMinor: true },
      _count: { _all: true },
      where: { status: 'captured', booking: { propertyId } },
    }),
    prisma.insurancePolicy.aggregate({
      _sum: { koncieFeeMinor: true, amountMinor: true },
      _count: { _all: true },
      where: { status: 'ACTIVE', guest: guestFilter },
    }),
    prisma.guest.count({ where: guestFilter }),
    prisma.booking.count({ where: { propertyId, status: 'CONFIRMED' } }),
    prisma.flightBooking.count({ where: { guest: guestFilter } }),
    prisma.insurancePolicy.count({
      where: { status: 'ACTIVE', guest: guestFilter },
    }),
  ]);

  // We report Koncie's captured **fee** — the MoR commission — not gross
  // amount. Gross amount flows through the trust ledger.
  const upsellCapturedMinor = capturedTx._sum.koncieFeeMinor ?? 0;
  const insuranceCapturedMinor = capturedInsurance._sum.koncieFeeMinor ?? 0;
  const flightCapturedMinor = 0;
  const totalCapturedMinor =
    upsellCapturedMinor + insuranceCapturedMinor + flightCapturedMinor;

  const denom = Math.max(bookingsConfirmed, 1);
  return {
    currency: 'AUD',
    totalCapturedMinor,
    upsellCapturedMinor,
    insuranceCapturedMinor,
    flightCapturedMinor,
    guestCount,
    bookingsConfirmed,
    upsellAttachRate: (capturedTx._count._all ?? 0) / denom,
    insuranceAttachRate: insurancePoliciesTotal / denom,
    flightAttachRate: flightBookings / denom,
  };
}

/** A row in the admin messages list. Sprint 6 — transactional audit (email + SMS). */
export type AdminMessageRow = {
  id: string;
  createdAt: Date;
  guestEmail: string | null;
  /// Populated for SMS rows (PRE_ARRIVAL_SMS) — the E.164 destination.
  recipientPhone: string | null;
  guestName: string | null;
  kind: MessageKind;
  subject: string;
  status: MessageStatus;
  deliveredAt: Date | null;
};

/**
 * Fetch MessageLog rows relevant to this property's admin.
 *
 * Tenant scoping: a log row is "visible" to a property admin when the log's
 * guest has at least one booking at that property. Logs with no guestId
 * (hypothetical future broadcast; none in Sprint 6) are excluded.
 *
 * Ordered newest-first. Capped at `limit` rows — 100 is a reasonable
 * first-page default; pagination can come in a later sprint if the pilot
 * needs it.
 */
export async function listMessagesForProperty(
  propertyId: string,
  limit = 100,
): Promise<AdminMessageRow[]> {
  const rows = await prisma.messageLog.findMany({
    where: {
      guest: { bookings: { some: { propertyId } } },
    },
    include: {
      guest: { select: { email: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    guestEmail: r.guest?.email ?? r.recipientEmail,
    recipientPhone: r.recipientPhone,
    guestName: r.guest
      ? `${r.guest.firstName} ${r.guest.lastName}`
      : null,
    kind: r.kind,
    subject: r.subject,
    status: r.status,
    deliveredAt: r.deliveredAt,
  }));
}

/**
 * Raw upsell transactions for CSV export. Returns rows in a flat,
 * CSV-friendly shape. Tenant-scoped via `booking.propertyId`.
 */
export async function listUpsellTransactionsForCsv(propertyId: string) {
  const rows = await prisma.transaction.findMany({
    where: { booking: { propertyId } },
    include: {
      guest: { select: { email: true, firstName: true, lastName: true } },
      upsell: { select: { name: true, category: true } },
      booking: { select: { externalRef: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return rows;
}
