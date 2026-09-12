import { test, expect, type Page } from '@playwright/test';

const DB_NAME = 'iassetspro_offline';
const DB_VERSION = 2;
const QUEUE_STORE = 'sync_records';
const ADMIN_CREDENTIALS = { username: 'admin', password: 'admin123' };

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('input[placeholder="Enter your username"]', { timeout: 15_000 });
  await page.fill('input[placeholder="Enter your username"]', ADMIN_CREDENTIALS.username);
  await page.fill('input[placeholder="Enter your password"]', ADMIN_CREDENTIALS.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/#\/dashboard/, { timeout: 15_000 });
  await expect(page.locator('text=Dashboard').first()).toBeVisible({ timeout: 10_000 });
}

test('CORE replay drains one shared queue exactly once across two authenticated tabs', async ({ page, context }) => {
  await loginAsAdmin(page);

  const secondPage = await context.newPage();
  await secondPage.goto('/');
  await secondPage.waitForURL(/#\/dashboard/, { timeout: 15_000 });
  await expect(secondPage.locator('text=Dashboard').first()).toBeVisible({ timeout: 10_000 });

  const actorUserId = await page.evaluate(() => localStorage.getItem('eam_user_id'));
  expect(actorUserId).toBeTruthy();

  const recordId = `global-replay-${Date.now()}`;
  const submittedBatches: Array<Array<{ id: string }>> = [];

  await context.route('**/api/sync/offline', async (route) => {
    const payload = route.request().postDataJSON() as { records?: Array<{ id: string }> } | null;
    const records = Array.isArray(payload?.records) ? payload.records : [];
    submittedBatches.push(records);

    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          results: records.map((record) => ({ id: record.id, success: true })),
        },
      }),
    });
  });

  await page.evaluate(
    async ({ dbName, dbVersion, storeName, id, actorId }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName, dbVersion);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(storeName, 'readwrite');
        transaction.objectStore(storeName).put({
          id,
          operation: 'create',
          entityType: 'work_order_comment',
          entityId: 'browser-global-replay-probe',
          data: {
            content: 'global replay browser probe',
            idempotencyKey: `global-replay-${id}`,
          },
          timestamp: new Date().toISOString(),
          synced: false,
          syncAttempts: 0,
          originUserId: actorId,
        });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });

      database.close();

      window.dispatchEvent(new Event('iassetspro:offline-queue-changed'));
      const channel = new BroadcastChannel('iassetspro-offline-sync');
      channel.postMessage({
        type: 'queue-changed',
        sourceId: 'browser-global-replay-probe',
        at: new Date().toISOString(),
      });
      channel.close();
    },
    {
      dbName: DB_NAME,
      dbVersion: DB_VERSION,
      storeName: QUEUE_STORE,
      id: recordId,
      actorId: actorUserId,
    },
  );

  await expect.poll(() => submittedBatches.length, {
    timeout: 15_000,
    message: 'one authenticated tab should acquire replay ownership for the shared queue',
  }).toBe(1);

  expect(submittedBatches[0].map((record) => record.id)).toEqual([recordId]);

  await expect.poll(async () => page.evaluate(
    async ({ dbName, dbVersion, storeName, id }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName, dbVersion);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      const record = await new Promise<unknown>((resolve, reject) => {
        const transaction = database.transaction(storeName, 'readonly');
        const request = transaction.objectStore(storeName).get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      database.close();
      return record == null;
    },
    { dbName: DB_NAME, dbVersion: DB_VERSION, storeName: QUEUE_STORE, id: recordId },
  ), {
    timeout: 15_000,
    message: 'server-acknowledged replay record should be cleaned from durable storage',
  }).toBe(true);

  await secondPage.waitForTimeout(750);
  expect(submittedBatches).toHaveLength(1);

  await secondPage.close();
});
