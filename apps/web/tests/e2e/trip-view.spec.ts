/**
 * Sprint 7 (S7-13) — Full TripView render end-to-end.
 *
 * Posture: per kickoff §7, this spec runs with `continue-on-error` style
 * tolerance — it depends on the dev-test ingest route + a real DB-backed
 * Trip. CI gates aren't required to be green on it; the unit tests in
 * `src/lib/trip/__tests__/view.test.ts` and
 * `src/app/api/trips/[slug]/route.test.ts` are.
 *
 * The /trip-itinerary/{slug} front-end page lands in Sprint 8. This spec
 * verifies the API contract that page will consume — plus the auth gate
 * (signed-in vs anonymous response shape).
 */

import { test, expect } from '@playwright/test';

test.describe('Sprint 7 — TripView projection (S7-13)', () => {
  test('GET /api/trips/{slug} returns full projection for the authenticated owner', async ({
    page,
    request,
  }) => {
    // 1. Run the dev-test ingest path so a Trip exists for the seed guest.
    //    The dev-test route bypasses HMAC for local runs.
    await page.goto('/dev-test/ingest-hotellink-for-seed-guest');
    await expect(page).toHaveURL(/\/hub$/);

    // 2. The dev-test path leaves the seed guest signed in (authUserId set
    //    on the Guest row). Hit the projection endpoint.
    const res = await request.get('/api/trips/namotu-island-fiji');
    expect(res.status()).toBe(200);

    const body = await res.json();
    // Spec doc §6.1 shape — top-level keys.
    expect(body.trip).toBeDefined();
    expect(body.trip.slug).toBe('namotu-island-fiji');
    expect(body.property).toBeDefined();
    expect(body.dates).toBeDefined();
    expect(body.accommodation).toBeDefined();
    expect(body.flights).toBeDefined();
    expect(body.preparation).toBeDefined();
    expect(body.cart).toBeDefined();
    expect(body.confirmedAncillaries).toEqual([]);
    expect(body.recommendations).toEqual([]); // Sprint 9 populates
    expect(body.alerts).toBeDefined();

    // Cart is empty + OPEN at first ingest.
    expect(body.cart.state).toBe('OPEN');
    expect(body.cart.isEmpty).toBe(true);

    // Property carries the timezone (used by the cron + lazy-recompute).
    expect(body.property.timezone).toBe('Pacific/Fiji');

    // No flight booking ingested yet, so flights are null.
    expect(body.flights.outbound).toBeNull();
    expect(body.flights.return).toBeNull();
  });

  test('GET /api/trips/{slug} returns thin sign-in stub for an anonymous caller', async ({
    request,
  }) => {
    // Use a fresh request context — no cookies, no Supabase session.
    const res = await request.get('/api/trips/namotu-island-fiji');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ exists: true, signInRequired: true });
  });

  test('GET /api/trips/{unknown-slug} returns 404', async ({ request }) => {
    const res = await request.get('/api/trips/no-such-trip-here-xyz123');
    expect(res.status()).toBe(404);
  });
});
