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

  test('enterprise reporting API resolves against the production artifact', async ({ request }) => {
    const login = await request.post('/api/auth/login', {
      data: { username: 'admin', password: 'admin123' },
    });
    expect(login.status()).toBe(200);
    const loginBody = await login.json();
    const token = loginBody.data?.token;
    expect(typeof token).toBe('string');

    const report = await request.get('/api/reports/enterprise?from=2025-01-01&to=2026-12-31', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(report.status()).toBe(200);
    const reportBody = await report.json();
    expect(reportBody.success).toBe(true);
    expect(reportBody.data).toBeTruthy();
  });

});
