import { test, expect } from '@playwright/test';

test.describe('CORE offline PWA platform', () => {
  test('registers the app-shell service worker and exposes the manifest', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');

    const registration = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return null;
      const ready = await navigator.serviceWorker.ready;
      return {
        scope: ready.scope,
        scriptURL: ready.active?.scriptURL || ready.waiting?.scriptURL || ready.installing?.scriptURL || '',
      };
    });

    expect(registration).not.toBeNull();
    expect(registration?.scope.endsWith('/')).toBe(true);
    expect(registration?.scriptURL.endsWith('/sw.js')).toBe(true);
  });

  test('upgrades the shared offline database with queue and API snapshot stores', async ({ page }) => {
    await page.goto('/');

    await expect.poll(async () => page.evaluate(async () => {
      const databases = await indexedDB.databases();
      if (!databases.some((database) => database.name === 'iassetspro_offline')) return [];

      return await new Promise<string[]>((resolve, reject) => {
        const request = indexedDB.open('iassetspro_offline', 2);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const names = Array.from(database.objectStoreNames);
          database.close();
          resolve(names);
        };
      });
    }), {
      timeout: 20_000,
      message: 'the application should initialize the shared offline schema',
    }).toEqual(expect.arrayContaining(['sync_records', 'api_snapshots']));
  });

  test('keeps a persistent stale-data warning until each cached endpoint refreshes live', async ({ page }) => {
    await page.goto('/');

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('iassetspro:offline-cache-state', {
        detail: {
          endpoint: '/api/work-orders/wo-1',
          cached: true,
          cachedAt: '2026-09-07T20:00:00.000Z',
        },
      }));
      window.dispatchEvent(new CustomEvent('iassetspro:offline-cache-state', {
        detail: {
          endpoint: '/api/work-orders/wo-1/tasks',
          cached: true,
          cachedAt: '2026-09-07T20:05:00.000Z',
        },
      }));
    });

    const banner = page.getByTestId('offline-cached-data-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('2 sections may be stale');

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('iassetspro:offline-cache-state', {
        detail: { endpoint: '/api/work-orders/wo-1', cached: false },
      }));
    });
    await expect(banner).toContainText('1 section may be stale');

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('iassetspro:offline-cache-state', {
        detail: { endpoint: '/api/work-orders/wo-1/tasks', cached: false },
      }));
    });
    await expect(banner).toBeHidden();
  });

  test('serves the cached shell offline without caching API responses', async ({ page, context }) => {
    await page.goto('/');

    await page.evaluate(async () => {
      if ('serviceWorker' in navigator) await navigator.serviceWorker.ready;
    });

    await expect.poll(async () => {
      return page.evaluate(async () => Boolean(await caches.match('/')));
    }).toBe(true);

    const cachedApiEntries = await page.evaluate(async () => {
      const names = await caches.keys();
      const requests = (
        await Promise.all(names.map(async (name) => (await caches.open(name)).keys()))
      ).flat();
      return requests.filter((request) => new URL(request.url).pathname.startsWith('/api/')).length;
    });
    expect(cachedApiEntries).toBe(0);

    await context.setOffline(true);
    try {
      await page.reload({ waitUntil: 'domcontentloaded' });
      const bodyText = await page.textContent('body');
      expect((bodyText || '').trim().length).toBeGreaterThan(0);
    } finally {
      await context.setOffline(false);
    }
  });
});
