import { beforeEach, describe, expect, it, vi } from 'vitest';

const postMock = vi.fn();
const getPendingRecordsMock = vi.fn();
const cleanupMock = vi.fn();
const markSyncedMock = vi.fn();
const markFailedMock = vi.fn();
const getCurrentActorUserIdMock = vi.fn();
const acquireLeaseMock = vi.fn();
const renewLeaseMock = vi.fn();
const releaseLeaseMock = vi.fn();
const broadcastMock = vi.fn();

vi.mock('@/lib/api', () => ({
  api: { post: postMock },
}));

vi.mock('@/services/offlineSync.service', () => ({
  OfflineSyncService: {
    getPendingRecords: getPendingRecordsMock,
    cleanup: cleanupMock,
    markSynced: markSyncedMock,
    markFailed: markFailedMock,
    getCurrentActorUserId: getCurrentActorUserIdMock,
  },
}));

vi.mock('@/lib/offline-sync-coordinator', () => ({
  acquireOfflineSyncLease: acquireLeaseMock,
  renewOfflineSyncLease: renewLeaseMock,
  releaseOfflineSyncLease: releaseLeaseMock,
  broadcastOfflineSyncMessage: broadcastMock,
  getOfflineSyncTabId: () => 'tab-a',
}));

import {
  chunkSyncRecords,
  partitionSyncRecordsByActor,
  replayPendingOfflineWork,
} from '@/services/offlineSyncReplay.service';
import type { SyncRecord } from '@/services/offlineSync.service';

function record(id: string, originUserId = 'tech-1'): SyncRecord {
  return {
    id,
    operation: 'create',
    entityType: 'work_order_comment',
    entityId: 'wo-1',
    data: { content: id },
    timestamp: new Date().toISOString(),
    synced: false,
    syncAttempts: 0,
    originUserId,
  };
}

describe('offline cross-tab replay orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('window', { indexedDB: {} });
    getCurrentActorUserIdMock.mockReturnValue('tech-1');
    cleanupMock.mockResolvedValue(0);
    markSyncedMock.mockResolvedValue(undefined);
    markFailedMock.mockResolvedValue(undefined);
    acquireLeaseMock.mockResolvedValue(true);
    renewLeaseMock.mockResolvedValue(true);
    releaseLeaseMock.mockResolvedValue(true);
  });

  it('keeps the server batch ceiling at 100 records', () => {
    const records = Array.from({ length: 205 }, (_, index) => record(`r-${index}`));
    expect(chunkSyncRecords(records).map(batch => batch.length)).toEqual([100, 100, 5]);
  });

  it('keeps wrong-user and unbound records out of replay', () => {
    const owned = record('owned');
    const wrongUser = record('wrong', 'tech-2');
    const unbound = { ...record('unbound'), originUserId: undefined };

    expect(partitionSyncRecordsByActor([owned, wrongUser, unbound], 'tech-1')).toEqual({
      owned: [owned],
      blocked: [wrongUser, unbound],
    });
  });

  it('sends zero requests when another tab owns the replay lease', async () => {
    getPendingRecordsMock.mockResolvedValue([record('r-1')]);
    acquireLeaseMock.mockResolvedValue(false);

    await expect(replayPendingOfflineWork()).resolves.toEqual({ outcome: 'busy', error: null });

    expect(postMock).not.toHaveBeenCalled();
    expect(markSyncedMock).not.toHaveBeenCalled();
    expect(markFailedMock).not.toHaveBeenCalled();
    expect(releaseLeaseMock).not.toHaveBeenCalled();
  });

  it('owns, renews and releases one lease while replaying multiple batches', async () => {
    const records = Array.from({ length: 101 }, (_, index) => record(`r-${index}`));
    getPendingRecordsMock.mockResolvedValue(records);
    postMock
      .mockResolvedValueOnce({
        success: true,
        data: { results: records.slice(0, 100).map(item => ({ id: item.id, success: true })) },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { results: [{ id: records[100].id, success: true }] },
      });

    await expect(replayPendingOfflineWork()).resolves.toEqual({ outcome: 'success', error: null });

    expect(acquireLeaseMock).toHaveBeenCalledTimes(1);
    expect(renewLeaseMock).toHaveBeenCalledTimes(2);
    expect(postMock).toHaveBeenCalledTimes(2);
    expect(postMock.mock.calls[0][1].records).toHaveLength(100);
    expect(postMock.mock.calls[1][1].records).toHaveLength(1);
    expect(markSyncedMock).toHaveBeenCalledTimes(101);
    expect(releaseLeaseMock).toHaveBeenCalledWith('tab-a');
    expect(broadcastMock.mock.calls.map(call => call[0])).toEqual(['sync-started', 'sync-completed']);
  });

  it('stops before sending another batch if lease renewal is lost', async () => {
    getPendingRecordsMock.mockResolvedValue([record('r-1')]);
    renewLeaseMock.mockResolvedValue(false);

    const result = await replayPendingOfflineWork();

    expect(result.outcome).toBe('failed');
    expect(result.error).toContain('ownership changed');
    expect(postMock).not.toHaveBeenCalled();
    expect(releaseLeaseMock).toHaveBeenCalledWith('tab-a');
  });
});
