import { ulid } from 'ulid';
import type {
  CardBrand,
  ChargeInput,
  ChargeResult,
  PaymentProvider,
  RefundInput,
  RefundResult,
  TokenizeCardInput,
  TokenizeCardResult,
} from '@koncie/types';

const NETWORK_DELAY_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function brandFromPan(pan: string): CardBrand {
  const first = pan[0];
  if (first === '4') return 'VISA';
  if (first === '5') return 'MASTERCARD';
  if (first === '3') return 'AMEX';
  return 'OTHER';
}

export class KovenaMockAdapter implements PaymentProvider {
  async tokenizeCard(input: TokenizeCardInput): Promise<TokenizeCardResult> {
    await sleep(NETWORK_DELAY_MS);

    if (input.expiryMonth < 1 || input.expiryMonth > 12) {
      return {
        success: false,
        reason: 'validation_error',
        message: `Expiry month ${input.expiryMonth} is invalid`,
      };
    }

    const now = new Date();
    const expiry = new Date(input.expiryYear, input.expiryMonth - 1, 1);
    if (expiry < new Date(now.getFullYear(), now.getMonth(), 1)) {
      return {
        success: false,
        reason: 'validation_error',
        message: 'Card is expired',
      };
    }

    return {
      success: true,
      providerToken: `tok_mock_${ulid()}_${input.pan}`,
      brand: brandFromPan(input.pan),
      last4: input.pan.slice(-4),
    };
  }

  async chargeAndCapture(input: ChargeInput): Promise<ChargeResult> {
    await sleep(NETWORK_DELAY_MS);

    if (input.providerPayoutMinor + input.koncieFeeMinor !== input.amountMinor) {
      return {
        success: false,
        reason: 'validation_error',
        message: 'fee split does not sum to amount_minor',
      };
    }

    // Fail-trigger matching — the token encodes the original PAN for the mock.
    const token = input.providerToken;
    if (token.includes('4000000000000002')) {
      return {
        success: false,
        reason: 'card_declined',
        message: 'Your card was declined.',
      };
    }
    if (token.includes('4000000000009995')) {
      return {
        success: false,
        reason: 'insufficient_funds',
        message: 'Insufficient funds on this card.',
      };
    }
    if (token.includes('4000000000000127')) {
      return {
        success: false,
        reason: 'incorrect_cvc',
        message: 'The security code was incorrect.',
      };
    }

    return {
      success: true,
      providerPaymentRef: `kvn_mock_${ulid()}`,
      trustLedgerExternalRef: `tle_${ulid()}`,
      capturedAt: new Date().toISOString(),
    };
  }

  async refund(_input: RefundInput): Promise<RefundResult> {
    await sleep(NETWORK_DELAY_MS);
    return {
      success: false,
      reason: 'data_model_only',
      message:
        'Refunds are defined in the data model but not executable in Sprint 2 — see docs/payments.md',
    };
  }
}
