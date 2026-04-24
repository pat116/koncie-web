/* eslint-disable @typescript-eslint/no-explicit-any */
// Exercises the input-validation + ownership checks on purchaseInsurance.
// Happy-path (redirect) is covered by the Playwright insurance.spec.ts
// because Next.js server-action redirects throw NEXT_REDIRECT and are
// awkward to unit-test directly.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/payments/provider', () => ({
  paymentProvider: {
    tokenizeCard: vi.fn(),
    chargeAndCapture: vi.fn(),
    refund: vi.fn(),
  },
}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn((url: string) => { throw new Error(`__REDIRECT__:${url}`); }) }));
vi.mock('@/lib/money', () => ({
  computeFeeSplit: vi.fn(),
  convertMinorUnits: vi.fn(),
  fxRateFor: vi.fn(),
}));

import { purchaseInsurance } from './actions';
import { prisma } from '@/lib/db/prisma';
import { PaymentValidationError } from '@/lib/errors/payments';

const validCardInput = {
  pan: '4242424242424242',
  expiryMonth: 12,
  expiryYear: 2030,
  cvc: '123',
  cardholderName: 'Pat Test',
};

describe('purchaseInsurance input validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws when neither cardInput nor savedCardId is supplied', async () => {
    await expect(
      purchaseInsurance({
        quoteId: 'q1',
        guestId: 'g1',
        saveCard: false,
      } as any),
    ).rejects.toThrow(PaymentValidationError);
  });
});

describe('purchaseInsurance ownership + state checks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws when quote does not belong to the acting guest', async () => {
    (prisma as any).insuranceQuote = {
      findUnique: vi.fn().mockResolvedValue({
        id: 'q1',
        guestId: 'OTHER-GUEST',
        expiresAt: new Date(Date.now() + 60_000),
        policy: null,
      }),
    };

    await expect(
      purchaseInsurance({
        quoteId: 'q1',
        guestId: 'g1',
        cardInput: validCardInput,
        saveCard: false,
      }),
    ).rejects.toThrow(PaymentValidationError);
  });

  it('throws when quote already has a policy (idempotency guard)', async () => {
    (prisma as any).insuranceQuote = {
      findUnique: vi.fn().mockResolvedValue({
        id: 'q1',
        guestId: 'g1',
        expiresAt: new Date(Date.now() + 60_000),
        policy: { id: 'p1' },
      }),
    };

    await expect(
      purchaseInsurance({
        quoteId: 'q1',
        guestId: 'g1',
        cardInput: validCardInput,
        saveCard: false,
      }),
    ).rejects.toThrow(/already been purchased/);
  });

  it('throws when quote has expired', async () => {
    (prisma as any).insuranceQuote = {
      findUnique: vi.fn().mockResolvedValue({
        id: 'q1',
        guestId: 'g1',
        expiresAt: new Date(Date.now() - 1_000),
        policy: null,
      }),
    };

    await expect(
      purchaseInsurance({
        quoteId: 'q1',
        guestId: 'g1',
        cardInput: validCardInput,
        saveCard: false,
      }),
    ).rejects.toThrow(/expired/);
  });
});
