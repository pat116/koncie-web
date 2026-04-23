import { test, expect } from '@playwright/test';

test.describe('Sprint 2 checkout', () => {
  test.beforeEach(async ({ page }) => {
    // Assumes the dev helper `/__test__/sign-in-as-seed-guest` exists from Sprint 1.
    await page.goto('/__test__/sign-in-as-seed-guest');
    await expect(page).toHaveURL(/\/hub$/);
  });

  test('happy path — Half-day reef snorkel → paid', async ({ page }) => {
    await page.getByRole('link', { name: /browse all/i }).click();
    await expect(page).toHaveURL(/\/hub\/activities$/);

    await page.getByRole('link', { name: /Half-day reef snorkel/i }).click();
    await page.getByRole('link', { name: /book now/i }).click();

    await page.getByLabel(/card number/i).fill('4242424242424242');
    await page.getByLabel(/cvc/i).fill('123');
    await page.getByLabel(/name on card/i).fill('Jane Guest');

    await page.getByRole('button', { name: /pay/i }).click();

    await expect(page).toHaveURL(/\/hub\/checkout\/success/);
    await expect(page.getByText(/you.?re booked/i)).toBeVisible();
    await expect(page.getByText(/kvn_mock_/)).toBeVisible();

    await page.getByRole('link', { name: /back to hub/i }).click();
    await expect(page.getByText(/your add-ons/i)).toBeVisible();
    await expect(page.getByText(/half-day reef snorkel/i)).toBeVisible();
  });
});

test.describe('Sprint 2 checkout — fail trigger', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/__test__/sign-in-as-seed-guest');
  });

  test('4000000000000002 declines and retry succeeds', async ({ page }) => {
    await page.goto('/hub/activities');
    await page.getByRole('link', { name: /Sunset sail/i }).click();
    await page.getByRole('link', { name: /book now/i }).click();

    await page.getByLabel(/card number/i).fill('4000000000000002');
    await page.getByLabel(/cvc/i).fill('123');
    await page.getByLabel(/name on card/i).fill('Jane Guest');

    await page.getByRole('button', { name: /pay/i }).click();

    await expect(page).toHaveURL(/\/hub\/checkout\/failed/);
    await expect(page.getByText(/didn.?t go through/i)).toBeVisible();

    // Retry with happy card
    await page.getByRole('link', { name: /try again/i }).click();
    await page.getByLabel(/card number/i).fill('4242424242424242');
    await page.getByLabel(/cvc/i).fill('123');
    await page.getByLabel(/name on card/i).fill('Jane Guest');
    await page.getByRole('button', { name: /pay/i }).click();

    await expect(page).toHaveURL(/\/hub\/checkout\/success/);
  });
});
