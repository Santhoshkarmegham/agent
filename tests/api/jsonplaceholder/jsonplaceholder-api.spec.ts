import { expect, test } from '@playwright/test';

test.describe('JSONPlaceholder API tests', () => {
  test('GET /posts returns a populated list of posts', async ({ request }) => {
    const response = await request.get('/posts');
    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body)).toBeTruthy();
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]).toEqual(
      expect.objectContaining({
        userId: expect.any(Number),
        id: expect.any(Number),
        title: expect.any(String),
        body: expect.any(String),
      })
    );
  });

  test('GET /posts/1 returns the requested post', async ({ request }) => {
    const response = await request.get('/posts/1');
    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toEqual(
      expect.objectContaining({
        userId: 1,
        id: 1,
        title: expect.any(String),
        body: expect.any(String),
      })
    );
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

  test('POST /posts creates a new post payload', async ({ request }) => {
    const newPost = {
      title: 'Playwright API test post',
      body: 'Created from the Playwright API test suite.',
      userId: 10,
    };

    const response = await request.post('/posts', { data: newPost });
    expect(response.status()).toBe(201);

    const body = await response.json();
    expect(body).toEqual(
      expect.objectContaining({
        ...newPost,
        id: expect.any(Number),
      })
    );
  });

  test('PATCH /posts/1 updates a subset of the post fields', async ({ request }) => {
    const patchPayload = {
      title: 'Updated by Playwright API test',
    };

    const response = await request.patch('/posts/1', { data: patchPayload });
    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toEqual(
      expect.objectContaining({
        id: 1,
        title: patchPayload.title,
      })
    );
  });
});
