import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { PmTaskBatchValidationError } from '@/lib/pm-task';

const {
  getSession, hasPermission, isAdmin, getPlantScope, PmTemplateLastActiveTaskError,
  linkPmTasksToTemplate, createAndLinkPmTasks, reorderPmTemplateTasks,
  deactivatePmTemplateTask, convertLegacyPmTemplateTask,
} = vi.hoisted(() => {
  class PmTemplateLastActiveTaskError extends Error {}
  return {
    getSession: vi.fn(), hasPermission: vi.fn(), isAdmin: vi.fn(), getPlantScope: vi.fn(),
    PmTemplateLastActiveTaskError,
    linkPmTasksToTemplate: vi.fn(), createAndLinkPmTasks: vi.fn(), reorderPmTemplateTasks: vi.fn(),
    deactivatePmTemplateTask: vi.fn(), convertLegacyPmTemplateTask: vi.fn(),
  };
});

vi.mock('@/lib/auth', () => ({ getSession, hasPermission, isAdmin }));
vi.mock('@/lib/plant-scope', () => ({ getPlantScope }));
vi.mock('@/services/pm/pmTemplateTaskAssociation.service', () => ({
  linkPmTasksToTemplate, createAndLinkPmTasks, reorderPmTemplateTasks,
  deactivatePmTemplateTask, convertLegacyPmTemplateTask, PmTemplateLastActiveTaskError,
}));

import { POST as postHandler, PUT as putHandler } from '@/app/api/pm-templates/[id]/tasks/route';
import { PATCH as patchHandler, DELETE as deleteHandler } from '@/app/api/pm-templates/[id]/tasks/[taskId]/route';

async function requireRouteResponse<T>(response: T | undefined): Promise<NonNullable<T>> {
  if (response === undefined) throw new Error('Expected route handler to return a response');
  return response as NonNullable<T>;
}

const POST = async (...args: Parameters<typeof postHandler>) => requireRouteResponse(await postHandler(...args));
const PUT = async (...args: Parameters<typeof putHandler>) => requireRouteResponse(await putHandler(...args));
const PATCH = async (...args: Parameters<typeof patchHandler>) => requireRouteResponse(await patchHandler(...args));
const DELETE = async (...args: Parameters<typeof deleteHandler>) => requireRouteResponse(await deleteHandler(...args));

const session = { userId: 'planner-1', permissions: ['pm_templates.update'], roles: ['planner'] };
const collectionParams = { params: Promise.resolve({ id: 'template-1' }) };
const detailParams = { params: Promise.resolve({ id: 'template-1', taskId: 'assoc-1' }) };
const request = (method: string, body?: unknown) => new NextRequest('http://localhost/api/pm-templates/template-1/tasks', {
  method,
  headers: body === undefined ? undefined : { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

describe('PM template Task Library association API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockReturnValue(session);
    hasPermission.mockReturnValue(true);
    isAdmin.mockReturnValue(false);
    getPlantScope.mockResolvedValue({ plantId: 'plant-1', denyAccess: false, allowedPlantIds: ['plant-1'] });
    linkPmTasksToTemplate.mockResolvedValue([{ id: 'assoc-1' }]);
    createAndLinkPmTasks.mockResolvedValue([{ id: 'assoc-new' }]);
    reorderPmTemplateTasks.mockResolvedValue(['assoc-2', 'assoc-1']);
    deactivatePmTemplateTask.mockResolvedValue({ id: 'assoc-1', isActive: false });
    convertLegacyPmTemplateTask.mockResolvedValue({ id: 'assoc-1', pmTaskId: 'task-new' });
  });

  it('rejects unauthenticated and unauthorized callers before association services', async () => {
    getSession.mockReturnValueOnce(null);
    expect((await POST(request('POST', { taskIds: ['task-1'] }), collectionParams)).status).toBe(401);
    getSession.mockReturnValue(session);
    hasPermission.mockReturnValue(false);
    expect((await PUT(request('PUT', { associationIds: ['assoc-1'] }), collectionParams)).status).toBe(403);
    expect(linkPmTasksToTemplate).not.toHaveBeenCalled();
    expect(reorderPmTemplateTasks).not.toHaveBeenCalled();
  });

  it('requires an explicitly selected authorized plant for all mutations', async () => {
    getPlantScope.mockResolvedValue({ plantId: null, denyAccess: false, allowedPlantIds: ['plant-1'] });
    const post = await POST(request('POST', { taskIds: ['task-1'] }), collectionParams);
    const del = await DELETE(request('DELETE'), detailParams);
    expect(post.status).toBe(400);
    expect(del.status).toBe(400);
    expect(linkPmTasksToTemplate).not.toHaveBeenCalled();
    expect(deactivatePmTemplateTask).not.toHaveBeenCalled();
  });

  it('links existing Task Masters and never accepts client plant ownership', async () => {
    const response = await POST(request('POST', { taskIds: ['task-2', 'task-7'], plantId: 'plant-evil' }), collectionParams);
    expect(response.status).toBe(201);
    expect(linkPmTasksToTemplate).toHaveBeenCalledWith({
      templateId: 'template-1', plantId: 'plant-1', userId: 'planner-1', pmTaskIds: ['task-2', 'task-7'],
    });
  });

  it('rejects cross-plant Task Master ids and duplicate ids through canonical service validation', async () => {
    linkPmTasksToTemplate.mockRejectedValueOnce(new Error('One or more Task Masters are unavailable, inactive, or not in the same plant'));
    const crossPlant = await POST(request('POST', { taskIds: ['foreign-task'] }), collectionParams);
    expect(crossPlant.status).toBe(403);

    linkPmTasksToTemplate.mockRejectedValueOnce(new Error('Task Master IDs must not contain duplicate IDs'));
    const duplicate = await POST(request('POST', { taskIds: ['task-1', 'task-1'] }), collectionParams);
    expect(duplicate.status).toBe(400);
  });

  it('creates and links new task rows while preserving row-level canonical validation errors', async () => {
    const rows = [{ description: 'Inspect coupling', taskType: 'Mechanical' }];
    const response = await POST(request('POST', { newTasks: rows }), collectionParams);
    expect(response.status).toBe(201);
    expect(createAndLinkPmTasks).toHaveBeenCalledWith({
      templateId: 'template-1', plantId: 'plant-1', userId: 'planner-1', rows,
    });

    createAndLinkPmTasks.mockRejectedValueOnce(new PmTaskBatchValidationError([
      { row: 1, messages: ['Task description is required'] },
    ]));
    const invalid = await POST(request('POST', { newTasks: [{ description: '', taskType: 'Mechanical' }] }), collectionParams);
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).rowErrors).toEqual([{ row: 1, messages: ['Task description is required'] }]);
  });

  it('rejects ambiguous POST bodies rather than creating hidden template-only tasks', async () => {
    expect((await POST(request('POST', { taskIds: ['task-1'], newTasks: [{ description: 'X', taskType: 'mechanical' }] }), collectionParams)).status).toBe(400);
    expect((await POST(request('POST', { description: 'legacy copied task', taskType: 'check' }), collectionParams)).status).toBe(400);
    expect(linkPmTasksToTemplate).not.toHaveBeenCalled();
    expect(createAndLinkPmTasks).not.toHaveBeenCalled();
  });

  it('delegates exact-set reorder using association ids, not Task Master numbers', async () => {
    const response = await PUT(request('PUT', { associationIds: ['assoc-2', 'assoc-1'] }), collectionParams);
    expect(response.status).toBe(200);
    expect(reorderPmTemplateTasks).toHaveBeenCalledWith({
      templateId: 'template-1', plantId: 'plant-1', userId: 'planner-1', associationIds: ['assoc-2', 'assoc-1'],
    });
  });

  it('validates explicit legacy conversion discipline and delegates conversion', async () => {
    const invalid = await PATCH(request('PATCH', { convertLegacy: { taskType: 'instrumentation' } }), detailParams);
    expect(invalid.status).toBe(400);
    expect(convertLegacyPmTemplateTask).not.toHaveBeenCalled();

    const valid = await PATCH(request('PATCH', { convertLegacy: { taskType: 'Lubrication' } }), detailParams);
    expect(valid.status).toBe(200);
    expect(convertLegacyPmTemplateTask).toHaveBeenCalledWith({
      templateId: 'template-1', associationId: 'assoc-1', plantId: 'plant-1', userId: 'planner-1', taskType: 'lubrication',
    });
  });

  it('soft-removes only the template association and maps last-active-task safety to conflict', async () => {
    const response = await DELETE(request('DELETE'), detailParams);
    expect(response.status).toBe(200);
    expect(deactivatePmTemplateTask).toHaveBeenCalledWith({
      templateId: 'template-1', associationId: 'assoc-1', plantId: 'plant-1', userId: 'planner-1',
    });

    deactivatePmTemplateTask.mockRejectedValueOnce(new PmTemplateLastActiveTaskError('Cannot remove the last active task while active PM schedule \"Bearing PM\" uses this template'));
    const conflict = await DELETE(request('DELETE'), detailParams);
    expect(conflict.status).toBe(409);
  });
});
