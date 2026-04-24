import { describe, it, expect } from 'vitest';
import { JetSeekerMockAdapter } from './jetseeker-mock';
import { JetSeekerUnavailableError } from '@/lib/errors/flights';

const adapter = new JetSeekerMockAdapter();

describe('JetSeekerMockAdapter.fetchBookingsForGuest', () => {
  it('returns Namotu round-trip for the seeded guest email', async () => {
    const result = await adapter.fetchBookingsForGuest('pat@kovena.com');
    expect(result).toHaveLength(1);
    const booking = result[0]!;
    expect(booking.externalRef).toBe('JS-JANE-NAMOTU-01');
    expect(booking.origin).toBe('SYD');
    expect(booking.destination).toBe('NAN');
    expect(booking.carrier).toBe('FJ');
    expect(new Date(booking.departureAt).toString()).not.toBe('Invalid Date');
    expect(booking.returnAt).not.toBeNull();
  });

  it('returns an empty array for any unknown email', async () => {
    expect(await adapter.fetchBookingsForGuest('nobody@example.com')).toEqual([]);
  });

  it('throws JetSeekerUnavailableError for the fail-trigger email', async () => {
    await expect(
      adapter.fetchBookingsForGuest('flight-unavailable@test.com'),
    ).rejects.toThrow(JetSeekerUnavailableError);
  });

  it('returns valid ISO-8601 timestamps for departureAt and returnAt', async () => {
    const [booking] = await adapter.fetchBookingsForGuest('pat@kovena.com');
    expect(booking!.departureAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(booking!.returnAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('returns exactly 2-char carrier code and 3-char airport codes', async () => {
    const [booking] = await adapter.fetchBookingsForGuest('pat@kovena.com');
    expect(booking!.carrier).toHaveLength(2);
    expect(booking!.origin).toHaveLength(3);
    expect(booking!.destination).toHaveLength(3);
  });
});
