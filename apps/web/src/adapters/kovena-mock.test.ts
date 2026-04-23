import { describe, it, expect } from 'vitest';
import { KovenaMockAdapter } from './kovena-mock';

const adapter = new KovenaMockAdapter();

describe('KovenaMockAdapter.tokenizeCard', () => {
  it('returns VISA brand + last4 for a 4*** card', async () => {
    const result = await adapter.tokenizeCard({
      pan: '4242424242424242',
      expiryMonth: 12,
      expiryYear: 2030,
      cvc: '123',
      cardholderName: 'Jane Guest',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.brand).toBe('VISA');
      expect(result.last4).toBe('4242');
      expect(result.providerToken).toMatch(/^tok_mock_/);
    }
  });

  it('returns MASTERCARD for a 5*** card', async () => {
    const result = await adapter.tokenizeCard({
      pan: '5555555555554444',
      expiryMonth: 12,
      expiryYear: 2030,
      cvc: '123',
      cardholderName: 'Jane Guest',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.brand).toBe('MASTERCARD');
  });

  it('fails validation for expiry month 13', async () => {
    const result = await adapter.tokenizeCard({
      pan: '4242424242424242',
      expiryMonth: 13,
      expiryYear: 2030,
      cvc: '123',
      cardholderName: 'Jane Guest',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe('validation_error');
  });

  it('fails validation for past expiry year', async () => {
    const result = await adapter.tokenizeCard({
      pan: '4242424242424242',
      expiryMonth: 1,
      expiryYear: 2020,
      cvc: '123',
      cardholderName: 'Jane Guest',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe('validation_error');
  });
});

describe('KovenaMockAdapter.chargeAndCapture', () => {
  const baseInput = {
    amountMinor: 7500,
    currency: 'FJD',
    providerPayoutMinor: 6375,
    koncieFeeMinor: 1125,
    metadata: { guestId: 'g1', bookingId: 'b1', upsellId: 'u1' },
  };

  it('succeeds with a happy-path token', async () => {
    const result = await adapter.chargeAndCapture({
      ...baseInput,
      providerToken: 'tok_mock_happy_4242',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.providerPaymentRef).toMatch(/^kvn_mock_/);
      expect(result.trustLedgerExternalRef).toMatch(/^tle_/);
      expect(new Date(result.capturedAt).toString()).not.toBe('Invalid Date');
    }
  });

  it('declines for trigger card 4000000000000002 (generic decline)', async () => {
    const result = await adapter.chargeAndCapture({
      ...baseInput,
      providerToken: 'tok_mock_decline_4000000000000002',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe('card_declined');
  });

  it('declines for trigger card 4000000000009995 (insufficient funds)', async () => {
    const result = await adapter.chargeAndCapture({
      ...baseInput,
      providerToken: 'tok_mock_decline_4000000000009995',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe('insufficient_funds');
  });

  it('declines for trigger card 4000000000000127 (incorrect CVC)', async () => {
    const result = await adapter.chargeAndCapture({
      ...baseInput,
      providerToken: 'tok_mock_decline_4000000000000127',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe('incorrect_cvc');
  });

  it('rejects when fee split does not sum to amount', async () => {
    const result = await adapter.chargeAndCapture({
      ...baseInput,
      providerPayoutMinor: 6000,
      koncieFeeMinor: 1000, // 7000, not 7500
      providerToken: 'tok_mock_happy_4242',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe('validation_error');
  });
});

describe('KovenaMockAdapter.refund', () => {
  it('returns data_model_only in Sprint 2 (no ledger side-effect)', async () => {
    const result = await adapter.refund({
      providerPaymentRef: 'kvn_mock_abc',
      amountMinor: 7500,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.reason).toBe('data_model_only');
  });
});
