import { test, expect } from '@playwright/test';

// Real-wallet smoke test. SPENDS REAL TESTNET hUSDC (allocates a funded
// address + pays 0.01 per run), so it's opt-in:
//   E2E_REAL_WALLET=1 npx playwright test e2e/playground-real.spec.ts
test.describe('Agent Playground (real wallet)', () => {
  test.skip(process.env.E2E_REAL_WALLET !== '1', 'set E2E_REAL_WALLET=1 to run');

  test('allocates a funded address and pays for a task', async ({ page }) => {
    await page.goto('/');

    const exitTour = page.getByText('Exit tour');
    if (await exitTour.isVisible().catch(() => false)) await exitTour.click();

    // Session allocation: a real testnet address appears.
    const addressInput = page.locator('[data-tour="config"] input[readonly]');
    await expect(addressInput).toHaveValue(/^W[1-9A-HJ-NP-Za-km-z]{33}$/, {
      timeout: 60000,
    });

    // Execute the weather task — full x402 dance on testnet.
    await page.getByRole('button', { name: 'Execute task' }).click();
    await expect(page.getByText('200 OK')).toBeVisible({ timeout: 90000 });

    // Explorer link points at a real transaction.
    const explorerLink = page.locator('a[href*="explorer.testnet"]').first();
    await expect(explorerLink).toHaveAttribute(
      'href',
      /\/transaction\/[0-9a-f]{64}$/
    );
  });
});
