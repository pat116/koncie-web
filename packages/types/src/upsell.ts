/**
 * An ancillary offer surfaced to a guest — insurance, activity, transfer,
 * on-property upsell. This is what Koncie sells as Merchant of Record
 * under MCC 4722.
 *
 * Stubbed for Sprint 0.
 */

export type UpsellCategory =
  | 'insurance'
  | 'activity'
  | 'transfer'
  | 'dining'
  | 'on-property';

export interface Upsell {
  id: string;
  category: UpsellCategory;
  title: string;
  /** e.g. 'CoverMore' — drives the "Powered by …" label */
  provider: string;
  /** Price in minor units (cents). Display currency handled at render time. */
  priceMinor: number;
  currency: string;
}
