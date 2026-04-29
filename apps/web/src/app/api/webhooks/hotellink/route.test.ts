/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ZodError } from 'zod';
import type * as IngestModule from '@/lib/hotellink/ingest';

vi.mock('@/lib/hotellink/ingest', async (importActual) => {
  const actual = (await importActual()) as typeof IngestModule;
  return {
    ...actual,
    ingestHotelLinkBooking: vi.fn(),
  };
});
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

import { POST } from './route';
import {
  ingestHotelLinkBooking,
  PropertyNotFoundError,
} from '@/lib/hotellink/ingest';
import * as Sentry from '@sentry/nextjs';

const SECRET = 'test-hotellink-webhook-secret-32chars!';

function buildRequest({
  body,
  signature,
  timestamp,
}: {
  body: string;
  signature: string | null;
  timestamp: string | null;
}): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (signature) headers.set('x-hotellink-signature', signature);
  if (timestamp) headers.set('x-hotellink-timestamp', timestamp);
  return new Request('http://localhost/api/webhooks/hotellink', {
    method: 'POST',
    body,
    headers,
  });
}

function sign(rawBody: string, timestamp: string, secret = SECRET): string {
  const hex = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex');
  return `sha256=${hex}`;
}

const VALID_PAYLOAD = {
  bookingRef: 'HL-001',
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

describe('POST /api/webhooks/hotellink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.HOTELLINK_WEBHOOK_SECRET = SECRET;
  });

  it('returns 200 with bookingId + messageLogId when signature and ingest succeed', async () => {
    (ingestHotelLinkBooking as any).mockResolvedValue({
      hotelBooking: { id: 'booking-1' },
      guest: { id: 'guest-1' },
      messageLogId: 'msg-1',
      skipped: null,
    });

    const body = JSON.stringify(VALID_PAYLOAD);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const res = await POST(
      buildRequest({
        body,
        signature: sign(body, timestamp),
        timestamp,
      }) as any,
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      ok: true,
      bookingId: 'booking-1',
      messageLogId: 'msg-1',
      skipped: null,
    });
    expect(ingestHotelLinkBooking).toHaveBeenCalledTimes(1);
  });

  it('returns 400 bad_signature when the HMAC does not verify', async () => {
    const body = JSON.stringify(VALID_PAYLOAD);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const res = await POST(
      buildRequest({
        body,
        signature: sign(body, timestamp, 'wrong-secret-32-chars-ooooo-0000'),
        timestamp,
      }) as any,
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.reason).toBe('bad_signature');
    expect(ingestHotelLinkBooking).not.toHaveBeenCalled();
  });

  it('returns 400 missing_headers when the signature header is absent', async () => {
    const body = JSON.stringify(VALID_PAYLOAD);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const res = await POST(
      buildRequest({ body, signature: null, timestamp }) as any,
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.reason).toBe('missing_headers');
  });

  it('returns 404 property_not_found when the ingest throws PropertyNotFoundError', async () => {
    (ingestHotelLinkBooking as any).mockRejectedValue(
      new PropertyNotFoundError('unknown-slug'),
    );

    const body = JSON.stringify(VALID_PAYLOAD);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const res = await POST(
      buildRequest({
        body,
        signature: sign(body, timestamp),
        timestamp,
      }) as any,
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.reason).toBe('property_not_found');
  });

  it('returns 500 ingest_failed and reports to Sentry on unexpected errors', async () => {
    (ingestHotelLinkBooking as any).mockRejectedValue(new Error('db down'));

    const body = JSON.stringify(VALID_PAYLOAD);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const res = await POST(
      buildRequest({
        body,
        signature: sign(body, timestamp),
        timestamp,
      }) as any,
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.reason).toBe('ingest_failed');
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('returns 400 invalid_payload when ingest throws ZodError', async () => {
    const zodErr = new ZodError([]);
    (ingestHotelLinkBooking as any).mockRejectedValue(zodErr);

    const body = JSON.stringify(VALID_PAYLOAD);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const res = await POST(
      buildRequest({
        body,
        signature: sign(body, timestamp),
        timestamp,
      }) as any,
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.reason).toBe('invalid_payload');
  });
});
