/**
 * UAT-34: End-to-end PM inspection -> corrective WO -> verified planner close.
 *
 * This test runs only in disposable CI Repairs UAT PostgreSQL (not production).
 * It uses the same role-authenticated APIs as planner, technician and supervisor.
 */
import { test, expect } from '@playwright/test';
import {
  apiCall, assignWO, closeWO, completeWO, getToken, getWO,
  logTime, lookupAssetId, lookupUserByKey, startWO, verifyWO,
} from './helpers/api';

test('UAT-34: real inspection records advance their due date only after the corrective WO is verified and closed', async () => {
  test.setTimeout(150_000);

  const planner = await getToken('planner');
  const technician = await getToken('tech_single');
  const supervisor = await getToken('supervisor');
  const assetId = await lookupAssetId(planner, 'UAT-PUMP-001');
  const technicianId = await lookupUserByKey(planner, 'tech_single');
  const supervisorId = await lookupUserByKey(planner, 'supervisor');

  const components = await apiCall(planner, 'GET',
    '/api/component-registry?assetId=' + encodeURIComponent(assetId) +
    '&search=' + encodeURIComponent('UAT-PUMP-BRG-DE') + '&limit=100');
  expect(components.status).toBe(200);
  const component = (components.data.data as Array<{ id: string; componentCode: string }>)
    .find((part) => part.componentCode === 'UAT-PUMP-BRG-DE');
  expect(component?.id).toBeTruthy();

  const stamp = Date.now().toString(36);
  const name = 'UAT PM bearing temperature ' + stamp;
  const dueAt = new Date(Date.now() - 5 * 60_000);
  const plan = await apiCall(planner, 'POST', '/api/pm-inspections', {
    componentId: component!.id,
    name,
    description: 'UAT-34 bearing temperature check; limit 20-80 C.',
    inspectionType: 'measurement',
    frequency: 'weekly',
    parameterKey: 'uat_bearing_temp_' + stamp,
    unit: 'C', min: 20, max: 80,
    nextInspection: dueAt.toISOString(),
  });
  expect(plan.status, JSON.stringify(plan.data)).toBe(201);
  const pointId = String(plan.data.data?.id || '');
  expect(pointId).toBeTruthy();
  const inspectionPath = '/api/pm-inspections/' + encodeURIComponent(pointId) + '/records';
  const listPath = '/api/pm-inspections?assetId=' + encodeURIComponent(assetId) +
    '&search=' + encodeURIComponent(name);

  async function pointState(extra = '') {
    const result = await apiCall(planner, 'GET', listPath + extra);
    expect(result.status, JSON.stringify(result.data)).toBe(200);
    const item = (result.data.data as Array<any>).find((row) => row.id === pointId);
    expect(item).toBeTruthy();
    return item;
  }

  const previous = await pointState();
  expect(new Date(previous.nextInspection).getTime()).toBe(dueAt.getTime());

  // Even when technician selects Pass, an out-of-range instrument value forces
  // Fail and generates exactly one linked draft corrective work order.
  const failedInput = {
    requestKey: 'uat-temp-fail-' + stamp,
    outcome: 'pass',
    value: '120',
    findings: '',
    recommendation: 'Inspect drive bearing temperature and cooling.',
  };
  const failure = await apiCall(technician, 'POST', inspectionPath, failedInput);
  expect(failure.status, JSON.stringify(failure.data)).toBe(201);
  expect(failure.data.data.record.result).toBe('fail');
  expect(failure.data.data.workOrder.status).toBe('draft');
  expect(failure.data.data.awaitingCloseout).toBe(true);
  const woId = String(failure.data.data.workOrder.id);
  expect(woId).toBeTruthy();

  const afterFailure = await pointState('&followUp=open');
  expect(afterFailure.openCorrectiveWorkOrder?.id).toBe(woId);
  expect(new Date(afterFailure.nextInspection).getTime()).toBe(dueAt.getTime());

  // Retrying a previously committed mobile submission must be exactly-once,
  // and the same key may not be reused with different instrument readings.
  const replay = await apiCall(technician, 'POST', inspectionPath, failedInput);
  expect(replay.status).toBe(200);
  expect(replay.data.data.duplicate).toBe(true);
  expect(replay.data.data.record.id).toBe(failure.data.data.record.id);
  const conflicting = await apiCall(technician, 'POST', inspectionPath, {
    ...failedInput, value: '121',
  });
  expect(conflicting.status).toBe(409);

  // A later passing inspection is evidence, not an authorization to cancel a
  // corrective work order or reset this part's due cycle.
  const passing = await apiCall(technician, 'POST', inspectionPath, {
    requestKey: 'uat-temp-pass-' + stamp, outcome: 'pass', value: '60',
  });
  expect(passing.status, JSON.stringify(passing.data)).toBe(201);
  expect(passing.data.data.record.result).toBe('pass');
  expect(passing.data.data.workOrder?.id).toBe(woId);
  expect(passing.data.data.awaitingCloseout).toBe(true);
  const afterPass = await pointState('&followUp=open');
  expect(afterPass.latestRecord.result).toBe('pass');
  expect(afterPass.openCorrectiveWorkOrder?.id).toBe(woId);
  expect(new Date(afterPass.nextInspection).getTime()).toBe(dueAt.getTime());

  // Exercise the full, authenticated Repairs approval/execution process.
  await assignWO(planner, woId, {
    assignedTo: technicianId,
    assignedSupervisorId: supervisorId,
    teamLeaderId: technicianId,
    teamMembers: [{ userId: technicianId, role: 'team_leader' }],
  });
  await startWO(technician, woId);
  const timerStopped = await apiCall(technician, 'POST',
    '/api/work-orders/' + woId + '/time-logs/stop', {});
  expect(timerStopped.status).toBe(200);
  await logTime(technician, woId, {
    action: 'start', manualHours: 0.25,
    notes: 'Bearing cooling inspection corrective work and retest',
  });
  await completeWO(technician, woId,
    'Corrective cooling action completed and bearing temperature retested.');
  expect((await getWO(planner, woId)).status).toBe('completed');
  expect(new Date((await pointState()).nextInspection).getTime()).toBe(dueAt.getTime());

  await verifyWO(supervisor, woId, 5);
  expect((await getWO(planner, woId)).status).toBe('verified');
  expect(new Date((await pointState()).nextInspection).getTime()).toBe(dueAt.getTime());

  await closeWO(planner, woId);
  expect((await getWO(planner, woId)).status).toBe('closed');
  const closedPoint = await pointState('&followUp=none');
  expect(closedPoint.openCorrectiveWorkOrder).toBeNull();
  expect(new Date(closedPoint.nextInspection).getTime()).toBeGreaterThan(dueAt.getTime());

  // Replaying the initial failed inspection after verified closure must not
  // resurrect the old WO or create a second corrective job.
  const closedReplay = await apiCall(technician, 'POST', inspectionPath, failedInput);
  expect(closedReplay.status).toBe(200);
  expect(closedReplay.data.data.duplicate).toBe(true);
  expect(closedReplay.data.data.awaitingCloseout).toBe(false);
  expect(closedReplay.data.data.workOrder).toBeNull();
});