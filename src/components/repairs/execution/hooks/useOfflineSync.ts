'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { OfflineSyncService, type SyncRecord } from '@/services/offlineSync.service';
import { api } from '@/lib/api';
import { createLogger } from '@/lib/logger';

const logger = createLogger('useOfflineSync');
const MAX_SYNC_BATCH = 100;

export type OfflineStatus = 'online' | 'offline' | 'pending_sync' | 'sync_failed';

interface UseOfflineSyncReturn {
  isOnline: boolean;
  pendingCount: number;
  syncInProgress: boolean;
  lastError: string | null;
  syncNow: () => Promise<void>;
  status: OfflineStatus;
}

export function chunkSyncRecords(records: SyncRecord[], batchSize = MAX_SYNC_BATCH): SyncRecord[][] {
  if (batchSize <= 0) throw new Error('batchSize must be greater than zero');
  const batches: SyncRecord[][] = [];
  for (let i = 0; i < records.length; i += batchSize) batches.push(records.slice(i, i + batchSize));
  return batches;
}

export function partitionSyncRecordsByActor(
  records: SyncRecord[],
  currentUserId: string,
): { owned: SyncRecord[]; blocked: SyncRecord[] } {
  const owned: SyncRecord[] = [];
  const blocked: SyncRecord[] = [];
  for (const record of records) {
    if (record.originUserId && record.originUserId === currentUserId) owned.push(record);
    else blocked.push(record);
  }
  return { owned, blocked };
}

function blockedRecordsMessage(records: SyncRecord[], currentUserId: string): string {
  if (records.some((record) => !record.originUserId)) return 'Some legacy offline work cannot be safely attributed to a user and was not synced';
  if (records.some((record) => record.originUserId !== currentUserId)) return 'Some pending offline work belongs to a different signed-in user and was not synced';
  return 'Some pending offline work could not be safely synced';
}

export function useOfflineSync(): UseOfflineSyncReturn {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncInProgress, setSyncInProgress] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const syncInProgressRef = useRef(false);

  const refreshPendingCount = useCallback(() => {
    try {
      const count = OfflineSyncService.getPendingRecords().length;
      setPendingCount(count);
      return count;
    } catch { return 0; }
  }, []);

  const syncNow = useCallback(async () => {
    if (syncInProgressRef.current) return;
    const records = OfflineSyncService.getPendingRecords();
    if (records.length === 0) {
      OfflineSyncService.cleanup();
      refreshPendingCount();
      return;
    }

    const currentUserId = OfflineSyncService.getCurrentActorUserId();
    if (!currentUserId) {
      setLastError('Offline work cannot sync until the authenticated user identity is available');
      refreshPendingCount();
      return;
    }

    const { owned, blocked } = partitionSyncRecordsByActor(records, currentUserId);
    syncInProgressRef.current = true;
    setSyncInProgress(true);
    setLastError(null);

    try {
      let hasFailure = blocked.length > 0;
      let firstFailure: string | null = blocked.length > 0 ? blockedRecordsMessage(blocked, currentUserId) : null;

      for (const batch of chunkSyncRecords(owned)) {
        const res = await api.post<{ results: Array<{ id: string; success: boolean; replayed?: boolean; error?: string }> }>(
          '/api/sync/offline',
          { records: batch },
          { timeout: 30_000 },
        );

        if (res.success && res.data?.results) {
          for (const result of res.data.results) {
            if (result.success) OfflineSyncService.markSynced(result.id);
            else {
              const message = result.error || 'Sync failed';
              OfflineSyncService.markFailed(result.id, message);
              hasFailure = true;
              firstFailure ||= message;
            }
          }
          OfflineSyncService.cleanup();
          continue;
        }

        const errorMsg = res.error || 'Sync request failed';
        for (const record of batch) OfflineSyncService.markFailed(record.id, errorMsg);
        hasFailure = true;
        firstFailure ||= errorMsg;
        break;
      }

      if (hasFailure) setLastError(firstFailure || 'Some records failed to sync');
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Network error during sync';
      setLastError(errorMsg);
      logger.error('Sync failed', { error: errorMsg });
    } finally {
      OfflineSyncService.cleanup();
      syncInProgressRef.current = false;
      setSyncInProgress(false);
      refreshPendingCount();
    }
  }, [refreshPendingCount]);

  useEffect(() => {
    const handleOnline = () => { logger.info('Device came online'); setIsOnline(true); void syncNow(); };
    const handleOffline = () => { logger.info('Device went offline'); setIsOnline(false); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    const interval = setInterval(refreshPendingCount, 5000);
    refreshPendingCount();
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [refreshPendingCount, syncNow]);

  useEffect(() => {
    if (!isOnline || pendingCount === 0 || syncInProgress || lastError) return;
    void syncNow();
  }, [isOnline, pendingCount, syncInProgress, lastError, syncNow]);

  const status: OfflineStatus = !isOnline ? 'offline' : syncInProgress ? 'pending_sync' : lastError && pendingCount > 0 ? 'sync_failed' : pendingCount > 0 ? 'pending_sync' : 'online';

  return { isOnline, pendingCount, syncInProgress, lastError, syncNow, status };
}