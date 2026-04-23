import type { PaymentProvider } from '@koncie/types';
import { KovenaMockAdapter } from '@/adapters/kovena-mock';

/**
 * Single source of truth for the payment provider. Every server action and
 * server component imports `paymentProvider` from here — never the adapter
 * module directly. Sprint 3 swaps in the real Kovena wrapper right here.
 */
export const paymentProvider: PaymentProvider = new KovenaMockAdapter();
