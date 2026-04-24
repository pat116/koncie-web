// Mocking Prisma's generated client types in tests is intentionally loose —
// we'd otherwise have to re-declare every model-method signature the tests
// touch, which mocks are designed to avoid. `any` is the pragmatic shape
// here; the real production code paths are fully typed.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/payments/provider', () => ({ paymentProvider: {} }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { purchaseUpsell } from './actions';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { paymentProvider } from '@/lib/payments/provider';

describe('purchaseUpsell input validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects missing upsellId', async () => {
    await expect(
      purchaseUpsell({
        upsellId: '',
        guestId: 'g1',
        bookingId: 'b1',
        cardInput: { pan: '4242424242424242', expiryMonth: 12, expiryYear: 2030, cvc: '123', cardholderName: 'Jane' },
        saveCard: false,
      }),
    ).rejects.toThrow(/upsellId/i);
  });

  it('rejects PAN shorter than 12 digits', async () => {
    await expect(
      purchaseUpsell({
        upsellId: 'u1',
        guestId: 'g1',
        bookingId: 'b1',
        cardInput: { pan: '4242', expiryMonth: 12, expiryYear: 2030, cvc: '123', cardholderName: 'Jane' },
        saveCard: false,
      }),
    ).rejects.toThrow(/card number/i);
  });
});

describe('purchaseUpsell happy path', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tokenizes, charges, and writes Transaction + TrustLedgerEntry atomically', async () => {
    (prisma as any).upsell = {
      findUnique: vi.fn().mockResolvedValue({
        id: 'u1',
        propertyId: 'p1',
        priceMinor: 7500,
        priceCurrency: 'FJD',
        providerPayoutPct: '85.00',
      }),
    };
    (prisma as any).booking = {
      findUnique: vi.fn().mockResolvedValue({ id: 'b1', guestId: 'g1', propertyId: 'p1' }),
    };
    const txRun = vi.fn().mockImplementation(async (cb) => cb(prisma));
    (prisma as any).$transaction = txRun;
    (prisma as any).trustLedgerEntry = { create: vi.fn().mockResolvedValue({ id: 'tle-uuid' }) };
    (prisma as any).transaction = { create: vi.fn().mockResolvedValue({ id: 'tx-uuid' }) };
    (prisma as any).savedCard = { create: vi.fn() };

    (paymentProvider as any).tokenizeCard = vi.fn().mockResolvedValue({
      success: true,
      providerToken: 'tok_mock_happy_4242',
      brand: 'VISA',
      last4: '4242',
    });
    (paymentProvider as any).chargeAndCapture = vi.fn().mockResolvedValue({
      success: true,
      providerPaymentRef: 'kvn_mock_abc',
      trustLedgerExternalRef: 'tle_abc',
      capturedAt: new Date().toISOString(),
    });

    await purchaseUpsell({
      upsellId: 'u1',
      guestId: 'g1',
      bookingId: 'b1',
      cardInput: {
        pan: '4242424242424242',
        expiryMonth: 12,
        expiryYear: 2030,
        cvc: '123',
        cardholderName: 'Jane Guest',
      },
      saveCard: false,
    });

    expect((prisma as any).trustLedgerEntry.create).toHaveBeenCalledTimes(1);
    expect((prisma as any).transaction.create).toHaveBeenCalledTimes(1);
    const txCall = (prisma as any).transaction.create.mock.calls[0][0];
    expect(txCall.data.mcc).toBe('4722');
    expect(txCall.data.amountMinor).toBe(7500);
    expect(txCall.data.providerPayoutMinor + txCall.data.koncieFeeMinor).toBe(7500);
    expect(txCall.data.currency).toBe('FJD');
    expect(txCall.data.guestDisplayCurrency).toBe('AUD');
    expect(redirect).toHaveBeenCalledWith(expect.stringContaining('/hub/checkout/success'));
  });
});

describe('purchaseUpsell decline path', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes failed Transaction without ledger and redirects to /failed', async () => {
    (prisma as any).upsell = {
      findUnique: vi.fn().mockResolvedValue({
        id: 'u1',
        propertyId: 'p1',
        priceMinor: 7500,
        priceCurrency: 'FJD',
        providerPayoutPct: '85.00',
      }),
    };
    (prisma as any).booking = {
      findUnique: vi.fn().mockResolvedValue({ id: 'b1', guestId: 'g1', propertyId: 'p1' }),
    };
    (prisma as any).$transaction = vi.fn();
    (prisma as any).trustLedgerEntry = { create: vi.fn() };
    (prisma as any).transaction = { create: vi.fn().mockResolvedValue({ id: 'tx-fail-uuid' }) };

    (paymentProvider as any).tokenizeCard = vi.fn().mockResolvedValue({
      success: true,
      providerToken: 'tok_mock_decline_4000000000000002',
      brand: 'VISA',
      last4: '0002',
    });
    (paymentProvider as any).chargeAndCapture = vi.fn().mockResolvedValue({
      success: false,
      reason: 'card_declined',
      message: 'Your card was declined.',
    });

    await purchaseUpsell({
      upsellId: 'u1',
      guestId: 'g1',
      bookingId: 'b1',
      cardInput: {
        pan: '4000000000000002',
        expiryMonth: 12,
        expiryYear: 2030,
        cvc: '123',
        cardholderName: 'Jane',
      },
      saveCard: false,
    });

    expect((prisma as any).transaction.create).toHaveBeenCalledTimes(1);
    const createCall = (prisma as any).transaction.create.mock.calls[0][0];
    expect(createCall.data.status).toBe('failed');
    expect(createCall.data.failureReason).toMatch(/card_declined/);
    expect((prisma as any).trustLedgerEntry.create).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith(expect.stringContaining('/hub/checkout/failed'));
  });
});
