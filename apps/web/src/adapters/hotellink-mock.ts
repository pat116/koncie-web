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

export const hotelLinkWebhookPayloadSchema = z.object({
  bookingRef: z.string().min(1),
  propertySlug: z.string().min(1),
  guest: z.object({
    email: z.string().email(),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
  }),
  checkIn: z.string().datetime(),
  checkOut: z.string().datetime(),
  numGuests: z.number().int().min(1),
  status: z.enum(['CONFIRMED', 'CANCELLED', 'COMPLETED']),
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
