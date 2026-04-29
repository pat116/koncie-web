/**
 * Structural test for Sprint 7 migration #3 (S7-09).
 *
 * Can't exercise the SQL against a live Postgres in the sandbox (no DB),
 * so this test enforces the shape of the migration file: the slug-suffix
 * rule, idempotency guards, and the four invariant queries from the
 * post-backfill checklist.
 *
 * The real backfill verification runs on Pat's local Postgres or staging
 * Supabase — see the migration file for the queries.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SQL = readFileSync(
  resolve(
    __dirname,
    '../../../../prisma/migrations/20260521120000_sprint_7_backfill/migration.sql',
  ),
  'utf8',
);

describe('S7-09 backfill migration', () => {
  it('uses un-suffixed slug for first row per property (kickoff §6 #7 lock)', () => {
    expect(SQL).toMatch(/ROW_NUMBER\(\) OVER \(PARTITION BY b\.property_id ORDER BY b\.created_at\) = 1[\s\S]*?THEN p\.slug/);
  });

  it('emits -bf{N} suffix for subsequent rows', () => {
    expect(SQL).toContain("p.slug || '-bf' || ROW_NUMBER()");
  });

  it('Trip insert is idempotent on re-run (WHERE NOT EXISTS guard)', () => {
    expect(SQL).toMatch(/INSERT INTO "trips"[\s\S]*?WHERE NOT EXISTS \(\s*SELECT 1 FROM "trips" t WHERE t\.hotel_booking_id = b\.id/);
  });

  it('OPEN Cart insert is idempotent (WHERE NOT EXISTS guard)', () => {
    expect(SQL).toMatch(/INSERT INTO "carts"[\s\S]*?WHERE NOT EXISTS \(\s*SELECT 1 FROM "carts" c\s+WHERE c\.trip_id = t\.id AND c\.state = 'OPEN'/);
  });

  it('phase derivation maps non-CONFIRMED → PRE_CONFIRMATION', () => {
    expect(SQL).toMatch(/WHEN b\.status <> 'CONFIRMED'\s+THEN 'PRE_CONFIRMATION'::"TripPhase"/);
  });

  it('phase derivation handles all 4 TripPhase values', () => {
    expect(SQL).toContain("'PRE_CONFIRMATION'::\"TripPhase\"");
    expect(SQL).toContain("'PRE_ARRIVAL'::\"TripPhase\"");
    expect(SQL).toContain("'IN_STAY'::\"TripPhase\"");
    expect(SQL).toContain("'POST_STAY'::\"TripPhase\"");
  });

  it('preparation_status default is the 5-step PENDING JSON', () => {
    for (const key of ['documents', 'health', 'weather', 'currency', 'customs']) {
      expect(SQL).toContain(`"${key}":{"status":"PENDING","checkedAt":null}`);
    }
  });

  it('best-effort flight linkage uses DISTINCT ON (guest_id) + 7-day overlap window', () => {
    expect(SQL).toContain('DISTINCT ON (fb.guest_id)');
    expect(SQL).toContain("INTERVAL '7 days'");
  });

  it('documents the 4 post-backfill invariant queries', () => {
    expect(SQL).toContain('Every hotel_booking has a trip');
    expect(SQL).toContain('Every trip has at least one OPEN cart');
    expect(SQL).toContain('No orphan carts');
    expect(SQL).toContain('Every trip has a unique non-null slug');
  });
});
