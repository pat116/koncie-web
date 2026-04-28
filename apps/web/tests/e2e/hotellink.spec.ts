import { test, expect } from '@playwright/test';

test.describe('Sprint 7 HotelLink ingest end-to-end', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dev-test/sign-in-as-seed-admin');
    await expect(page).toHaveURL(/\/admin$/);
  });

  test('synthetic ingest writes a HOTEL_BOOKING_CONFIRMED row visible on /admin/messages', async ({
    page,
  }) => {
    // Trigger the ingest directly — the test route bypasses HMAC so local
    // runs don't need the HOTELLINK_WEBHOOK_SECRET set.
    await page.goto('/dev-test/ingest-hotellink-for-seed-guest');
    await expect(page).toHaveURL(/\/hub$/);

    await page.goto('/admin/messages');
    await expect(
      page.getByRole('heading', { name: /transactional message log/i }),
    ).toBeVisible();
    await expect(page.getByText(/hotel confirmed/i).first()).toBeVisible();
  });
});
