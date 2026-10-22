from pathlib import Path

# 1) Runtime permission catalog must define the task module before role grants can resolve.
route = Path('src/app/api/admin/sync-permissions/route.ts')
text = route.read_text()
needle = "  pm_schedules: ['view', 'create', 'update', 'delete', 'activate', 'run'],\n"
entry = "  pm_tasks: ['view', 'create', 'update', 'delete', 'import'],\n"
if entry not in text:
    if needle not in text:
        raise SystemExit('pm_schedules permission definition anchor not found')
    text = text.replace(needle, needle + entry, 1)
route.write_text(text)

schema_test = Path('src/__tests__/pm/pm-task-library-schema-contract.test.ts')
t = schema_test.read_text()
old = "  it('mirrors task permissions into runtime sync', () => { const s = read('src/app/api/admin/sync-permissions/route.ts'); for (const p of ['pm_tasks.view','pm_tasks.create','pm_tasks.update','pm_tasks.delete','pm_tasks.import']) expect(s).toContain(`'${p}'`); });"
new = "  it('mirrors task permissions into runtime sync', () => { const s = read('src/app/api/admin/sync-permissions/route.ts'); expect(s).toContain(\"pm_tasks: ['view', 'create', 'update', 'delete', 'import']\"); for (const p of ['pm_tasks.view','pm_tasks.create','pm_tasks.update','pm_tasks.delete','pm_tasks.import']) expect(s).toContain(`'${p}'`); });"
if old in t:
    t = t.replace(old, new, 1)
elif new not in t:
    raise SystemExit('runtime sync contract anchor not found')
schema_test.write_text(t)

# 2) Batch per-task audit rows into one createMany call so 1,000-row imports do not
#    perform 1,000 sequential audit round-trips inside one interactive transaction.
service = Path('src/services/pm/pmTask.service.ts')
s = service.read_text()
old_loop = """    for (const task of created) {
      await tx.auditLog.create({ data: {
        userId: input.userId, action: 'create', entityType: 'pm_task', entityId: task.id, plantId: input.plantId,
        newValues: JSON.stringify({ taskNumber: task.taskNumber, description: task.description, taskType: task.taskType, isActive: task.isActive, source: input.source }),
      } });
    }
"""
new_loop = """    if (created.length > 0) {
      await tx.auditLog.createMany({ data: created.map((task) => ({
        userId: input.userId, action: 'create', entityType: 'pm_task', entityId: task.id, plantId: input.plantId,
        newValues: JSON.stringify({ taskNumber: task.taskNumber, description: task.description, taskType: task.taskType, isActive: task.isActive, source: input.source }),
      })) });
    }
"""
if old_loop in s:
    s = s.replace(old_loop, new_loop, 1)
elif new_loop not in s:
    raise SystemExit('per-task audit loop anchor not found')
service.write_text(s)

# 3) Restore dedicated service tests required by the approved implementation plan.
service_test = Path('src/services/pm/__tests__/pmTask.service.test.ts')
service_test.parent.mkdir(parents=True, exist_ok=True)
service_test.write_text(r'''import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, tx } = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn(),
    pmTask: {
      aggregate: vi.fn(),
      createManyAndReturn: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
      createMany: vi.fn(),
    },
  };
  const mockDb = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  return { mockDb, tx };
});

vi.mock('@/lib/db', () => ({ db: mockDb }));

import { createPmTaskBatch, deactivatePmTask, updatePmTask } from '@/services/pm/pmTask.service';

const createdTask = (taskNumber: number, description = 'Inspect bearing', taskType = 'mechanical') => ({
  id: `task-${taskNumber}`,
  plantId: 'plant-1',
  taskNumber,
  description,
  taskType,
  isActive: true,
  createdById: 'user-1',
  createdAt: new Date('2026-10-22T00:00:00Z'),
  updatedAt: new Date('2026-10-22T00:00:00Z'),
});

describe('pmTask.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.$executeRaw.mockResolvedValue(0);
    tx.pmTask.aggregate.mockResolvedValue({ _max: { taskNumber: 17 } });
    tx.auditLog.create.mockResolvedValue({ id: 'audit-1' });
    tx.auditLog.createMany.mockResolvedValue({ count: 0 });
  });

  it('rejects invalid rows before opening a transaction', async () => {
    await expect(createPmTaskBatch({
      plantId: 'plant-1', userId: 'user-1', source: 'single',
      rows: [{ description: '', taskType: 'mechanical' }],
    })).rejects.toThrow();
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it('locks the plant number sequence before reading max and assigns contiguous server numbers', async () => {
    const order: string[] = [];
    tx.$executeRaw.mockImplementation(async () => { order.push('lock'); return 0; });
    tx.pmTask.aggregate.mockImplementation(async () => { order.push('aggregate'); return { _max: { taskNumber: 17 } }; });
    tx.pmTask.createManyAndReturn.mockImplementation(async ({ data }: { data: Array<Record<string, unknown>> }) => {
      order.push('create');
      return data.map((row) => createdTask(Number(row.taskNumber), String(row.description), String(row.taskType)));
    });

    const result = await createPmTaskBatch({
      plantId: 'plant-1', userId: 'user-1', source: 'bulk',
      rows: [
        { description: 'Inspect bearing', taskType: 'Mechanical' },
        { description: 'Check motor', taskType: ' ELECTRICAL ' },
      ],
    });

    expect(order.slice(0, 3)).toEqual(['lock', 'aggregate', 'create']);
    expect(result.map((task) => task.taskNumber)).toEqual([18, 19]);
    const createArg = tx.pmTask.createManyAndReturn.mock.calls[0][0];
    expect(createArg.data.map((row: { taskNumber: number }) => row.taskNumber)).toEqual([18, 19]);
  });

  it('never trusts a browser supplied taskNumber or plant ownership field', async () => {
    tx.pmTask.createManyAndReturn.mockImplementation(async ({ data }: { data: Array<Record<string, unknown>> }) =>
      data.map((row) => createdTask(Number(row.taskNumber), String(row.description), String(row.taskType))));

    await createPmTaskBatch({
      plantId: 'plant-1', userId: 'user-1', source: 'single',
      rows: [{ description: 'Inspect bearing', taskType: 'mechanical', taskNumber: 999, plantId: 'plant-evil' } as never],
    });

    expect(tx.pmTask.createManyAndReturn).toHaveBeenCalledWith({ data: [{
      plantId: 'plant-1', taskNumber: 18, description: 'Inspect bearing', taskType: 'mechanical', createdById: 'user-1',
    }] });
  });

  it('batches per-task audit rows and keeps the batch summary in the same transaction', async () => {
    tx.pmTask.createManyAndReturn.mockResolvedValue([createdTask(18), createdTask(19, 'Check motor', 'electrical')]);

    await createPmTaskBatch({
      plantId: 'plant-1', userId: 'user-1', source: 'import', filename: 'tasks.xlsx',
      rows: [
        { description: 'Inspect bearing', taskType: 'mechanical' },
        { description: 'Check motor', taskType: 'electrical' },
      ],
    });

    expect(tx.auditLog.createMany).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.createMany.mock.calls[0][0].data).toHaveLength(2);
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create.mock.calls[0][0].data.entityType).toBe('pm_task_batch');
    expect(tx.auditLog.create.mock.calls[0][0].data.newValues).toContain('tasks.xlsx');
  });

  it('does not write audit records when task creation fails', async () => {
    tx.pmTask.createManyAndReturn.mockRejectedValue(new Error('database write failed'));
    await expect(createPmTaskBatch({
      plantId: 'plant-1', userId: 'user-1', source: 'bulk',
      rows: [{ description: 'Inspect bearing', taskType: 'mechanical' }],
    })).rejects.toThrow('database write failed');
    expect(tx.auditLog.createMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('normalizes updates and audits the before/after values', async () => {
    tx.pmTask.findUnique.mockResolvedValue(createdTask(18));
    tx.pmTask.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...createdTask(18), ...data }));
    const result = await updatePmTask({
      taskId: 'task-18', plantId: 'plant-1', userId: 'user-1',
      patch: { description: '  Check coupling  ', taskType: ' ELECTRICAL ' },
    });
    expect(result.description).toBe('Check coupling');
    expect(result.taskType).toBe('electrical');
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('soft-deactivates and audits without deleting the task', async () => {
    tx.pmTask.findUnique.mockResolvedValue(createdTask(18));
    tx.pmTask.update.mockResolvedValue({ ...createdTask(18), isActive: false });
    const result = await deactivatePmTask({ taskId: 'task-18', plantId: 'plant-1', userId: 'user-1' });
    expect(result.isActive).toBe(false);
    expect(tx.pmTask.update).toHaveBeenCalledWith({ where: { id: 'task-18' }, data: { isActive: false } });
    expect(tx.auditLog.create.mock.calls[0][0].data.action).toBe('deactivate');
  });
});
''')

import_test = Path('src/services/pm/__tests__/pmTaskImport.service.test.ts')
import_test.write_text(r'''import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

const { mockDb } = vi.hoisted(() => ({
  mockDb: { pmTask: { findMany: vi.fn() } },
}));
vi.mock('@/lib/db', () => ({ db: mockDb }));

import {
  PM_TASK_IMPORT_MAX_ROWS,
  buildPmTaskImportPreview,
  buildPmTaskImportTemplate,
  parsePmTaskWorkbook,
} from '@/services/pm/pmTaskImport.service';

function workbookBuffer(rows: unknown[][], headers: unknown[] = ['Task Description', 'Task Type']): Buffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers, ...rows]), 'Tasks');
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}

describe('pmTaskImport.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.pmTask.findMany.mockResolvedValue([]);
  });

  it('builds the documented Tasks and Instructions workbook', () => {
    const workbook = XLSX.read(buildPmTaskImportTemplate(), { type: 'buffer' });
    expect(workbook.SheetNames).toContain('Tasks');
    expect(workbook.SheetNames).toContain('Instructions');
    const tasks = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets.Tasks, { header: 1 });
    expect(tasks[0]).toEqual(['Task Description', 'Task Type']);
  });

  it('parses xlsx rows, ignores blank rows, and accepts xls filename through the same parser', () => {
    const buffer = workbookBuffer([
      ['Inspect bearing', 'Mechanical'],
      ['', ''],
      ['Check motor', 'Electrical'],
    ]);
    const xlsx = parsePmTaskWorkbook(buffer, 'tasks.xlsx');
    const xls = parsePmTaskWorkbook(buffer, 'tasks.xls');
    expect(xlsx.structuralErrors).toEqual([]);
    expect(xlsx.rows.map((row) => row.sourceRow)).toEqual([2, 4]);
    expect(xls.structuralErrors).toEqual([]);
    expect(xls.rows).toHaveLength(2);
  });

  it('fails malformed header structures before preview/database lookup', async () => {
    const parsed = parsePmTaskWorkbook(workbookBuffer([], ['Task Description', 'Task Description', 'Other']), 'tasks.xlsx');
    expect(parsed.structuralErrors.join(' ')).toContain('duplicate required header: Task Description');
    expect(parsed.structuralErrors.join(' ')).toContain('missing required header: Task Type');
    expect(parsed.structuralErrors.join(' ')).toContain('unexpected header(s): Other');
    const preview = await buildPmTaskImportPreview({ parsed, plantId: 'plant-1' });
    expect(preview.structuralErrors.length).toBeGreaterThan(0);
    expect(mockDb.pmTask.findMany).not.toHaveBeenCalled();
  });

  it('enforces the 1,000 nonblank row limit', () => {
    const rows = Array.from({ length: PM_TASK_IMPORT_MAX_ROWS + 1 }, (_, index) => [`Task ${index + 1}`, 'Mechanical']);
    const parsed = parsePmTaskWorkbook(workbookBuffer(rows), 'tasks.xlsx');
    expect(parsed.structuralErrors).toContain('PM task import is limited to 1,000 nonblank rows per workbook');
  });

  it('returns validation errors and duplicate warnings without writing anything', async () => {
    mockDb.pmTask.findMany.mockResolvedValue([
      { id: 'existing-1', taskNumber: 7, description: 'Inspect bearing', taskType: 'mechanical', isActive: true },
    ]);
    const parsed = parsePmTaskWorkbook(workbookBuffer([
      ['Inspect bearing', 'Mechanical'],
      ['Inspect bearing', 'mechanical'],
      ['Bad type task', 'Unknown'],
    ]), 'tasks.xlsx');
    const preview = await buildPmTaskImportPreview({ parsed, plantId: 'plant-1' });
    expect(preview.invalidRows).toBe(1);
    expect(preview.rows[0].warnings.join(' ')).toContain('#7');
    expect(preview.rows[1].warnings.join(' ')).toContain('upload row 2');
    expect(preview.rows[2].errors.length).toBeGreaterThan(0);
    expect(mockDb.pmTask.findMany).toHaveBeenCalledTimes(1);
    expect(Object.keys(mockDb.pmTask)).toEqual(['findMany']);
  });
});
''')
