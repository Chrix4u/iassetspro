// ============================================================================
// OFFLINE-FIRST SERVICE — Offline sync engine for field execution
// Uses IndexedDB on capable browsers + fail-safe localStorage fallback
// ============================================================================

import { createLogger } from '@/lib/logger';
import { OfflineQueueStorage } from '@/lib/offline-queue-storage';

const logger = createLogger('offlineSync');

export const OFFLINE_QUEUE_CHANGED_EVENT = 'iassetspro:offline-queue-changed';

export interface SyncRecord {
  id: string;
  operation: 'create' | 'update' | 'delete';
  entityType: string;
  entityId: string;
  data: Record<string, unknown>;
  timestamp: string;
  synced: boolean;
  syncAttempts: number;
  lastError?: string;
  /**
   * User that created the offline action. Older queue entries, or records
   * created before client auth identity has been restored, may not have this
   * field and must never be replayed under an arbitrary later login.
   */
  originUserId?: string;
}

export interface SyncStatus {
  pendingCount: number;
  lastSyncAt: string | null;
  syncInProgress: boolean;
  lastError: string | null;
  deviceOnline: boolean;
}

const ACTOR_USER_ID_KEY = 'eam_user_id';
const UNBOUND_ACTOR_ERROR = 'Offline record has no authenticated user binding and cannot be synced safely';

function notifyQueueChanged(): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new Event(OFFLINE_QUEUE_CHANGED_EVENT));
}

export class OfflineSyncService {
  /** Return the authenticated user id persisted by the auth store. */
  static getCurrentActorUserId(): string | null {
    if (typeof window === 'undefined') return null;
    const value = localStorage.getItem(ACTOR_USER_ID_KEY)?.trim();
    return value || null;
  }

  /**
   * Add an operation to the durable offline queue.
   *
   * Every new record is bound to the authenticated user that created it when
   * that identity is available. If auth restoration has not completed yet, we
   * preserve the field action locally as explicitly unbound rather than losing
   * it; the sync layer will fail closed and refuse to replay it under a guessed
   * user identity.
   */
  static async queueOperation(
    operation: 'create' | 'update' | 'delete',
    entityType: string,
    entityId: string,
    data: Record<string, unknown>
  ): Promise<SyncRecord> {
    const originUserId = this.getCurrentActorUserId();

    const record: SyncRecord = {
      id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      operation,
      entityType,
      entityId,
      data,
      timestamp: new Date().toISOString(),
      synced: false,
      syncAttempts: 0,
      ...(originUserId
        ? { originUserId }
        : { lastError: UNBOUND_ACTOR_ERROR }),
    };

    await OfflineQueueStorage.put(record as SyncRecord & Record<string, unknown>);
    notifyQueueChanged();

    if (originUserId) {
      logger.info('Operation queued for sync', { operation, entityType, entityId, originUserId });
    } else {
      logger.error('Operation queued without authenticated actor binding', { operation, entityType, entityId });
    }
    return record;
  }

  /** Get all pending sync records. */
  static async getPendingRecords(): Promise<SyncRecord[]> {
    const queue = await OfflineQueueStorage.getAll<SyncRecord & Record<string, unknown>>();
    return queue.filter((record) => !record.synced);
  }

  /** Get queue status. */
  static async getStatus(): Promise<SyncStatus> {
    const queue = await OfflineQueueStorage.getAll<SyncRecord & Record<string, unknown>>();
    const pending = queue.filter((record) => !record.synced);
    const lastSynced = queue.filter((record) => record.synced).sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )[0];

    return {
      pendingCount: pending.length,
      lastSyncAt: lastSynced?.timestamp || null,
      syncInProgress: false,
      lastError: pending.find((record) => record.lastError)?.lastError || null,
      deviceOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    };
  }

  /** Mark a record as synced. */
  static async markSynced(recordId: string): Promise<void> {
    const updated = await OfflineQueueStorage.mutate<SyncRecord & Record<string, unknown>>(
      recordId,
      (record) => ({ ...record, synced: true }),
    );
    if (updated) notifyQueueChanged();
  }

  /** Mark a record as failed. */
  static async markFailed(recordId: string, error: string): Promise<void> {
    const updated = await OfflineQueueStorage.mutate<SyncRecord & Record<string, unknown>>(
      recordId,
      (record) => ({
        ...record,
        lastError: error,
        syncAttempts: record.syncAttempts + 1,
      }),
    );
    if (updated) notifyQueueChanged();
  }

  /**
   * Remove records that have been acknowledged as successfully synced.
   *
   * Failed/unsynced records must remain in the queue regardless of retry count;
   * dropping them here would silently lose field activity that still needs to
   * reach the server. Retry/dead-letter policy belongs to the sync processor,
   * not browser storage cleanup.
   */
  static async cleanup(): Promise<number> {
    const queue = await OfflineQueueStorage.getAll<SyncRecord & Record<string, unknown>>();
    const syncedIds = queue.filter((record) => record.synced).map((record) => record.id);
    if (syncedIds.length === 0) return 0;
    await OfflineQueueStorage.deleteMany(syncedIds);
    notifyQueueChanged();
    return syncedIds.length;
  }

  /** Get pending queue size. */
  static async getQueueSize(): Promise<number> {
    return (await this.getPendingRecords()).length;
  }

  /** Surface the active persistence backend for diagnostics and tests. */
  static async getStorageBackend(): Promise<'indexeddb' | 'localstorage'> {
    return OfflineQueueStorage.getBackend();
  }
}
