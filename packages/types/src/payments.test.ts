import { describe, it, expectTypeOf } from 'vitest';
import type { ChargeResult, PaymentProvider, PaymentFailureReason } from './payments';

describe('payments types', () => {
  it('ChargeResult discriminated union narrows on success', () => {
    const r: ChargeResult = {
      success: true,
      providerPaymentRef: 'kvn_mock_abc',
      trustLedgerExternalRef: 'tle_abc',
      capturedAt: new Date().toISOString(),
    };
    if (r.success) {
      expectTypeOf(r.providerPaymentRef).toEqualTypeOf<string>();
    }
  });

  it('PaymentFailureReason covers all Sprint 2 buckets', () => {
    const reasons: PaymentFailureReason[] = [
      'card_declined',
      'insufficient_funds',
      'incorrect_cvc',
      'validation_error',
      'provider_unavailable',
      'configuration_error',
    ];
    expectTypeOf(reasons).toEqualTypeOf<PaymentFailureReason[]>();
  });

  it('PaymentProvider has three methods', () => {
    type Methods = keyof PaymentProvider;
    expectTypeOf<Methods>().toEqualTypeOf<'tokenizeCard' | 'chargeAndCapture' | 'refund'>();
  });
});
