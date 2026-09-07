import { api } from '@/lib/api';
import {
  acquireOfflineSyncLease,
  broadcastOfflineSyncMessage,
  getOfflineSyncTabId,
  releaseOfflineSyncLease,
  renewOfflineSyncLease,
} from '@/lib/offline-sync-coordinator';
import { OfflineSyncService, type SyncRecord } from '@/services/offlineSync.service';

export const MAX_SYNC_BATCH = 100;

export type OfflineReplayOutcome = 'success' | 'busy' | 'failed';

export interface OfflineReplayResult {
  outcome: OfflineReplayOutcome;
  error: string | null;
}

export function chunkSyncRecords(
  records: SyncRecord[],
  batchSize = MAX_SYNC_BATCH,
): SyncRecord[][] {
  if (batchSize <= 0) throw new Error('batchSize must be greater than zero');
  const batches: SyncRecord[][] = [];
  for (let i = 0; i < records.length; i += batchSize) {
    batches.push(records.slice(i, i + batchSize));
  }
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
  if (records.some((record) => !record.originUserId)) {
    return 'Some legacy offline work cannot be safely attributed to a user and was not synced';
  }
  if (records.some((record) => record.originUserId !== currentUserId)) {
    return 'Some pending offline work belongs to a different signed-in user and was not synced';
  }
  return 'Some pending offline work could not be safely synced';
}

export async function replayPendingOfflineWork(): Promise<OfflineReplayResult> {
  const records = await OfflineSyncService.getPendingRecords();
  if (records.length === 0) {
    await OfflineSyncService.cleanup();
    return { outcome: 'success', error: null };
  }

  const currentUserId = OfflineSyncService.getCurrentActorUserId();
  if (!currentUserId) {
    return {
      outcome: 'failed',
      error: 'Offline work cannot sync until the authenticated user identity is available',
    };
  }

  if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') {
    return {
      outcome: 'failed',
      error: 'Offline work is preserved but sync is paused because cross-tab coordination storage is unavailable',
    };
  }

  const holderId = getOfflineSyncTabId();
  const acquired = await acquireOfflineSyncLease(holderId);
  if (!acquired) return { outcome: 'busy', error: null };

  broadcastOfflineSyncMessage('sync-started');

  try {
    const { owned, blocked } = partitionSyncRecordsByActor(records, currentUserId);
    let hasFailure = blocked.length > 0;
    let firstFailure: string | null = blocked.length
      ? blockedRecordsMessage(blocked, currentUserId)
      : null;

    for (const batch of chunkSyncRecords(owned)) {
      if (!(await renewOfflineSyncLease(holderId))) {
        hasFailure = true;
        firstFailure ||= 'Offline sync ownership changed before the next batch; remaining work was preserved';
        break;
      }

      const response = await api.post<{
        results: Array<{ id: string; success: boolean; replayed?: boolean; error?: string }>;
      }>(
        '/api/sync/offline',
        { records: batch },
        { timeout: 30_000 },
      );

      if (response.success && response.data?.results) {
        for (const result of response.data.results) {
          if (result.success) await OfflineSyncService.markSynced(result.id);
          else {
            const message = result.error || 'Sync failed';
            await OfflineSyncService.markFailed(result.id, message);
            hasFailure = true;
            firstFailure ||= message;
          }
        }
        await OfflineSyncService.cleanup();
        continue;
      }

      const message = response.error || 'Sync request failed';
      for (const record of batch) await OfflineSyncService.markFailed(record.id, message);
      hasFailure = true;
      firstFailure ||= message;
      break;
    }

    return hasFailure
      ? { outcome: 'failed', error: firstFailure || 'Some records failed to sync' }
      : { outcome: 'success', error: null };
  } catch (error: unknown) {
    return {
      outcome: 'failed',
      error: error instanceof Error ? error.message : 'Network error during sync',
    };
  } finally {
    await OfflineSyncService.cleanup();
    await releaseOfflineSyncLease(holderId).catch(() => false);
    broadcastOfflineSyncMessage('sync-completed');
  }
}
