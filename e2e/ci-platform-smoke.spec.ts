import { test, expect } from '@playwright/test';

test.describe('CI platform fixture smoke', () => {
  test('seeded administrator authenticates against the production artifact', async ({ request }) => {
    const response = await request.post('/api/auth/login', {
      data: {
        username: 'admin',
        password: 'admin123',
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data?.user?.username).toBe('admin');
    expect(body.data?.user?.status).toBe('active');
    expect(typeof body.data?.token).toBe('string');
    expect(body.data.token.length).toBeGreaterThan(10);
    expect(Array.isArray(body.data?.permissions)).toBe(true);
    expect(body.data.permissions.length).toBeGreaterThan(0);
  });
});
