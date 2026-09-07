// ============================================================================
// OFFLINE-FIRST SERVICE — Offline sync engine for field execution
// Uses localStorage on client + queue-based server sync
// ============================================================================

import { createLogger } from '@/lib/logger';

const logger = createLogger('offlineSync');

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
   * User that created the offline action. Older queue entries may not have this
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

const STORAGE_KEY = 'iassetspro_offline_queue';
const ACTOR_USER_ID_KEY = 'eam_user_id';

export class OfflineSyncService {
  /** Return the authenticated user id persisted by the auth store. */
  static getCurrentActorUserId(): string | null {
    if (typeof window === 'undefined') return null;
    const value = localStorage.getItem(ACTOR_USER_ID_KEY)?.trim();
    return value || null;
  }

  /**
   * Add an operation to the offline queue.
   *
   * Every new record is permanently bound to the authenticated user that
   * created it. This prevents a queued field action from being attributed to a
   * different technician after logout/login on a shared device.
   */
  static queueOperation(
    operation: 'create' | 'update' | 'delete',
    entityType: string,
    entityId: string,
    data: Record<string, unknown>
  ): SyncRecord {
    const originUserId = this.getCurrentActorUserId();
    if (!originUserId) {
      throw new Error('Cannot queue offline work without an authenticated user identity');
    }

    const record: SyncRecord = {
      id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      operation,
      entityType,
      entityId,
      data,
      timestamp: new Date().toISOString(),
      synced: false,
      syncAttempts: 0,
      originUserId,
    };

    const queue = this.getQueue();
    queue.push(record);
    this.saveQueue(queue);

    logger.info('Operation queued for sync', { operation, entityType, entityId, originUserId });
    return record;
  }

  /**
   * Get all pending sync records
   */
  static getPendingRecords(): SyncRecord[] {
    return this.getQueue().filter(r => !r.synced);
  }

  /**
   * Get queue status
   */
  static getStatus(): SyncStatus {
    const queue = this.getQueue();
    const pending = queue.filter(r => !r.synced);
    const lastSynced = queue.filter(r => r.synced).sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )[0];

    return {
      pendingCount: pending.length,
      lastSyncAt: lastSynced?.timestamp || null,
      syncInProgress: false,
      lastError: pending.find(r => r.lastError)?.lastError || null,
      deviceOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    };
  }

  /**
   * Mark a record as synced
   */
  static markSynced(recordId: string): void {
    const queue = this.getQueue();
    const record = queue.find(r => r.id === recordId);
    if (record) {
      record.synced = true;
      this.saveQueue(queue);
    }
  }

  /**
   * Mark a record as failed
   */
  static markFailed(recordId: string, error: string): void {
    const queue = this.getQueue();
    const record = queue.find(r => r.id === recordId);
    if (record) {
      record.lastError = error;
      record.syncAttempts++;
      this.saveQueue(queue);
    }
  }

  /**
   * Remove records that have been acknowledged as successfully synced.
   *
   * Failed/unsynced records must remain in the queue regardless of retry count;
   * dropping them here would silently lose field activity that still needs to
   * reach the server. Retry/dead-letter policy belongs to the sync processor,
   * not local storage cleanup.
   */
  static cleanup(): number {
    const queue = this.getQueue();
    const before = queue.length;
    const pendingOnly = queue.filter(r => !r.synced);
    this.saveQueue(pendingOnly);
    return before - pendingOnly.length;
  }

  /**
   * Get queue size
   */
  static getQueueSize(): number {
    return this.getPendingRecords().length;
  }

  // Storage helpers (client-side only)
  private static getQueue(): SyncRecord[] {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  private static saveQueue(queue: SyncRecord[]): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    } catch {
      logger.error('Failed to save offline queue to localStorage');
    }
  }
}