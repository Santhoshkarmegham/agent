import { expect, test, type Page } from '@playwright/test';

const baseUrl = 'https://www.saucedemo.com/';

const validUser = {
  username: 'standard_user',
  password: 'secret_sauce',
};

async function login(page: Page, username: string, password: string) {
  await page.goto(baseUrl);
  await page.getByPlaceholder('Username').fill(username);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: 'Login' }).click();
}

test.describe('SauceDemo login functionality', () => {
  test('logs in successfully with a valid user', async ({ page }) => {
    await login(page, validUser.username, validUser.password);

    await expect(page).toHaveURL(/inventory.html/);
    await expect(page.getByText('Swag Labs')).toBeVisible();
    await expect(page.locator('.title')).toHaveText('Products');
  });

  test('shows an error for a locked out user', async ({ page }) => {
    await login(page, 'locked_out_user', validUser.password);

    await expect(page).toHaveURL(baseUrl);
    await expect(page.locator('[data-test="error"]')).toContainText(
      'Sorry, this user has been locked out.'
    );
  });

  test('shows an error for an invalid password', async ({ page }) => {
    await login(page, validUser.username, 'wrong_password');

    await expect(page).toHaveURL(baseUrl);
    await expect(page.locator('[data-test="error"]')).toContainText(
      'Username and password do not match any user in this service'
    );
  });

  test('shows required validation when username and password are blank', async ({ page }) => {
    await page.goto(baseUrl);
    await page.getByRole('button', { name: 'Login' }).click();

    await expect(page.locator('[data-test="error"]')).toContainText('Username is required');
  });
});
