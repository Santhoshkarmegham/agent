import { expect, test, type Page } from '@playwright/test';

const baseUrl = 'https://www.saucedemo.com/';

const validUser = {
  username: 'standard_user',
  password: 'secret_sauce',
};

async function login(page: Page) {
  await page.goto(baseUrl);
  await page.getByPlaceholder('Username').fill(validUser.username);
  await page.getByPlaceholder('Password').fill(validUser.password);
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page).toHaveURL(/inventory.html/);
}

test.describe('SauceDemo shopping flow', () => {
  test('adds a backpack to the cart and shows the cart badge', async ({ page }) => {
    await login(page);

    await page.getByRole('button', { name: 'Add to cart' }).first().click();

    await expect(page.locator('[data-test="shopping-cart-badge"]')).toHaveText('1');
  });

  test('sorts products by price low to high', async ({ page }) => {
    await login(page);

    await page.locator('[data-test="product-sort-container"]').selectOption('lohi');

    const prices = await page.locator('[data-test="inventory-item-price"]').allTextContents();
    const numericPrices = prices.map((price) => Number(price.replace('$', '')));

    expect(numericPrices[0]).toBeLessThanOrEqual(numericPrices[numericPrices.length - 1]);
    await expect(page.locator('[data-test="inventory-item-name"]').first()).toHaveText('Sauce Labs Onesie');
  });

  test('logs out from the inventory page', async ({ page }) => {
    await login(page);

    await page.getByRole('button', { name: 'Open Menu' }).click();
    await expect(page.locator('#logout_sidebar_link')).toBeVisible();
    await page.locator('#logout_sidebar_link').click();

    await expect(page).toHaveURL(baseUrl);
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
  });
});
