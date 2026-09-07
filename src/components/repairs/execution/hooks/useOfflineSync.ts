'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { OFFLINE_QUEUE_CHANGED_EVENT, OfflineSyncService } from '@/services/offlineSync.service';
import {
  replayPendingOfflineWork,
  chunkSyncRecords,
  partitionSyncRecordsByActor,
} from '@/services/offlineSyncReplay.service';
import {
  isRemoteOfflineSyncActive,
  subscribeOfflineSyncMessages,
} from '@/lib/offline-sync-coordinator';
import { createLogger } from '@/lib/logger';

export { chunkSyncRecords, partitionSyncRecordsByActor };

const logger = createLogger('useOfflineSync');

export type OfflineStatus = 'online' | 'offline' | 'pending_sync' | 'sync_failed';

interface UseOfflineSyncReturn {
  isOnline: boolean;
  pendingCount: number;
  syncInProgress: boolean;
  lastError: string | null;
  syncNow: () => Promise<void>;
  status: OfflineStatus;
}

export function useOfflineSync(): UseOfflineSyncReturn {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [localSyncInProgress, setLocalSyncInProgress] = useState(false);
  const [remoteSyncInProgress, setRemoteSyncInProgress] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const localSyncRef = useRef(false);

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = (await OfflineSyncService.getPendingRecords()).length;
      setPendingCount(count);
      return count;
    } catch (error: unknown) {
      logger.error('Failed to refresh offline queue count', {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }, []);

  const refreshRemoteSyncState = useCallback(async () => {
    setRemoteSyncInProgress(await isRemoteOfflineSyncActive());
  }, []);

  const syncNow = useCallback(async () => {
    if (localSyncRef.current) return;

    localSyncRef.current = true;
    setLocalSyncInProgress(true);

    try {
      const result = await replayPendingOfflineWork();

      if (result.outcome === 'busy') {
        setRemoteSyncInProgress(true);
        return;
      }

      if (result.outcome === 'failed') {
        setLastError(result.error || 'Offline sync failed');
        return;
      }

      setLastError(null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Network error during sync';
      setLastError(message);
      logger.error('Sync failed', { error: message });
    } finally {
      localSyncRef.current = false;
      setLocalSyncInProgress(false);
      await refreshPendingCount();
      await refreshRemoteSyncState();
    }
  }, [refreshPendingCount, refreshRemoteSyncState]);

  useEffect(() => {
    const handleOnline = () => {
      logger.info('Device came online');
      setIsOnline(true);
      void syncNow();
    };

    const handleOffline = () => {
      logger.info('Device went offline');
      setIsOnline(false);
    };

    const handleQueueChanged = () => {
      void refreshPendingCount();
    };

    const unsubscribeBroadcast = subscribeOfflineSyncMessages((message) => {
      if (message.type === 'queue-changed') {
        void refreshPendingCount();
        return;
      }
      if (message.type === 'sync-started') {
        setRemoteSyncInProgress(true);
        return;
      }
      setRemoteSyncInProgress(false);
      void refreshPendingCount();
    });

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener(OFFLINE_QUEUE_CHANGED_EVENT, handleQueueChanged);

    const interval = setInterval(() => {
      void refreshPendingCount();
      void refreshRemoteSyncState();
    }, 5000);

    void refreshPendingCount();
    void refreshRemoteSyncState();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener(OFFLINE_QUEUE_CHANGED_EVENT, handleQueueChanged);
      unsubscribeBroadcast();
      clearInterval(interval);
    };
  }, [refreshPendingCount, refreshRemoteSyncState, syncNow]);

  const syncInProgress = localSyncInProgress || remoteSyncInProgress;

  useEffect(() => {
    if (!isOnline || pendingCount === 0 || syncInProgress || lastError) return;
    void syncNow();
  }, [isOnline, pendingCount, syncInProgress, lastError, syncNow]);

  const status: OfflineStatus = (() => {
    if (!isOnline) return 'offline';
    if (syncInProgress) return 'pending_sync';
    if (lastError && pendingCount > 0) return 'sync_failed';
    if (pendingCount > 0) return 'pending_sync';
    return 'online';
  })();

  return {
    isOnline,
    pendingCount,
    syncInProgress,
    lastError,
    syncNow,
    status,
  };
}
