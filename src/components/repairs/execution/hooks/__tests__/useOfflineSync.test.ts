import { describe, expect, it } from 'vitest';
import {
  chunkSyncRecords,
  partitionSyncRecordsByActor,
} from '@/components/repairs/execution/hooks/useOfflineSync';
import type { SyncRecord } from '@/services/offlineSync.service';

function record(index: number, originUserId: string | null = 'user-a'): SyncRecord {
  return {
    id: `sync-${index}`,
    operation: 'create',
    entityType: 'work_order_comment',
    entityId: 'wo-1',
    data: { content: `comment ${index}` },
    timestamp: new Date(2026, 0, 1, 0, 0, index % 60).toISOString(),
    synced: false,
    syncAttempts: 0,
    ...(originUserId ? { originUserId } : {}),
  };
}

describe('chunkSyncRecords', () => {
  it('keeps queues up to the endpoint limit in one batch', () => {
    const records = Array.from({ length: 100 }, (_, i) => record(i));
    const batches = chunkSyncRecords(records);

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(100);
  });

  it('splits queues larger than 100 without losing or reordering records', () => {
    const records = Array.from({ length: 205 }, (_, i) => record(i));
    const batches = chunkSyncRecords(records);

    expect(batches.map((batch) => batch.length)).toEqual([100, 100, 5]);
    expect(batches.flat().map((item) => item.id)).toEqual(records.map((item) => item.id));
  });

  it('returns no batches for an empty queue', () => {
    expect(chunkSyncRecords([])).toEqual([]);
  });

  it('supports smaller explicit batch sizes for tests and future endpoint limits', () => {
    const records = Array.from({ length: 7 }, (_, i) => record(i));
    const batches = chunkSyncRecords(records, 3);

    expect(batches.map((batch) => batch.length)).toEqual([3, 3, 1]);
  });

  it('rejects invalid batch sizes', () => {
    expect(() => chunkSyncRecords([record(1)], 0)).toThrow('batchSize must be greater than zero');
  });
});

describe('partitionSyncRecordsByActor', () => {
  it('allows only records created by the currently authenticated user', () => {
    const records = [record(1, 'user-a'), record(2, 'user-b'), record(3, 'user-a')];

    const result = partitionSyncRecordsByActor(records, 'user-a');

    expect(result.owned.map((item) => item.id)).toEqual(['sync-1', 'sync-3']);
    expect(result.blocked.map((item) => item.id)).toEqual(['sync-2']);
  });

  it('fails closed for legacy records that have no originating user', () => {
    const legacy = record(1, null);
    const result = partitionSyncRecordsByActor([legacy], 'user-a');

    expect(result.owned).toEqual([]);
    expect(result.blocked).toEqual([legacy]);
  });

  it('blocks every pending record after a different user signs in on the same device', () => {
    const records = [record(1, 'technician-a'), record(2, 'technician-a')];

    const result = partitionSyncRecordsByActor(records, 'technician-b');

    expect(result.owned).toEqual([]);
    expect(result.blocked).toHaveLength(2);
  });
});