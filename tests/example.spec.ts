import { expect, test } from '@playwright/test';

test('home page has Playwright in the title', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/Playwright/i);
});

test('get started link is visible', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('link', { name: /get started/i })).toBeVisible();
});
