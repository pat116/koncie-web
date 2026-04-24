import { describe, it, expect } from 'vitest';
import {
  escapeCsvCell,
  formatMoneyMajor,
  upsellRowToCsv,
  upsellTransactionsToCsv,
  upsellCsvFilename,
  type UpsellCsvRow,
} from './csv';

describe('escapeCsvCell', () => {
  it('returns an empty string for null/undefined', () => {
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
  });

  it('leaves plain values unquoted', () => {
    expect(escapeCsvCell('plain')).toBe('plain');
    expect(escapeCsvCell(42)).toBe('42');
  });

  it('wraps values containing commas, quotes, or newlines in quotes and doubles inner quotes', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('she said "hi"')).toBe('"she said ""hi"""');
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsvCell('line1\r\nline2')).toBe('"line1\r\nline2"');
  });
});

describe('formatMoneyMajor', () => {
  it('converts minor units to plain major.cents strings', () => {
    expect(formatMoneyMajor(0)).toBe('0.00');
    expect(formatMoneyMajor(5)).toBe('0.05');
    expect(formatMoneyMajor(50)).toBe('0.50');
    expect(formatMoneyMajor(100)).toBe('1.00');
    expect(formatMoneyMajor(12345)).toBe('123.45');
    expect(formatMoneyMajor(14900)).toBe('149.00');
  });

  it('handles negative values (refunds)', () => {
    expect(formatMoneyMajor(-500)).toBe('-5.00');
  });
});

const row: UpsellCsvRow = {
  id: 'tx-1',
  guestId: 'g-1',
  bookingId: 'b-1',
  upsellId: 'u-1',
  savedCardId: null,
  mcc: '4722',
  status: 'captured',
  amountMinor: 12500,
  currency: 'FJD',
  providerPayoutMinor: 10625,
  koncieFeeMinor: 1875,
  guestDisplayCurrency: 'AUD',
  guestDisplayAmountMinor: 8500,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fxRateAtPurchase: '0.6800' as any,
  paymentProvider: 'KOVENA_MOCK',
  providerPaymentRef: 'pp-ref-1',
  trustLedgerId: null,
  capturedAt: new Date('2026-04-20T10:00:00Z'),
  failureReason: null,
  createdAt: new Date('2026-04-20T09:59:50Z'),
  updatedAt: new Date('2026-04-20T10:00:01Z'),
  guest: { email: 'jane@demo.com', firstName: 'Jane', lastName: 'Demo' },
  upsell: { name: 'Sunset sail', category: 'ACTIVITY' },
  booking: { externalRef: 'HL-84321-NMT' },
};

describe('upsellRowToCsv', () => {
  it('emits all fields in the canonical header order', () => {
    const line = upsellRowToCsv(row);
    expect(line).toBe(
      [
        'tx-1',
        'HL-84321-NMT',
        'jane@demo.com',
        'Jane Demo',
        'Sunset sail',
        'ACTIVITY',
        'captured',
        'FJD',
        '125.00',
        '18.75',
        '106.25',
        '4722',
        'KOVENA_MOCK',
        'pp-ref-1',
        '2026-04-20T10:00:00.000Z',
        '2026-04-20T09:59:50.000Z',
      ].join(','),
    );
  });

  it('escapes commas/quotes in upsell name or guest name', () => {
    const hostile: UpsellCsvRow = {
      ...row,
      upsell: { name: 'Dive, snorkel & chill', category: 'ACTIVITY' },
      guest: { email: 'q@demo.com', firstName: 'Quo"', lastName: 'Vadis' },
    };
    const line = upsellRowToCsv(hostile);
    expect(line).toContain('"Dive, snorkel & chill"');
    expect(line).toContain('"Quo"" Vadis"');
  });

  it('handles null capturedAt for uncaptured transactions', () => {
    const uncaptured: UpsellCsvRow = { ...row, status: 'pending', capturedAt: null };
    const line = upsellRowToCsv(uncaptured);
    const cells = line.split(',');
    expect(cells[6]).toBe('pending');
    expect(cells[14]).toBe(''); // captured_at cell (index 14 zero-based)
  });
});

describe('upsellTransactionsToCsv', () => {
  it('emits header-only when rows are empty', () => {
    const csv = upsellTransactionsToCsv([]);
    expect(csv.split('\n')[0]).toContain('transaction_id,booking_external_ref');
    expect(csv.trim().split('\n')).toHaveLength(1);
  });

  it('joins rows with \\n and ends with a trailing newline', () => {
    const csv = upsellTransactionsToCsv([row, row]);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('transaction_id');
    expect(lines).toHaveLength(4); // header + 2 rows + trailing empty
    expect(csv.endsWith('\n')).toBe(true);
  });
});

describe('upsellCsvFilename', () => {
  it('includes the property slug and an ISO-date stamp', () => {
    expect(
      upsellCsvFilename('namotu-island-fiji', new Date('2026-04-24T12:00:00Z')),
    ).toBe('koncie-upsells-namotu-island-fiji-2026-04-24.csv');
  });
});
