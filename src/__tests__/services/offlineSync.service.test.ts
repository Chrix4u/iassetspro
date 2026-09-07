import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { OfflineQueueStorage, LEGACY_OFFLINE_QUEUE_KEY } from '@/lib/offline-queue-storage';
import { OfflineSyncService } from '@/services/offlineSync.service';

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
  }
}

describe('OfflineSyncService durable queue semantics', () => {
  let storage: MemoryStorage;

  beforeEach(async () => {
    storage = new MemoryStorage();
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('navigator', { onLine: true });
    await OfflineQueueStorage.resetForTests();
  });

  afterEach(async () => {
    await OfflineQueueStorage.resetForTests();
    vi.unstubAllGlobals();
  });

  it('uses the fail-safe localStorage backend when IndexedDB is unavailable', async () => {
    expect(await OfflineSyncService.getStorageBackend()).toBe('localstorage');
  });

  it('removes successfully synced records from durable storage', async () => {
    const synced = await OfflineSyncService.queueOperation('create', 'work_order_comment', 'wo-1', { content: 'done' });
    const pending = await OfflineSyncService.queueOperation('update', 'work_order_task', 'task-1', { status: 'completed' });

    await OfflineSyncService.markSynced(synced.id);

    expect(await OfflineSyncService.cleanup()).toBe(1);
    expect((await OfflineSyncService.getPendingRecords()).map(record => record.id)).toEqual([pending.id]);

    const persisted = JSON.parse(storage.getItem(LEGACY_OFFLINE_QUEUE_KEY) || '[]');
    expect(persisted).toHaveLength(1);
    expect(persisted[0].id).toBe(pending.id);
  });

  it('never drops unsynced records merely because they reached a high retry count', async () => {
    const pending = await OfflineSyncService.queueOperation('create', 'work_order_comment', 'wo-2', { content: 'field note' });

    for (let attempt = 0; attempt < 12; attempt += 1) {
      await OfflineSyncService.markFailed(pending.id, `attempt-${attempt + 1}`);
    }

    expect(await OfflineSyncService.cleanup()).toBe(0);

    const remaining = await OfflineSyncService.getPendingRecords();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(pending.id);
    expect(remaining[0].syncAttempts).toBe(12);
    expect(remaining[0].lastError).toBe('attempt-12');
  });

  it('removes only synced records from a mixed queue', async () => {
    const first = await OfflineSyncService.queueOperation('create', 'work_order_comment', 'wo-3', { content: 'first' });
    const second = await OfflineSyncService.queueOperation('create', 'work_order_comment', 'wo-3', { content: 'second' });
    const third = await OfflineSyncService.queueOperation('delete', 'work_order_attachment', 'att-1', {});

    await OfflineSyncService.markFailed(first.id, 'temporary network failure');
    await OfflineSyncService.markSynced(second.id);
    await OfflineSyncService.markSynced(third.id);

    expect(await OfflineSyncService.cleanup()).toBe(2);
    expect((await OfflineSyncService.getPendingRecords()).map(record => record.id)).toEqual([first.id]);
  });

  it('preserves authenticated actor binding with the async storage path', async () => {
    storage.setItem('eam_user_id', 'tech-123');
    const record = await OfflineSyncService.queueOperation('create', 'work_order_comment', 'wo-4', { content: 'bound note' });

    expect(record.originUserId).toBe('tech-123');
    expect((await OfflineSyncService.getPendingRecords())[0].originUserId).toBe('tech-123');
  });
});
