import { test, expect } from '@playwright/test';

test.describe('Sprint 6 completion — /c/[token] chat surface', () => {
  test('mints a chat token, sets the chat-scoped cookie via middleware, renders the chat shell', async ({
    page,
    request,
  }) => {
    // 1. Mint via the dev test route. Returns { token, url }.
    const mintRes = await request.get(
      '/dev-test/mint-chat-token-for-seed-booking',
    );
    expect(mintRes.ok()).toBeTruthy();
    const { token } = (await mintRes.json()) as { token: string };
    expect(token).toMatch(/\./); // JWT shape

    // 2. Visit /c/{token}. Middleware sets koncie_chat_session on the
    //    response; the page renders the chat shell.
    await page.goto(`/c/${token}`);

    // Header chrome — locked: "Koncie Concierge".
    await expect(
      page.getByText(/koncie concierge/i).first(),
    ).toBeVisible();

    // Suggestion chips render — at least the "How's the surf today?" one.
    await expect(
      page.getByRole('button', { name: /how's the surf today/i }),
    ).toBeVisible();

    // 3. Cookie assertion. Middleware writes it; the browser stored it.
    const cookies = await page.context().cookies();
    const session = cookies.find((c) => c.name === 'koncie_chat_session');
    expect(session, 'koncie_chat_session cookie is set').toBeTruthy();
    expect(session?.path).toBe('/c');
    expect(session?.httpOnly).toBe(true);
  });
});
