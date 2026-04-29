import type { Transaction } from '@prisma/client';

/** The subset of Transaction (+ joined data) required for the CSV export. */
export type UpsellCsvRow = Transaction & {
  guest: { email: string; firstName: string; lastName: string };
  upsell: { name: string; category: string };
  hotelBooking: { externalRef: string };
};

const CSV_HEADERS = [
  'transaction_id',
  'booking_external_ref',
  'guest_email',
  'guest_name',
  'upsell_name',
  'upsell_category',
  'status',
  'currency',
  'amount',
  'koncie_fee',
  'provider_payout',
  'mcc',
  'payment_provider',
  'provider_payment_ref',
  'captured_at',
  'created_at',
] as const;

/** RFC 4180-style cell escape — wraps in quotes when the value contains a
 *  comma, quote, newline, or carriage return, and doubles any inner quotes. */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Format a minor-units integer as a plain decimal string in the currency's
 *  major units. CSV-friendly — no thousands separator, no currency symbol. */
export function formatMoneyMajor(minor: number): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const major = Math.floor(abs / 100);
  const cents = abs % 100;
  return `${sign}${major}.${cents.toString().padStart(2, '0')}`;
}

/** Convert one Transaction row to its CSV line (no trailing newline). */
export function upsellRowToCsv(row: UpsellCsvRow): string {
  return [
    row.id,
    row.hotelBooking.externalRef,
    row.guest.email,
    `${row.guest.firstName} ${row.guest.lastName}`,
    row.upsell.name,
    row.upsell.category,
    row.status,
    row.currency,
    formatMoneyMajor(row.amountMinor),
    formatMoneyMajor(row.koncieFeeMinor),
    formatMoneyMajor(row.providerPayoutMinor),
    row.mcc,
    row.paymentProvider,
    row.providerPaymentRef,
    row.capturedAt ? row.capturedAt.toISOString() : '',
    row.createdAt.toISOString(),
  ]
    .map(escapeCsvCell)
    .join(',');
}

/** Build a full CSV document (UTF-8, \n line separator, with header row). */
export function upsellTransactionsToCsv(rows: UpsellCsvRow[]): string {
  const header = CSV_HEADERS.map(escapeCsvCell).join(',');
  const body = rows.map(upsellRowToCsv).join('\n');
  return rows.length === 0 ? header + '\n' : `${header}\n${body}\n`;
}

/** Suggest a download filename scoped to the property + today's date. */
export function upsellCsvFilename(propertySlug: string, now: Date = new Date()): string {
  const iso = now.toISOString().slice(0, 10);
  return `koncie-upsells-${propertySlug}-${iso}.csv`;
}
