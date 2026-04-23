/**
 * A Koncie ancillary transaction — processed as Merchant of Record under
 * MCC 4722 via Kovena payments. Every transaction references an entry in
 * the trust-account ledger (owned by Kovena's payments system, not this repo).
 *
 * Koncie NEVER issues a Transaction for a primary flight or room booking.
 * Those transactions stay inside Jet Seeker and HotelLink respectively.
 *
 * Stubbed for Sprint 0.
 */

export type TransactionStatus =
  | 'pending'
  | 'authorized'
  | 'captured'
  | 'failed'
  | 'refunded';

export interface Transaction {
  id: string;
  upsellId: string;
  guestId: string;
  /** Reference into Kovena's trust-account ledger */
  trustLedgerRef: string;
  amountMinor: number;
  currency: string;
  /** MCC is always 4722 for Koncie transactions — kept explicit for auditability */
  mcc: '4722';
  status: TransactionStatus;
  /** ISO-8601 timestamp */
  createdAt: string;
}
