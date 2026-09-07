import { test, expect } from '@playwright/test';

const LEGACY_KEY = 'iassetspro_offline_queue';
const DB_NAME = 'iassetspro_offline';
const STORE_NAME = 'sync_records';

test('CORE offline storage migrates the legacy queue into IndexedDB on app boot', async ({ page }) => {
  const legacyRecord = {
    id: `legacy-offline-${Date.now()}`,
    operation: 'create',
    entityType: 'work_order_comment',
    entityId: 'wo-browser-migration-probe',
    data: { content: 'browser migration probe' },
    timestamp: new Date().toISOString(),
    synced: false,
    syncAttempts: 0,
    originUserId: 'browser-migration-user',
  };

  await page.addInitScript(
    ({ key, record }) => {
      localStorage.setItem(key, JSON.stringify([record]));
    },
    { key: LEGACY_KEY, record: legacyRecord },
  );

  await page.goto('/');

  await expect.poll(async () => page.evaluate(
    async ({ dbName, storeName, legacyKey, expectedId }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      if (!database.objectStoreNames.contains(storeName)) {
        database.close();
        return { migrated: false, legacyRemoved: false, originUserId: null };
      }

      const record = await new Promise<any>((resolve, reject) => {
        const transaction = database.transaction(storeName, 'readonly');
        const request = transaction.objectStore(storeName).get(expectedId);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
      database.close();

      return {
        migrated: Boolean(record),
        legacyRemoved: localStorage.getItem(legacyKey) === null,
        originUserId: record?.originUserId || null,
      };
    },
    {
      dbName: DB_NAME,
      storeName: STORE_NAME,
      legacyKey: LEGACY_KEY,
      expectedId: legacyRecord.id,
    },
  ), {
    timeout: 15_000,
    message: 'legacy offline record should migrate into IndexedDB during app bootstrap',
  }).toEqual({
    migrated: true,
    legacyRemoved: true,
    originUserId: legacyRecord.originUserId,
  });
});
