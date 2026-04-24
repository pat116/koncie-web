import { test, expect } from '@playwright/test';

test.describe('Sprint 3 flight itinerary on hub', () => {
  test.beforeEach(async ({ page }) => {
    // Sprint 3 dev helper: force flight ingestion for the seeded guest so the
    // hub has cached flights to render regardless of adapter latency.
    await page.goto('/__test__/ingest-jetseeker-for-seed-guest');
    // Sprint 2-polish dev helper: sign in as the seeded guest and land on /hub.
    await page.goto('/__test__/sign-in-as-seed-guest');
    await expect(page).toHaveURL(/\/hub$/);
  });

  test('hub renders the flight itinerary card + contextual offers', async ({ page }) => {
    // Flight itinerary card — outbound + return + carrier + departure/return dates
    await expect(page.getByText(/your flight/i)).toBeVisible();
    await expect(page.getByText('SYD → NAN')).toBeVisible();
    await expect(page.getByText('NAN → SYD')).toBeVisible();
    await expect(page.getByText(/fiji airways|carrier fj|\bFJ\b|via jet seeker/i)).toBeVisible();
    await expect(page.getByText(/14 jul/i)).toBeVisible();
    await expect(page.getByText(/21 jul/i)).toBeVisible();

    // Contextual offers: destination-contextual deep-link into activities
    const deepLink = page.getByRole('link', { name: /your namotu activities await/i });
    await expect(deepLink).toBeVisible();

    // Contextual offers: travel-protection stub with flight-date copy
    await expect(page.getByText(/travel protection/i)).toBeVisible();
    await expect(page.getByText(/covers your 14 jul flight to nadi/i)).toBeVisible();

    // Clickthrough on deep-link lands on /hub/activities
    await deepLink.click();
    await expect(page).toHaveURL(/\/hub\/activities$/);
  });
});
