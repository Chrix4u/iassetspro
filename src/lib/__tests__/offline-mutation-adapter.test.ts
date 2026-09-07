import { describe, expect, it } from 'vitest';
import { buildOfflineMutationDescriptor } from '@/lib/api';

function jsonBody(value: Record<string, unknown>): string {
  return JSON.stringify(value);
}

describe('buildOfflineMutationDescriptor', () => {
  it('maps a work-order comment to the supported offline replay contract', () => {
    const descriptor = buildOfflineMutationDescriptor(
      '/api/work-orders/wo-1/comments',
      'POST',
      jsonBody({ content: 'Bearing inspected' }),
    );

    expect(descriptor).toMatchObject({
      operation: 'create',
      entityType: 'work_order_comment',
      entityId: 'wo-1',
      data: { content: 'Bearing inspected' },
    });
    expect(descriptor?.data.idempotencyKey).toEqual(expect.any(String));
  });

  it('maps a task patch and binds the task id into replay data', () => {
    const descriptor = buildOfflineMutationDescriptor(
      '/api/work-orders/wo-1/tasks/task-9',
      'PATCH',
      jsonBody({ status: 'completed' }),
    );

    expect(descriptor).toMatchObject({
      operation: 'update',
      entityType: 'work_order_task',
      entityId: 'wo-1',
      data: {
        taskId: 'task-9',
        status: 'completed',
      },
    });
    expect(descriptor?.data.idempotencyKey).toEqual(expect.any(String));
  });

  it('maps live measurement thresholds to the offline replay field names', () => {
    const descriptor = buildOfflineMutationDescriptor(
      '/api/work-orders/wo-2/measurements',
      'POST',
      jsonBody({
        parameterKey: 'Temperature',
        value: 88.5,
        unit: '°C',
        acceptableMin: 20,
        acceptableMax: 80,
      }),
    );

    expect(descriptor).toMatchObject({
      operation: 'create',
      entityType: 'work_order_measurement',
      entityId: 'wo-2',
      data: {
        parameterKey: 'Temperature',
        value: 88.5,
        unit: '°C',
        minThreshold: 20,
        maxThreshold: 80,
      },
    });
    expect(descriptor?.data).not.toHaveProperty('acceptableMin');
    expect(descriptor?.data).not.toHaveProperty('acceptableMax');
  });

  it('maps an assistance request to the supported offline replay contract', () => {
    const descriptor = buildOfflineMutationDescriptor(
      '/api/work-orders/wo-3/team-member-requests',
      'POST',
      jsonBody({
        reason: 'Need electrical isolation support',
        requestedUserId: null,
        tradeSkill: 'Electrician',
      }),
    );

    expect(descriptor).toMatchObject({
      operation: 'create',
      entityType: 'work_order_assistance',
      entityId: 'wo-3',
      data: {
        reason: 'Need electrical isolation support',
        requestedUserId: null,
        tradeSkill: 'Electrician',
      },
    });
  });

  it('preserves an existing idempotency key instead of replacing it', () => {
    const descriptor = buildOfflineMutationDescriptor(
      '/api/work-orders/wo-1/comments',
      'POST',
      jsonBody({ content: 'Retry me', idempotencyKey: 'client-key-123' }),
    );

    expect(descriptor?.data.idempotencyKey).toBe('client-key-123');
  });

  it.each([
    ['/api/work-orders/wo-1/start', 'POST'],
    ['/api/work-orders/wo-1/hold', 'POST'],
    ['/api/work-orders/wo-1/resume', 'POST'],
    ['/api/repairs/completion/wo-1', 'POST'],
    ['/api/work-orders/wo-1/time-logs', 'POST'],
  ])('never converts lifecycle endpoint %s into an offline queue mutation', (endpoint, method) => {
    const descriptor = buildOfflineMutationDescriptor(
      endpoint,
      method,
      jsonBody({ action: 'start', duration: 1 }),
    );

    expect(descriptor).toBeNull();
  });

  it('ignores unsupported methods and malformed bodies', () => {
    expect(buildOfflineMutationDescriptor(
      '/api/work-orders/wo-1/comments',
      'GET',
      jsonBody({ content: 'Nope' }),
    )).toBeNull();

    expect(buildOfflineMutationDescriptor(
      '/api/work-orders/wo-1/comments',
      'POST',
      'not-json',
    )).toBeNull();
  });
});
