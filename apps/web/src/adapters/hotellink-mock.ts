/**
 * HotelLink webhook-payload contract (mock-first).
 *
 * HotelLink is Kovena-owned, so the payload shape is defined here and the
 * real HotelLink-side emitter conforms. Sprint 7 ships the Koncie ingest
 * loop against this schema; the HotelLink-side webhook wiring is a
 * parallel ops track.
 *
 * Mirrors the Sprint 3 Jet Seeker mock-adapter pattern: a Zod schema,
 * a domain-specific Unavailable error, and a test-helper that builds
 * valid default payloads with override support.
 *
 * Supersedes the Sprint 0/1 scaffolding HotelLinkMockAdapter class —
 * ingest now happens via `lib/hotellink/ingest.ts` driven by this
 * payload shape.
 */
import { z } from 'zod';

// Sprint 7 (S7-12) extends the payload with optional enrichment fields:
// guest.address (for origin-airport inference), room descriptors, pricing
// snapshot, confirmationNumber. All optional so the existing minimal payload
// still validates — the kickoff §6 #1 "code defensively" lock applies until
// the HotelLink team confirms which fields are populated.

const addressSchema = z.object({
  country: z.string().min(2).max(60).optional().nullable(),
  stateOrRegion: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  postcode: z.string().optional().nullable(),
  line1: z.string().optional().nullable(),
  line2: z.string().optional().nullable(),
}).partial();

const roomSchema = z.object({
  name: z.string().optional().nullable(),
  code: z.string().optional().nullable(),
  bedConfig: z.string().optional().nullable(),
  view: z.string().optional().nullable(),
  sqm: z.number().int().positive().optional().nullable(),
  amenities: z.array(z.string()).optional().nullable(),
  specialFeatures: z.array(z.string()).optional().nullable(),
}).partial();

const pricingSchema = z.object({
  currency: z.string().length(3).optional().nullable(),
  pricePerNightMinor: z.number().int().nonnegative().optional().nullable(),
  subtotalMinor: z.number().int().nonnegative().optional().nullable(),
  feesTaxesMinor: z.number().int().nonnegative().optional().nullable(),
  totalPaidMinor: z.number().int().nonnegative().optional().nullable(),
}).partial();

export const hotelLinkWebhookPayloadSchema = z.object({
  bookingRef: z.string().min(1),
  propertySlug: z.string().min(1),
  guest: z.object({
    email: z.string().email(),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    // Optional address — null-tolerant downstream per kickoff §6 #1 lock.
    address: addressSchema.optional().nullable(),
  }),
  checkIn: z.string().datetime(),
  checkOut: z.string().datetime(),
  numGuests: z.number().int().min(1),
  status: z.enum(['CONFIRMED', 'CANCELLED', 'COMPLETED']),
  // Sprint 7 enrichments — all optional.
  room: roomSchema.optional().nullable(),
  pricing: pricingSchema.optional().nullable(),
  confirmationNumber: z.string().optional().nullable(),
});

export type HotelLinkWebhookPayload = z.infer<typeof hotelLinkWebhookPayloadSchema>;

/**
 * Infra-broken error for HotelLink integration failures (timeout, 5xx,
 * auth). Mirrors JetSeekerUnavailableError / CoverMoreUnavailableError.
 * Business outcomes (unknown property) are not this error.
 */
export class HotelLinkUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'HotelLinkUnavailableError';
  }
}

const FAIL_TRIGGER_EMAIL = 'hotellink-unavailable@test.com';

const DEFAULT_PAYLOAD: HotelLinkWebhookPayload = {
  bookingRef: 'HL-NAMOTU-0001',
  propertySlug: 'namotu-island-fiji',
  guest: {
    email: 'pat@kovena.com',
    firstName: 'Jane',
    lastName: 'Demo',
  },
  checkIn: '2026-08-04T00:00:00.000Z',
  checkOut: '2026-08-11T00:00:00.000Z',
  numGuests: 2,
  status: 'CONFIRMED',
};

export type MockPayloadOverrides = Partial<Omit<HotelLinkWebhookPayload, 'guest'>> & {
  guest?: Partial<HotelLinkWebhookPayload['guest']>;
};

/**
 * Builds a valid HotelLinkWebhookPayload. Deep-merges the `guest` object
 * so callers can override individual fields without restating the whole
 * nested shape.
 *
 * Throws HotelLinkUnavailableError if the resolved email matches the
 * reserved fail-trigger address — lets tests exercise the outage path
 * through the same surface real payloads flow through.
 */
export function mockHotelLinkWebhookPayload(
  overrides: MockPayloadOverrides = {},
): HotelLinkWebhookPayload {
  const { guest: guestOverrides, ...rest } = overrides;
  const merged: HotelLinkWebhookPayload = {
    ...DEFAULT_PAYLOAD,
    ...rest,
    guest: { ...DEFAULT_PAYLOAD.guest, ...guestOverrides },
  };
  if (merged.guest.email === FAIL_TRIGGER_EMAIL) {
    throw new HotelLinkUnavailableError(
      'HotelLink mock adapter simulated outage (fail-trigger email)',
    );
  }
  return merged;
}
