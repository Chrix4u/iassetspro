/**
 * Scenario I — Offline Replay / Idempotency (UAT-10)
 *
 * Pure API staging UAT for the offline sync contract:
 *   - first mutation succeeds;
 *   - an EXACT replay succeeds with replayed=true and does not duplicate;
 *   - reusing the same key for changed payload/timestamp fails closed;
 *   - a new idempotency key creates a new record;
 *   - offline labor accepts closed retrospective start/resume rows only;
 *   - exact labor replay does not duplicate hours;
 *   - actor-bound records cannot replay under another authenticated user;
 *   - server batch limit remains 100 records.
 */
import { test, expect } from '@playwright/test';
import {
  getToken,
  createMR,
  approveMR,
  convertMR,
  assignWO,
  startWO,
  getWO,
  lookupUserByKey,
  lookupAssetId,
  lookupPlantId,
  apiCall,
} from './helpers/api';

function generateIdempotencyKey(): string {
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

test('UAT-10: Scenario I — Offline Replay / Idempotency', async () => {
  let woId: string;
  let assetId: string;
  let plantId: string;
  let techSingleUserId: string;

  const plannerToken = await getToken('planner');
  techSingleUserId = await lookupUserByKey(plannerToken, 'tech_single');
  assetId = await lookupAssetId(plannerToken, 'UAT-PUMP-001');
  plantId = await lookupPlantId(plannerToken, 'PLANT-A');

  await test.step('I1: Create and start WO for offline sync tests', async () => {
    const requesterToken = await getToken('requester');
    const supervisorToken = await getToken('supervisor');
    const planToken = await getToken('planner');
    const techToken = await getToken('tech_single');

    const mr = await createMR(requesterToken, {
      title: 'UAT-OfflineSync-Pump-Check',
      description: 'Routine pump check for offline sync testing.',
      assetId,
      priority: 'low',
      plantId,
    });

    await approveMR(supervisorToken, mr.id);
    const wo = await convertMR(planToken, mr.id, {
      assignedTo: techSingleUserId,
      tradeActivity: 'mechanical',
      workOrderType: 'preventive',
      priority: 'low',
    });
    woId = wo.id;
    expect(woId).toBeTruthy();

    await assignWO(planToken, woId, { assignedTo: techSingleUserId });
    await startWO(techToken, woId);

    const fetched = await getWO(techToken, woId);
    expect(fetched.status).toBe('in_progress');
  });

  await test.step('I2: First offline comment succeeds', async () => {
    const techToken = await getToken('tech_single');
    const idempotencyKey = generateIdempotencyKey();
    const uniqueContent = `Offline exact replay comment ${Date.now()}`;
    const timestamp = new Date().toISOString();
    const record = {
      id: `offline-comment-${Date.now()}`,
      operation: 'create',
      entityType: 'work_order_comment',
      entityId: woId,
      idempotencyKey,
      data: { content: uniqueContent },
      timestamp,
    };

    const first = await apiCall(techToken, 'POST', '/api/sync/offline', { records: [record] });
    expect(first.status).toBe(200);
    expect(first.data.success).toBe(true);
    expect(first.data.results[0]).toMatchObject({ success: true, replayed: false });

    const commentsAfterFirst = await apiCall(
      techToken,
      'GET',
      `/api/work-orders/${woId}/comments`,
    );
    const firstMatches = (commentsAfterFirst.data.data as Array<{ content: string }>)
      .filter((comment) => comment.content === uniqueContent);
    expect(firstMatches).toHaveLength(1);

    // EXACT same actor/entity/action/data/timestamp + key is a legitimate retry.
    const replay = await apiCall(techToken, 'POST', '/api/sync/offline', { records: [record] });
    expect(replay.status).toBe(200);
    expect(replay.data.results[0]).toMatchObject({ success: true, replayed: true });

    const commentsAfterReplay = await apiCall(
      techToken,
      'GET',
      `/api/work-orders/${woId}/comments`,
    );
    const replayMatches = (commentsAfterReplay.data.data as Array<{ content: string }>)
      .filter((comment) => comment.content === uniqueContent);
    expect(replayMatches).toHaveLength(1);

    // Same key with changed data is NOT a replay. It must fail closed and must
    // not silently discard a different field action as "already synced".
    const conflict = await apiCall(techToken, 'POST', '/api/sync/offline', {
      records: [{
        ...record,
        id: `${record.id}-conflict`,
        data: { content: `${uniqueContent} changed` },
      }],
    });
    expect(conflict.status).toBe(200);
    expect(conflict.data.results[0].success).toBe(false);
    expect(String(conflict.data.results[0].error)).toContain('Idempotency key conflict');

    const commentsAfterConflict = await apiCall(
      techToken,
      'GET',
      `/api/work-orders/${woId}/comments`,
    );
    const changedMatches = (commentsAfterConflict.data.data as Array<{ content: string }>)
      .filter((comment) => comment.content === `${uniqueContent} changed`);
    expect(changedMatches).toHaveLength(0);
  });

  await test.step('I3: A new idempotency key creates a separate comment', async () => {
    const techToken = await getToken('tech_single');
    const uniqueContent = `Second offline comment ${Date.now()}`;
    const { status, data } = await apiCall(techToken, 'POST', '/api/sync/offline', {
      records: [{
        id: `offline-comment-new-${Date.now()}`,
        operation: 'create',
        entityType: 'work_order_comment',
        entityId: woId,
        idempotencyKey: generateIdempotencyKey(),
        data: { content: uniqueContent },
        timestamp: new Date().toISOString(),
      }],
    });

    expect(status).toBe(200);
    expect(data.results[0].success).toBe(true);

    const commentsData = await apiCall(
      techToken,
      'GET',
      `/api/work-orders/${woId}/comments`,
    );
    const comments = commentsData.data.data as Array<{ content: string }>;
    expect(comments.some((comment) => comment.content === uniqueContent)).toBe(true);
  });

  await test.step('I4: Offline lifecycle completion cannot be smuggled in as a time log', async () => {
    const techToken = await getToken('tech_single');
    const { status, data } = await apiCall(techToken, 'POST', '/api/sync/offline', {
      records: [{
        id: `offline-invalid-complete-${Date.now()}`,
        operation: 'create',
        entityType: 'work_order_time_log',
        entityId: woId,
        idempotencyKey: generateIdempotencyKey(),
        data: {
          action: 'complete',
          duration: 0.5,
          notes: 'Must not bypass the Repairs completion lifecycle',
        },
        timestamp: new Date().toISOString(),
      }],
    });

    expect(status).toBe(200);
    expect(data.results[0].success).toBe(false);
    expect(String(data.results[0].error)).toContain("must be 'start' or 'resume'");

    const fetched = await getWO(techToken, woId);
    expect(fetched.status).toBe('in_progress');
  });

  await test.step('I5: Closed retrospective labor replays exactly once', async () => {
    const techToken = await getToken('tech_single');
    const timestamp = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const idempotencyKey = generateIdempotencyKey();
    const note = `Offline retrospective labor ${Date.now()}`;
    const record = {
      id: `offline-labor-${Date.now()}`,
      operation: 'create',
      entityType: 'work_order_time_log',
      entityId: woId,
      idempotencyKey,
      data: {
        action: 'resume',
        duration: 0.5,
        notes: note,
        activityType: 'maintenance',
      },
      timestamp,
    };

    const before = await apiCall(
      techToken,
      'GET',
      `/api/work-orders/${woId}/time-logs?includeTeamLogs=true`,
    );
    const beforeLogs = before.data.data.timeLogs as Array<{ notes?: string; duration?: number }>;
    const beforeHours = Number(before.data.data.summary.totalHours || 0);
    expect(beforeLogs.filter((entry) => entry.notes === note)).toHaveLength(0);

    const first = await apiCall(techToken, 'POST', '/api/sync/offline', { records: [record] });
    expect(first.status).toBe(200);
    expect(first.data.results[0]).toMatchObject({ success: true, replayed: false });

    const replay = await apiCall(techToken, 'POST', '/api/sync/offline', { records: [record] });
    expect(replay.status).toBe(200);
    expect(replay.data.results[0]).toMatchObject({ success: true, replayed: true });

    const after = await apiCall(
      techToken,
      'GET',
      `/api/work-orders/${woId}/time-logs?includeTeamLogs=true`,
    );
    const afterLogs = after.data.data.timeLogs as Array<{ notes?: string; duration?: number; action?: string }>;
    const matching = afterLogs.filter((entry) => entry.notes === note);
    expect(matching).toHaveLength(1);
    expect(matching[0].action).toBe('resume');
    expect(matching[0].duration).toBe(0.5);
    expect(Number(after.data.data.summary.totalHours || 0)).toBeCloseTo(beforeHours + 0.5, 2);
  });

  await test.step('I6: Actor-bound offline records fail closed under another login', async () => {
    const techToken = await getToken('tech_single');
    const { status, data } = await apiCall(techToken, 'POST', '/api/sync/offline', {
      records: [{
        id: `offline-wrong-actor-${Date.now()}`,
        operation: 'create',
        entityType: 'work_order_comment',
        entityId: woId,
        originUserId: 'different-technician-id',
        idempotencyKey: generateIdempotencyKey(),
        data: { content: 'This must never be attributed to the current technician' },
        timestamp: new Date().toISOString(),
      }],
    });

    expect(status).toBe(200);
    expect(data.results[0].success).toBe(false);
    expect(String(data.results[0].error)).toContain('different authenticated user');
  });

  await test.step('I7: Server rejects oversized sync batches so clients must chunk at 100', async () => {
    const techToken = await getToken('tech_single');
    const records = Array.from({ length: 101 }, (_, index) => ({
      id: `oversize-${Date.now()}-${index}`,
      operation: 'create',
      entityType: 'unsupported_probe',
      entityId: woId,
      data: {},
      timestamp: new Date().toISOString(),
    }));

    const { status, data } = await apiCall(techToken, 'POST', '/api/sync/offline', { records });
    expect(status).toBe(400);
    expect(data.success).toBe(false);
    expect(String(data.error)).toContain('Maximum 100 records');
  });

  await test.step('I8: Stop the original live session after replay verification', async () => {
    const techToken = await getToken('tech_single');
    const { status, data } = await apiCall(
      techToken,
      'POST',
      `/api/work-orders/${woId}/time-logs/stop`,
      {},
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.closedTimers).toBeGreaterThanOrEqual(1);
  });
});
