import crypto from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { verifyHotelLinkSignature } from './verify';

const SECRET = 'test-hotellink-webhook-secret-32chars!';

function sign(rawBody: string, timestamp: string, secret = SECRET): string {
  const hex = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex');
  return `sha256=${hex}`;
}

describe('verifyHotelLinkSignature', () => {
  const now = new Date('2026-04-24T12:00:00Z');
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const rawBody = JSON.stringify({ bookingRef: 'HL-001' });

  it('accepts a valid signature within the tolerance window', () => {
    const result = verifyHotelLinkSignature({
      secret: SECRET,
      rawBody,
      signatureHeader: sign(rawBody, timestamp),
      timestampHeader: timestamp,
      now,
    });
    expect(result).toEqual({ ok: true });
  });

  it('rejects when signed with the wrong secret', () => {
    const result = verifyHotelLinkSignature({
      secret: SECRET,
      rawBody,
      signatureHeader: sign(rawBody, timestamp, 'a-different-wrong-secret-value-here'),
      timestampHeader: timestamp,
      now,
    });
    expect(result).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects when the timestamp is outside the replay window', () => {
    const staleTimestamp = String(
      Math.floor(now.getTime() / 1000) - 6 * 60, // 6 min ago, default tolerance 5 min
    );
    const result = verifyHotelLinkSignature({
      secret: SECRET,
      rawBody,
      signatureHeader: sign(rawBody, staleTimestamp),
      timestampHeader: staleTimestamp,
      now,
    });
    expect(result).toEqual({ ok: false, reason: 'timestamp_out_of_range' });
  });

  it('rejects when required headers are missing', () => {
    const result = verifyHotelLinkSignature({
      secret: SECRET,
      rawBody,
      signatureHeader: null,
      timestampHeader: timestamp,
      now,
    });
    expect(result).toEqual({ ok: false, reason: 'missing_headers' });
  });

  it('rejects when the body has been tampered with after signing', () => {
    const result = verifyHotelLinkSignature({
      secret: SECRET,
      rawBody: rawBody + ' tampered',
      signatureHeader: sign(rawBody, timestamp),
      timestampHeader: timestamp,
      now,
    });
    expect(result).toEqual({ ok: false, reason: 'bad_signature' });
  });
});
