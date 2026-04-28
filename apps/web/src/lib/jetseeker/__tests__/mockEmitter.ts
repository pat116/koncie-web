/**
 * Mock emitter for the JetSeeker time-change webhook (Sprint-6
 * completion §3.S6-08). Lets the Sprint-6 checkpoint test exercise the
 * end-to-end pipeline without a live JetSeeker emitter.
 *
 * Usage in tests/runbook smokes:
 *   import { emitMockTimeChange } from '...mockEmitter';
 *   const res = await emitMockTimeChange({
 *     baseUrl: 'http://localhost:3000',
 *     secret: process.env.KONCIE_JETSEEKER_WEBHOOK_SECRET!,
 *     payload: { ... },
 *   });
 *
 * Live emitter wires up in Sprint-7 broader data-model push.
 */

import * as crypto from 'crypto';

export type MockTimeChangePayload = {
  event: 'flight.time_changed';
  occurred_at: string;
  flight_booking: {
    jetseeker_order_id: number | string;
    guest_email: string;
    pnr: string;
    carrier: string;
    old_departure_local: string;
    new_departure_local: string;
    old_arrival_local?: string;
    new_arrival_local?: string;
    reason_code?: string;
  };
};

export function signMockBody(rawBody: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

export async function emitMockTimeChange(input: {
  baseUrl: string;
  secret: string;
  payload: MockTimeChangePayload;
}): Promise<Response> {
  const rawBody = JSON.stringify(input.payload);
  const signature = signMockBody(rawBody, input.secret);
  return fetch(`${input.baseUrl}/api/webhooks/jetseeker/time-change`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-jetseeker-signature': signature,
    },
    body: rawBody,
  });
}

/** Build a representative payload for the Namotu seed booking. */
export function namotuSeedPayload(overrides: Partial<MockTimeChangePayload['flight_booking']> = {}): MockTimeChangePayload {
  return {
    event: 'flight.time_changed',
    occurred_at: new Date().toISOString(),
    flight_booking: {
      jetseeker_order_id: 123456,
      guest_email: 'pat@kovena.com',
      pnr: 'NAMOTU-FJ-001',
      carrier: 'FJ',
      old_departure_local: '2026-07-15T08:00:00',
      new_departure_local: '2026-07-15T11:30:00',
      old_arrival_local: '2026-07-15T11:00:00',
      new_arrival_local: '2026-07-15T14:30:00',
      reason_code: 'schedule_change',
      ...overrides,
    },
  };
}
