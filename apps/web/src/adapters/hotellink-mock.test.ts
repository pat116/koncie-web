import { describe, it, expect } from 'vitest';
import {
  HotelLinkUnavailableError,
  hotelLinkWebhookPayloadSchema,
  mockHotelLinkWebhookPayload,
} from './hotellink-mock';

describe('mockHotelLinkWebhookPayload', () => {
  it('returns a payload that parses cleanly against the Zod schema', () => {
    const payload = mockHotelLinkWebhookPayload();
    const parsed = hotelLinkWebhookPayloadSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
  });

  it('deep-merges overrides including nested guest fields', () => {
    const payload = mockHotelLinkWebhookPayload({
      bookingRef: 'HL-OVERRIDE-42',
      status: 'CANCELLED',
      guest: { firstName: 'Alex' },
    });
    expect(payload.bookingRef).toBe('HL-OVERRIDE-42');
    expect(payload.status).toBe('CANCELLED');
    expect(payload.guest.firstName).toBe('Alex');
    // unchanged fields still come from the defaults
    expect(payload.guest.lastName).toBe('Demo');
    expect(payload.propertySlug).toBe('namotu-island-fiji');
  });

  it('throws HotelLinkUnavailableError for the fail-trigger email', () => {
    expect(() =>
      mockHotelLinkWebhookPayload({
        guest: { email: 'hotellink-unavailable@test.com' },
      }),
    ).toThrow(HotelLinkUnavailableError);
  });
});
