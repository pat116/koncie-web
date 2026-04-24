import type { InsuranceQuoteSource } from '@koncie/types';
import { CoverMoreMockAdapter } from '@/adapters/covermore-mock';

/**
 * Single DI site for the insurance quote provider. Sprint 4 ships with the
 * mock; when CoverMore sandbox credentials land, swap the import and the
 * instantiation below — nothing else in the codebase needs to change.
 */
export const insuranceQuoteSource: InsuranceQuoteSource = new CoverMoreMockAdapter();
