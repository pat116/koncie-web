/**
 * Font loading helpers.
 *
 * Actual font loading happens in `apps/web/src/app/layout.tsx` via
 * `next/font/google` (which can only be called inside Next app code).
 * This module exports the shared config used on that call so brand and
 * app stay in sync.
 */

export const poppinsConfig = {
  subsets: ['latin'] as const,
  weight: ['400', '500', '600', '700'] as const,
  variable: '--font-poppins' as const,
  display: 'swap' as const,
};
