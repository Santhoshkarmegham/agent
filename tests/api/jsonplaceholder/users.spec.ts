import { expect, test } from '@playwright/test';

test.describe('JSONPlaceholder users API', () => {
  test('GET /users returns multiple users', async ({ request }) => {
    const response = await request.get('/users');

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body)).toBeTruthy();
    expect(body.length).toBeGreaterThan(1);
  });

  test('GET /users/1 returns user profile details', async ({ request }) => {
    const response = await request.get('/users/1');

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toEqual(
      expect.objectContaining({
        id: 1,
        name: expect.any(String),
        username: expect.any(String),
        email: expect.stringMatching(/.+@.+\..+/),
      })
    );
    expect(body.address).toEqual(
      expect.objectContaining({
        city: expect.any(String),
        zipcode: expect.any(String),
      })
    );
  });
});
