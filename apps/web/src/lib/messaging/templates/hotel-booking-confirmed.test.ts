import { describe, it, expect } from 'vitest';
import { hotelBookingConfirmedTemplate } from './hotel-booking-confirmed';

describe('hotelBookingConfirmedTemplate', () => {
  it('renders subject + html + text containing key vars', async () => {
    const vars = {
      firstName: 'Jane',
      propertyName: 'Namotu Island Fiji',
      checkIn: '2026-08-04T00:00:00.000Z',
      checkOut: '2026-08-11T00:00:00.000Z',
      claimLink: 'https://koncie.app/welcome?token=abc.def.ghi',
    };

    expect(hotelBookingConfirmedTemplate.id).toBe('hotel-booking-confirmed-v1');
    expect(hotelBookingConfirmedTemplate.subject(vars)).toContain(
      'Namotu Island Fiji',
    );

    const { html, text } = await hotelBookingConfirmedTemplate.render(vars);
    expect(html.length).toBeGreaterThan(100);
    expect(html).toContain('Namotu Island Fiji');
    expect(html).toContain(vars.claimLink);
    expect(text).toContain(vars.claimLink);
    expect(text).toContain('Jane');
  });
});
