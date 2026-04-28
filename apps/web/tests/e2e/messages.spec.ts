import { test, expect } from '@playwright/test';

test.describe('Sprint 6 admin messages timeline', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dev-test/sign-in-as-seed-admin');
    await expect(page).toHaveURL(/\/admin$/);
  });

  test('/admin/messages renders the seeded MAGIC_LINK MessageLog row', async ({
    page,
  }) => {
    await page.goto('/admin/messages');
    await expect(
      page.getByRole('heading', { name: /transactional message log/i }),
    ).toBeVisible();

    // Seeded row: Jane Demo, MAGIC_LINK, DELIVERED.
    await expect(page.getByText(/magic link/i).first()).toBeVisible();
    await expect(page.getByText('DELIVERED').first()).toBeVisible();
    await expect(page.getByText(/jane demo/i).first()).toBeVisible();
  });
});
