import { test, expect } from '@playwright/test';

test.describe('Sprint 5 hotel admin portal', () => {
  test.beforeEach(async ({ page }) => {
    // Sign in as seeded hotel_admin; /dev-test/sign-in-as-seed-admin lands on /admin.
    await page.goto('/dev-test/sign-in-as-seed-admin');
    await expect(page).toHaveURL(/\/admin$/);
  });

  test('overview renders Namotu header + KPI tiles + download CSV', async ({
    page,
  }) => {
    await expect(
      page.getByRole('heading', { name: /namotu island fiji/i }),
    ).toBeVisible();

    // KPI tiles — labels only (values are $0 until transactions seed)
    await expect(page.getByText(/koncie fee captured/i)).toBeVisible();
    await expect(page.getByText(/confirmed bookings/i)).toBeVisible();
    await expect(page.getByText(/upsell revenue/i)).toBeVisible();
    await expect(page.getByText(/insurance revenue/i)).toBeVisible();

    // Attach-rate section
    await expect(
      page.getByRole('heading', { name: /attach rates/i }),
    ).toBeVisible();

    // CSV download CTA
    const csv = page.getByRole('link', { name: /download csv/i });
    await expect(csv).toBeVisible();
    await expect(csv).toHaveAttribute('href', '/admin/export/upsells');
  });

  test('nav links reach guests / bookings / alerts / messages', async ({
    page,
  }) => {
    await page.getByRole('link', { name: /^guests$/i }).click();
    await expect(page).toHaveURL(/\/admin\/guests$/);
    await expect(page.getByText(/guests on koncie/i)).toBeVisible();

    await page.getByRole('link', { name: /^bookings$/i }).click();
    await expect(page).toHaveURL(/\/admin\/bookings$/);
    await expect(page.getByText(/powered by hotellink/i)).toBeVisible();

    await page.getByRole('link', { name: /priority alerts/i }).click();
    await expect(page).toHaveURL(/\/admin\/alerts$/);

    await page.getByRole('link', { name: /^messages$/i }).click();
    await expect(page).toHaveURL(/\/admin\/messages$/);
    await expect(page.getByText(/transactional message log/i)).toBeVisible();
  });

  test('CSV export returns text/csv with the right filename', async ({
    request,
  }) => {
    const res = await request.get('/admin/export/upsells');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/csv');
    expect(res.headers()['content-disposition']).toContain(
      'koncie-upsells-namotu-island-fiji',
    );
    const body = await res.text();
    // Header row must be present even if there are no rows.
    expect(body.split('\n')[0]).toContain('transaction_id');
  });
});
