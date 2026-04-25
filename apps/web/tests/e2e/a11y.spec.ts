import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Sprint 8 — WCAG 2.1 AA axe scan across the ten pilot routes.
 *
 * Posture matches the rest of the E2E suite: this is an advisory job
 * (Playwright runs `continue-on-error` in CI per the Sprint 2-polish
 * guidance). The assertion below is "zero serious or critical violations" —
 * looser than "zero violations of any severity", because some moderate axe
 * findings (autocomplete hints on dev-only forms, decorative SVG roles in
 * shadcn primitives) are acceptable for the pilot and would otherwise
 * generate noise without changing the user experience.
 *
 * The signed-in routes use the existing `/__test__/sign-in-as-seed-guest`
 * and `/__test__/sign-in-as-seed-admin` helpers, mirroring `admin.spec.ts`,
 * `checkout.spec.ts`, and `messages.spec.ts`. Same seed dependency: `pnpm
 * db:seed` must have run first.
 *
 * If the brand-green-on-sand CTA contrast issue (Sprint 8 audit, see
 * `docs/sprint-8-engineering-findings.md`) regresses, axe will flag it
 * here as a `color-contrast` serious violation and this spec will fail.
 */

interface RouteCase {
  /** Friendly name for reporter output. */
  name: string;
  /** URL path under PLAYWRIGHT_BASE_URL. */
  path: string;
  /** 'guest' | 'admin' | 'public' — drives which sign-in helper runs first. */
  auth: 'guest' | 'admin' | 'public';
  /** Some routes need a flight + insurance quote seeded before they render. */
  prereq?: Array<string>;
}

const ROUTES: RouteCase[] = [
  { name: 'marketing landing', path: '/', auth: 'public' },
  { name: 'welcome (expired-link state)', path: '/welcome', auth: 'public' },
  { name: 'sign-in / register (missing-context state)', path: '/register', auth: 'public' },
  {
    name: 'guest hub',
    path: '/hub',
    auth: 'guest',
    prereq: [
      '/__test__/ingest-jetseeker-for-seed-guest',
      '/__test__/seed-insurance-quote-for-seed-guest',
    ],
  },
  {
    name: 'flights / trip detail',
    path: '/hub/trip',
    auth: 'guest',
    prereq: ['/__test__/ingest-jetseeker-for-seed-guest'],
  },
  {
    name: 'insurance offer (rendered on hub)',
    path: '/hub',
    auth: 'guest',
    prereq: [
      '/__test__/ingest-jetseeker-for-seed-guest',
      '/__test__/seed-insurance-quote-for-seed-guest',
    ],
  },
  { name: 'admin overview', path: '/admin', auth: 'admin' },
  { name: 'admin messages', path: '/admin/messages', auth: 'admin' },
  { name: 'admin bookings', path: '/admin/bookings', auth: 'admin' },
];

for (const route of ROUTES) {
  test(`a11y: ${route.name} (${route.path}) has no serious/critical axe violations`, async ({
    page,
  }) => {
    if (route.auth === 'guest') {
      for (const url of route.prereq ?? []) {
        await page.goto(url);
      }
      await page.goto('/__test__/sign-in-as-seed-guest');
    } else if (route.auth === 'admin') {
      await page.goto('/__test__/sign-in-as-seed-admin');
    }

    await page.goto(route.path);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );

    expect(
      blocking,
      `Serious/critical axe violations on ${route.path}: ${blocking
        .map((v) => `${v.id} (${v.nodes.length} nodes)`)
        .join(', ')}`,
    ).toEqual([]);
  });
}

/**
 * The checkout route renders only when an `upsellId` query param resolves to
 * an active upsell on the seed property. Rather than thread a live upsell id
 * through the test (it changes per seed run), we hit `/payment` which is the
 * stable redirect target and exercises the same checkout chrome.
 */
test('a11y: payment / checkout entry has no serious/critical axe violations', async ({
  page,
}) => {
  await page.goto('/__test__/sign-in-as-seed-guest');
  await page.goto('/payment');

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  const blocking = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );

  expect(blocking).toEqual([]);
});
