/**
 * Payment provider port. Sprint 2 has one adapter (KovenaMockAdapter); Sprint 3
 * swaps in a real Kovena wrapper. Interface is async from day one.
 *
 * Declines are structured results — NOT thrown. Throws are reserved for
 * infra-broken scenarios (see apps/web/src/lib/errors/payments.ts).
 */

export type CardBrand = 'VISA' | 'MASTERCARD' | 'AMEX' | 'OTHER';

export interface TokenizeCardInput {
  pan: string;
  expiryMonth: number;
  expiryYear: number;
  cvc: string;
  cardholderName: string;
}

export type TokenizeCardResult =
  | {
      success: true;
      providerToken: string;
      brand: CardBrand;
      last4: string;
    }
  | {
      success: false;
      reason: PaymentFailureReason;
      message: string;
    };

export interface ChargeInput {
  /** Minor units in `currency` (e.g. FJD cents) */
  amountMinor: number;
  currency: string;
  /** Split: what the provider (e.g. Namotu) receives */
  providerPayoutMinor: number;
  /** Split: Koncie's margin. Must satisfy: providerPayoutMinor + koncieFeeMinor === amountMinor */
  koncieFeeMinor: number;
  /** Opaque Kovena token from `tokenizeCard` */
  providerToken: string;
  /**
   * Correlation context for ledger audit. Flat key/value envelope so
   * different purchase paths (upsell, insurance, flights) can stamp their
   * own keys without needing an overloaded signature.
   *
   * Expected conventions:
   * - upsell path: `guestId`, `bookingId`, `upsellId`
   * - insurance path (Sprint 4+): `guestId`, `quoteId`, `provider`, `providerRef`
   */
  metadata: Record<string, string>;
}

export type ChargeResult =
  | {
      success: true;
      /** Opaque Kovena ref — guest-facing receipt number + compliance anchor */
      providerPaymentRef: string;
      /** Opaque Kovena trust-ledger ref */
      trustLedgerExternalRef: string;
      capturedAt: string; // ISO-8601
    }
  | {
      success: false;
      reason: PaymentFailureReason;
      message: string;
    };

export interface RefundInput {
  providerPaymentRef: string;
  amountMinor: number;
}

export type RefundResult =
  | { success: true; refundRef: string }
  | { success: false; reason: 'data_model_only' | PaymentFailureReason; message: string };

export type PaymentFailureReason =
  | 'card_declined'
  | 'insufficient_funds'
  | 'incorrect_cvc'
  | 'validation_error'
  | 'provider_unavailable'
  | 'configuration_error';

export interface PaymentProvider {
  tokenizeCard(input: TokenizeCardInput): Promise<TokenizeCardResult>;
  chargeAndCapture(input: ChargeInput): Promise<ChargeResult>;
  /** Sprint 2: data-only stub. Sprint 5 wires the real refund flow. */
  refund(input: RefundInput): Promise<RefundResult>;
}
