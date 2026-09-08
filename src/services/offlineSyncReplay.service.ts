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

type ReplayAcknowledgement = {
  id: string;
  success: boolean;
  replayed?: boolean;
  error?: string;
};

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

const UNKNOWN_ACKNOWLEDGEMENT_ERROR =
  'Offline sync returned an acknowledgement outside the submitted batch; the batch was preserved';
const DUPLICATE_ACKNOWLEDGEMENT_ERROR =
  'Offline sync returned duplicate acknowledgements for a submitted record; the batch was preserved';
const MISSING_ACKNOWLEDGEMENT_ERROR =
  'Offline sync did not acknowledge every submitted record; the batch was preserved';

/**
 * Validate the complete response before applying any queue mutation. A partial,
 * foreign or internally contradictory acknowledgement set is not trustworthy as
 * proof that any individual queue record may be removed. Replaying the whole
 * batch later is safe because the server contract is idempotent per record.
 */
function validateAcknowledgements(
  batch: SyncRecord[],
  results: ReplayAcknowledgement[],
): string | null {
  const batchIds = new Set(batch.map((record) => record.id));
  const acknowledgedIds = new Set<string>();

  for (const result of results) {
    if (!batchIds.has(result.id)) return UNKNOWN_ACKNOWLEDGEMENT_ERROR;
    if (acknowledgedIds.has(result.id)) return DUPLICATE_ACKNOWLEDGEMENT_ERROR;
    acknowledgedIds.add(result.id);
  }

  if (acknowledgedIds.size !== batchIds.size) return MISSING_ACKNOWLEDGEMENT_ERROR;
  return null;
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

      const response = await api.post<{ results: ReplayAcknowledgement[] }>(
        '/api/sync/offline',
        { records: batch },
        { timeout: 30_000 },
      );

      if (response.success && response.data?.results) {
        const acknowledgementError = validateAcknowledgements(batch, response.data.results);

        if (acknowledgementError) {
          // Treat the response as an atomic protocol failure. Do not trust even
          // otherwise valid-looking rows in the same malformed result set.
          for (const record of batch) {
            await OfflineSyncService.markFailed(record.id, acknowledgementError);
          }
          hasFailure = true;
          firstFailure ||= acknowledgementError;
          break;
        }

        for (const result of response.data.results) {
          if (result.success) {
            await OfflineSyncService.markSynced(result.id);
          } else {
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
