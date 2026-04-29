'use server';

import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { ulid } from 'ulid';
import { prisma } from '@/lib/db/prisma';
import { paymentProvider } from '@/lib/payments/provider';
import { computeFeeSplit, convertMinorUnits, fxRateFor } from '@/lib/money';
import {
  PaymentConfigurationError,
  PaymentDeclinedError,
  PaymentValidationError,
} from '@/lib/errors/payments';
import type { PaymentFailureReason } from '@koncie/types';

const InputSchema = z.object({
  upsellId: z.string().min(1, 'upsellId is required'),
  guestId: z.string().min(1),
  bookingId: z.string().min(1),
  savedCardId: z.string().optional(),
  cardInput: z
    .object({
      pan: z.string().min(12, 'card number must be at least 12 digits').max(19),
      expiryMonth: z.number().int().min(1).max(12),
      expiryYear: z.number().int().min(2000).max(2100),
      cvc: z.string().min(3).max(4),
      cardholderName: z.string().min(1),
    })
    .optional(),
  saveCard: z.boolean(),
});

export type PurchaseInput = z.infer<typeof InputSchema>;

export async function purchaseUpsell(raw: PurchaseInput): Promise<void> {
  const input = InputSchema.parse(raw);

  if (!input.cardInput && !input.savedCardId) {
    throw new PaymentValidationError('Either cardInput or savedCardId is required');
  }

  // 1. Load domain context + verify guest owns this booking and upsell is active.
  const booking = await prisma.hotelBooking.findUnique({ where: { id: input.bookingId } });
  if (!booking || booking.guestId !== input.guestId) {
    throw new PaymentValidationError('HotelBooking not found or not owned by this guest');
  }

  const upsell = await prisma.upsell.findUnique({ where: { id: input.upsellId } });
  if (!upsell || upsell.propertyId !== booking.propertyId) {
    throw new PaymentValidationError('Upsell not available for this booking');
  }

  // 2. Resolve the provider token — new card or saved card.
  let providerToken: string;
  let cardBrandForSave: string | null = null;
  let cardLast4ForSave: string | null = null;

  if (input.savedCardId) {
    const saved = await prisma.savedCard.findUnique({ where: { id: input.savedCardId } });
    if (!saved || saved.guestId !== input.guestId) {
      throw new PaymentValidationError('Saved card not found');
    }
    providerToken = saved.providerToken;
  } else {
    if (!input.cardInput) throw new PaymentValidationError('cardInput required');
    const tokenResult = await paymentProvider.tokenizeCard(input.cardInput);
    if (!tokenResult.success) {
      throw new PaymentDeclinedError(tokenResult.reason, tokenResult.message);
    }
    providerToken = tokenResult.providerToken;
    cardBrandForSave = tokenResult.brand;
    cardLast4ForSave = tokenResult.last4;
  }

  // 3. Compute amounts + fee split.
  const amountMinor = upsell.priceMinor;
  const currency = upsell.priceCurrency;
  const guestDisplayCurrency = 'AUD'; // Sprint 2 decision: pilot cohort is Aus/NZ
  const guestDisplayAmountMinor = convertMinorUnits({
    amountMinor,
    from: currency,
    to: guestDisplayCurrency,
  });
  const { providerPayoutMinor, koncieFeeMinor } = computeFeeSplit({
    amountMinor,
    providerPayoutPct: upsell.providerPayoutPct.toString(),
  });

  // 4. Charge Kovena mock.
  const charge = await paymentProvider.chargeAndCapture({
    amountMinor,
    currency,
    providerPayoutMinor,
    koncieFeeMinor,
    providerToken,
    metadata: { guestId: input.guestId, bookingId: input.bookingId, upsellId: input.upsellId },
  });

  if (!charge.success) {
    // Record the failed transaction row (no ledger entry; status=failed).
    await prisma.transaction.create({
      data: {
        guestId: input.guestId,
        bookingId: input.bookingId,
        upsellId: input.upsellId,
        mcc: '4722',
        status: 'failed',
        amountMinor,
        currency,
        providerPayoutMinor,
        koncieFeeMinor,
        guestDisplayCurrency,
        guestDisplayAmountMinor,
        fxRateAtPurchase: fxRateFor(currency, guestDisplayCurrency),
        paymentProvider: 'KOVENA_MOCK',
        providerPaymentRef: `kvn_mock_failed_${crypto.randomUUID()}`,
        failureReason: `${charge.reason}: ${charge.message}`,
      },
    });
    redirect(`/hub/checkout/failed?reason=${charge.reason}&upsellId=${input.upsellId}`);
  }

  // 5. Happy path — atomic Transaction + TrustLedgerEntry.
  try {
    const transactionId = await prisma.$transaction(async (tx) => {
      const ledger = await tx.trustLedgerEntry.create({
        data: {
          eventType: 'COLLECTED',
          amountMinor,
          currency,
          trustAccountId: 'trust_kovena_mor_fj_0001',
          externalRef: charge.trustLedgerExternalRef,
          occurredAt: new Date(charge.capturedAt),
        },
      });

      const txRow = await tx.transaction.create({
        data: {
          guestId: input.guestId,
          bookingId: input.bookingId,
          upsellId: input.upsellId,
          savedCardId: input.savedCardId,
          mcc: '4722',
          status: 'captured',
          amountMinor,
          currency,
          providerPayoutMinor,
          koncieFeeMinor,
          guestDisplayCurrency,
          guestDisplayAmountMinor,
          fxRateAtPurchase: fxRateFor(currency, guestDisplayCurrency),
          paymentProvider: 'KOVENA_MOCK',
          providerPaymentRef: charge.providerPaymentRef,
          trustLedgerId: ledger.id,
          capturedAt: new Date(charge.capturedAt),
        },
      });

      if (input.saveCard && input.cardInput && cardBrandForSave && cardLast4ForSave) {
        const existingDefault = await tx.savedCard.findFirst({
          where: { guestId: input.guestId, isDefault: true },
        });
        await tx.savedCard.create({
          data: {
            guestId: input.guestId,
            providerToken,
            brand: cardBrandForSave,
            last4: cardLast4ForSave,
            expiryMonth: input.cardInput.expiryMonth,
            expiryYear: input.cardInput.expiryYear,
            isDefault: !existingDefault,
          },
        });
      }

      return txRow.id;
    });

    redirect(`/hub/checkout/success?transactionId=${transactionId}`);
  } catch (err) {
    // Kovena captured but Prisma rolled back — out-of-band reconciliation.
    if (err instanceof PaymentConfigurationError) throw err;
    // Re-throw control-flow errors (Next.js redirect()) untouched
    if (err && typeof err === 'object' && 'digest' in err) throw err;
    Sentry.captureException(err, {
      tags: { incident: 'captured-but-db-rollback', item: 'upsell' },
      extra: {
        providerPaymentRef: (charge as { providerPaymentRef?: string }).providerPaymentRef,
        guestId: input.guestId,
        bookingId: input.bookingId,
        upsellId: input.upsellId,
      },
    });
    throw err;
  }
}

// ─── Sprint 4: purchaseInsurance ────────────────────────────────────────────

const InsuranceInputSchema = z.object({
  quoteId: z.string().min(1, 'quoteId is required'),
  guestId: z.string().min(1),
  savedCardId: z.string().optional(),
  cardInput: z
    .object({
      pan: z.string().min(12).max(19),
      expiryMonth: z.number().int().min(1).max(12),
      expiryYear: z.number().int().min(2000).max(2100),
      cvc: z.string().min(3).max(4),
      cardholderName: z.string().min(1),
    })
    .optional(),
  saveCard: z.boolean(),
});

export type PurchaseInsuranceInput = z.infer<typeof InsuranceInputSchema>;

/**
 * Sprint 4 — purchase a CoverMore insurance quote as Merchant of Record.
 *
 * Mirrors purchaseUpsell's shape but writes to `insurance_policies` + a
 * matching `trust_ledger_entries` row instead of `transactions`. MCC 4722
 * is enforced at the DB CHECK level. Commission (30%) is stored per quote
 * and carried into the policy on capture.
 *
 * MoR: Koncie charges the guest's card under its own merchant ID; the
 * provider payout (70% of premium) is destined for CoverMore via the
 * Kovena trust ledger. The hotel is not involved in this transaction.
 */
export async function purchaseInsurance(raw: PurchaseInsuranceInput): Promise<void> {
  const input = InsuranceInputSchema.parse(raw);

  if (!input.cardInput && !input.savedCardId) {
    throw new PaymentValidationError('Either cardInput or savedCardId is required');
  }

  // 1. Load quote + verify guest owns it, it's not expired, no existing policy.
  const quote = await prisma.insuranceQuote.findUnique({
    where: { id: input.quoteId },
    include: { policy: true },
  });
  if (!quote || quote.guestId !== input.guestId) {
    throw new PaymentValidationError('Quote not found or not owned by this guest');
  }
  if (quote.policy) {
    throw new PaymentValidationError('Quote has already been purchased');
  }
  if (quote.expiresAt.getTime() < Date.now()) {
    throw new PaymentValidationError('Quote has expired; please re-generate');
  }

  // 2. Resolve provider token — same flow as purchaseUpsell.
  let providerToken: string;
  let cardBrandForSave: string | null = null;
  let cardLast4ForSave: string | null = null;

  if (input.savedCardId) {
    const saved = await prisma.savedCard.findUnique({ where: { id: input.savedCardId } });
    if (!saved || saved.guestId !== input.guestId) {
      throw new PaymentValidationError('Saved card not found');
    }
    providerToken = saved.providerToken;
  } else {
    if (!input.cardInput) throw new PaymentValidationError('cardInput required');
    const tokenResult = await paymentProvider.tokenizeCard(input.cardInput);
    if (!tokenResult.success) {
      throw new PaymentDeclinedError(tokenResult.reason, tokenResult.message);
    }
    providerToken = tokenResult.providerToken;
    cardBrandForSave = tokenResult.brand;
    cardLast4ForSave = tokenResult.last4;
  }

  // 3. Pull amount + commission split from the stored quote.
  const amountMinor = quote.premiumMinor;
  const currency = quote.currency;
  const koncieFeeMinor = quote.commissionMinor;
  const providerPayoutMinor = amountMinor - koncieFeeMinor;

  // 4. Charge Kovena mock.
  const charge = await paymentProvider.chargeAndCapture({
    amountMinor,
    currency,
    providerPayoutMinor,
    koncieFeeMinor,
    providerToken,
    metadata: {
      guestId: input.guestId,
      quoteId: input.quoteId,
      provider: quote.provider,
      providerRef: quote.providerRef,
    },
  });

  if (!charge.success) {
    await prisma.insurancePolicy.create({
      data: {
        quoteId: quote.id,
        guestId: input.guestId,
        mcc: '4722',
        status: 'FAILED',
        amountMinor,
        currency,
        providerPayoutMinor,
        koncieFeeMinor,
        paymentProvider: 'KOVENA_MOCK',
        providerPaymentRef: `kvn_mock_failed_${crypto.randomUUID()}`,
        failureReason: `${charge.reason}: ${charge.message}`,
      },
    });
    redirect(
      `/hub/checkout/failed?reason=${charge.reason}&item=insurance&quoteId=${input.quoteId}`,
    );
  }

  // 5. Happy path — atomic InsurancePolicy + TrustLedgerEntry.
  try {
    const policyId = await prisma.$transaction(async (tx) => {
      const ledger = await tx.trustLedgerEntry.create({
        data: {
          eventType: 'COLLECTED',
          amountMinor,
          currency,
          trustAccountId: 'trust_kovena_mor_fj_0001',
          externalRef: charge.trustLedgerExternalRef,
          occurredAt: new Date(charge.capturedAt),
        },
      });

      const policy = await tx.insurancePolicy.create({
        data: {
          quoteId: quote.id,
          guestId: input.guestId,
          mcc: '4722',
          status: 'ACTIVE',
          amountMinor,
          currency,
          providerPayoutMinor,
          koncieFeeMinor,
          paymentProvider: 'KOVENA_MOCK',
          providerPaymentRef: charge.providerPaymentRef,
          trustLedgerId: ledger.id,
          policyNumber: `CM-${ulid().toUpperCase()}`,
          capturedAt: new Date(charge.capturedAt),
        },
      });

      if (input.saveCard && input.cardInput && cardBrandForSave && cardLast4ForSave) {
        const existingDefault = await tx.savedCard.findFirst({
          where: { guestId: input.guestId, isDefault: true },
        });
        await tx.savedCard.create({
          data: {
            guestId: input.guestId,
            providerToken,
            brand: cardBrandForSave,
            last4: cardLast4ForSave,
            expiryMonth: input.cardInput.expiryMonth,
            expiryYear: input.cardInput.expiryYear,
            isDefault: !existingDefault,
          },
        });
      }

      return policy.id;
    });

    redirect(`/hub/checkout/success?policyId=${policyId}&item=insurance`);
  } catch (err) {
    if (err instanceof PaymentConfigurationError) throw err;
    if (err && typeof err === 'object' && 'digest' in err) throw err;
    Sentry.captureException(err, {
      tags: { incident: 'captured-but-db-rollback', item: 'insurance' },
      extra: {
        providerPaymentRef: (charge as { providerPaymentRef?: string }).providerPaymentRef,
        guestId: input.guestId,
        quoteId: input.quoteId,
      },
    });
    throw err;
  }
}
