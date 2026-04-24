import { test, expect } from '@playwright/test';

test.describe('Sprint 4 CoverMore insurance offer on hub', () => {
  test.beforeEach(async ({ page }) => {
    // Ensure the seeded guest has a flight booking (insurance quoting needs it).
    await page.goto('/__test__/ingest-jetseeker-for-seed-guest');
    // Then force insurance quotes.
    await page.goto('/__test__/seed-insurance-quote-for-seed-guest');
    // Sign in and land on /hub.
    await page.goto('/__test__/sign-in-as-seed-guest');
    await expect(page).toHaveURL(/\/hub$/);
  });

  test('hub renders the three-tier insurance offer, Comprehensive pre-selected', async ({ page }) => {
    await expect(page.getByText(/travel protection/i)).toBeVisible();
    await expect(page.getByText(/via covermore/i)).toBeVisible();

    // Three tier buttons
    const essentials = page.getByRole('radio', { name: /essentials/i });
    const comprehensive = page.getByRole('radio', { name: /^comprehensive$/i });
    const comprehensivePlus = page.getByRole('radio', { name: /comprehensive\+/i });
    await expect(essentials).toBeVisible();
    await expect(comprehensive).toBeVisible();
    await expect(comprehensivePlus).toBeVisible();

    // Default selection is Comprehensive
    await expect(comprehensive).toHaveAttribute('aria-checked', 'true');

    // Prices — AUD hardcoded per Sprint 4 spec
    await expect(page.getByText(/\$89/)).toBeVisible();
    await expect(page.getByText(/\$149/)).toBeVisible();
    await expect(page.getByText(/\$219/)).toBeVisible();

    // CTA deep-links into /hub/checkout/insurance/<quoteId>
    const cta = page.getByRole('link', { name: /protect your trip/i });
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(page).toHaveURL(/\/hub\/checkout\/insurance\/[0-9a-f-]+$/);

    // Checkout page shows CoverMore + MoR disclosure
    await expect(page.getByText(/covermore/i)).toBeVisible();
    await expect(page.getByText(/merchant of record/i)).toBeVisible();
    await expect(page.getByText(/mcc 4722/i)).toBeVisible();
  });
});
