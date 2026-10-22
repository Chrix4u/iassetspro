from pathlib import Path
import re
import textwrap

ROOT = Path(__file__).resolve().parents[1]


def write(rel: str, content: str) -> None:
    path = ROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(textwrap.dedent(content).lstrip(), encoding='utf-8')


def patch(rel: str, transform) -> None:
    path = ROOT / rel
    text = path.read_text(encoding='utf-8')
    updated = transform(text)
    if updated != text:
        path.write_text(updated, encoding='utf-8')
        print(f'patched: {rel}')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise RuntimeError(f'missing patch target for {label}')
    return text.replace(old, new, 1)


def patch_role(text: str, role: str, permissions: list[str]) -> str:
    pattern = re.compile(rf'(^\s*{re.escape(role)}:\s*\[\n)(.*?)(^\s*\],)', re.M | re.S)
    match = pattern.search(text)
    if not match:
        raise RuntimeError(f'role block not found: {role}')
    body = match.group(2)
    missing = [p for p in permissions if f"'{p}'" not in body]
    if not missing:
        return text
    addition = "    " + ", ".join(repr(p) for p in missing) + ",\n"
    return text[:match.start(3)] + addition + text[match.start(3):]


# Additive Prisma model only.
def patch_schema(text: str) -> str:
    if 'pmTasksCreated' not in text:
        text = replace_once(
            text,
            '  pmTemplatesCreated    PmTemplate[]                @relation("PmTemplateCreatedBy")\n',
            '  pmTemplatesCreated    PmTemplate[]                @relation("PmTemplateCreatedBy")\n'
            '  pmTasksCreated        PmTask[]                    @relation("PmTaskCreatedBy")\n',
            'User.pmTasksCreated',
        )
    if re.search(r'^\s*pmTasks\s+PmTask\[\]', text, re.M) is None:
        text = replace_once(
            text,
            '  inventoryItems InventoryItem[]\n',
            '  inventoryItems InventoryItem[]\n  pmTasks        PmTask[]\n',
            'Plant.pmTasks',
        )
    if 'model PmTask {' not in text:
        model = '''
model PmTask {
  id          String   @id @default(cuid())
  plantId     String
  taskNumber  Int
  description String
  taskType    String
  isActive    Boolean  @default(true)
  createdById String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  plant     Plant @relation(fields: [plantId], references: [id], onDelete: Cascade)
  createdBy User  @relation("PmTaskCreatedBy", fields: [createdById], references: [id])

  @@unique([plantId, taskNumber])
  @@index([plantId, taskType, isActive])
  @@map("pm_tasks")
}

'''
        text = replace_once(text, 'model PmTemplateTask {', model + 'model PmTemplateTask {', 'PmTask model')
    return text

patch('prisma/schema.prisma', patch_schema)

write('prisma/migrations/20261022131500_add_pm_task_master/migration.sql', r'''
CREATE TABLE "pm_tasks" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "taskNumber" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pm_tasks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "pm_tasks_plantId_taskNumber_key" ON "pm_tasks"("plantId", "taskNumber");
CREATE INDEX "pm_tasks_plantId_taskType_isActive_idx" ON "pm_tasks"("plantId", "taskType", "isActive");
ALTER TABLE "pm_tasks" ADD CONSTRAINT "pm_tasks_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "plants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pm_tasks" ADD CONSTRAINT "pm_tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
''')

# Permission catalogs and role grants.
permission_files = [
    'prisma/seed-permissions-only.ts',
    'prisma/seed.ts',
    'prisma/seed-all.ts',
    'prisma/seed-missing.ts',
]
for rel in permission_files:
    def transform(text: str, rel=rel) -> str:
        if "pm_tasks: ['view', 'create', 'update', 'delete', 'import']" not in text:
            text = replace_once(
                text,
                "  pm_schedules: ['view', 'create', 'update', 'delete', 'activate', 'run'],\n",
                "  pm_schedules: ['view', 'create', 'update', 'delete', 'activate', 'run'],\n"
                "  pm_tasks: ['view', 'create', 'update', 'delete', 'import'],\n",
                f'{rel} task permission catalog',
            )
        text = patch_role(text, 'plant_manager', ['pm_tasks.view'])
        text = patch_role(text, 'maintenance_manager', ['pm_tasks.view', 'pm_tasks.create', 'pm_tasks.update', 'pm_tasks.delete', 'pm_tasks.import'])
        text = patch_role(text, 'maintenance_planner', ['pm_tasks.view', 'pm_tasks.create', 'pm_tasks.update', 'pm_tasks.delete', 'pm_tasks.import'])
        return text
    patch(rel, transform)


def patch_runtime(text: str) -> str:
    text = patch_role(text, 'plant_manager', ['pm_tasks.view'])
    text = patch_role(text, 'maintenance_manager', ['pm_tasks.view', 'pm_tasks.create', 'pm_tasks.update', 'pm_tasks.delete', 'pm_tasks.import'])
    text = patch_role(text, 'maintenance_planner', ['pm_tasks.view', 'pm_tasks.create', 'pm_tasks.update', 'pm_tasks.delete', 'pm_tasks.import'])
    return text
patch('src/app/api/admin/sync-permissions/route.ts', patch_runtime)

# Canonical task validation.
write('src/lib/pm-task.ts', r'''
export const PM_TASK_TYPES = ['mechanical', 'electrical', 'plumbing', 'lubrication'] as const;
export type PmTaskType = (typeof PM_TASK_TYPES)[number];
export const PM_TASK_TYPE_LABELS: Record<PmTaskType, string> = {
  mechanical: 'Mechanical', electrical: 'Electrical', plumbing: 'Plumbing', lubrication: 'Lubrication',
};
export interface PmTaskDraft { description: string; taskType: string; }
export interface NormalizedPmTaskDraft { description: string; taskType: PmTaskType; }
export interface PmTaskRowError { row: number; messages: string[]; }
export interface PmTaskBatchValidationResult { rows: NormalizedPmTaskDraft[]; rowErrors: PmTaskRowError[]; }

function validateAndNormalize(input: PmTaskDraft): { value?: NormalizedPmTaskDraft; messages: string[] } {
  const messages: string[] = [];
  const description = typeof input?.description === 'string' ? input.description.trim() : '';
  const rawType = typeof input?.taskType === 'string' ? input.taskType.trim().toLowerCase() : '';
  if (!description) messages.push('Task description is required');
  if (!PM_TASK_TYPES.includes(rawType as PmTaskType)) {
    messages.push(`Task type must be one of: ${PM_TASK_TYPES.map((type) => PM_TASK_TYPE_LABELS[type]).join(', ')}`);
  }
  if (messages.length > 0) return { messages };
  return { value: { description, taskType: rawType as PmTaskType }, messages };
}
export function normalizePmTaskDraft(input: PmTaskDraft): NormalizedPmTaskDraft {
  const result = validateAndNormalize(input);
  if (!result.value) throw new Error(result.messages.join('; '));
  return result.value;
}
export function validatePmTaskBatch(rows: PmTaskDraft[]): PmTaskBatchValidationResult {
  if (!Array.isArray(rows) || rows.length === 0) return { rows: [], rowErrors: [{ row: 0, messages: ['At least one task is required'] }] };
  const normalized: NormalizedPmTaskDraft[] = [];
  const rowErrors: PmTaskRowError[] = [];
  rows.forEach((row, index) => {
    const result = validateAndNormalize(row);
    if (result.value) normalized.push(result.value); else rowErrors.push({ row: index + 1, messages: result.messages });
  });
  return { rows: normalized, rowErrors };
}
export class PmTaskBatchValidationError extends Error {
  readonly rowErrors: PmTaskRowError[];
  constructor(rowErrors: PmTaskRowError[]) { super('Task batch validation failed'); this.name = 'PmTaskBatchValidationError'; this.rowErrors = rowErrors; }
}
''')

# Transactional server-only numbering and mutation service.
write('src/services/pm/pmTask.service.ts', r'''
import type { PmTask } from '@prisma/client';
import { db } from '@/lib/db';
import { PmTaskBatchValidationError, normalizePmTaskDraft, validatePmTaskBatch, type PmTaskDraft } from '@/lib/pm-task';
export type PmTaskBatchSource = 'single' | 'bulk' | 'import';
export interface CreatePmTaskBatchInput { plantId: string; userId: string; rows: PmTaskDraft[]; source: PmTaskBatchSource; filename?: string; }

export async function createPmTaskBatch(input: CreatePmTaskBatchInput): Promise<PmTask[]> {
  const validation = validatePmTaskBatch(input.rows);
  if (validation.rowErrors.length > 0) throw new PmTaskBatchValidationError(validation.rowErrors);
  return db.$transaction(async (tx) => {
    const lockKey = `iassetspro:pm-task-number:${input.plantId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
    const current = await tx.pmTask.aggregate({ where: { plantId: input.plantId }, _max: { taskNumber: true } });
    const firstTaskNumber = (current._max.taskNumber ?? 0) + 1;
    const created = await tx.pmTask.createManyAndReturn({ data: validation.rows.map((row, index) => ({
      plantId: input.plantId, taskNumber: firstTaskNumber + index, description: row.description, taskType: row.taskType, createdById: input.userId,
    })) });
    for (const task of created) {
      await tx.auditLog.create({ data: {
        userId: input.userId, action: 'create', entityType: 'pm_task', entityId: task.id, plantId: input.plantId,
        newValues: JSON.stringify({ taskNumber: task.taskNumber, description: task.description, taskType: task.taskType, isActive: task.isActive, source: input.source }),
      } });
    }
    if (input.source === 'bulk' || input.source === 'import') {
      await tx.auditLog.create({ data: {
        userId: input.userId, action: 'create', entityType: 'pm_task_batch', plantId: input.plantId,
        newValues: JSON.stringify({ source: input.source, filename: input.filename ?? null, rowCount: created.length, createdTaskIds: created.map((task) => task.id) }),
      } });
    }
    return created;
  });
}
export interface UpdatePmTaskInput { taskId: string; plantId: string; userId: string; patch: { description?: string; taskType?: string; isActive?: boolean }; }
export async function updatePmTask(input: UpdatePmTaskInput): Promise<PmTask> {
  return db.$transaction(async (tx) => {
    const existing = await tx.pmTask.findUnique({ where: { id: input.taskId } });
    if (!existing || existing.plantId !== input.plantId) throw new Error('PM task not found');
    const data: { description?: string; taskType?: string; isActive?: boolean } = {};
    if (input.patch.description !== undefined || input.patch.taskType !== undefined) {
      const normalized = normalizePmTaskDraft({ description: input.patch.description ?? existing.description, taskType: input.patch.taskType ?? existing.taskType });
      if (input.patch.description !== undefined) data.description = normalized.description;
      if (input.patch.taskType !== undefined) data.taskType = normalized.taskType;
    }
    if (input.patch.isActive !== undefined) data.isActive = input.patch.isActive;
    if (Object.keys(data).length === 0) throw new Error('No PM task changes were provided');
    const updated = await tx.pmTask.update({ where: { id: input.taskId }, data });
    await tx.auditLog.create({ data: {
      userId: input.userId, action: 'update', entityType: 'pm_task', entityId: updated.id, plantId: input.plantId,
      oldValues: JSON.stringify({ description: existing.description, taskType: existing.taskType, isActive: existing.isActive }),
      newValues: JSON.stringify({ description: updated.description, taskType: updated.taskType, isActive: updated.isActive }),
    } });
    return updated;
  });
}
export async function deactivatePmTask(input: Omit<UpdatePmTaskInput, 'patch'>): Promise<PmTask> {
  return db.$transaction(async (tx) => {
    const existing = await tx.pmTask.findUnique({ where: { id: input.taskId } });
    if (!existing || existing.plantId !== input.plantId) throw new Error('PM task not found');
    const updated = await tx.pmTask.update({ where: { id: input.taskId }, data: { isActive: false } });
    await tx.auditLog.create({ data: {
      userId: input.userId, action: 'deactivate', entityType: 'pm_task', entityId: updated.id, plantId: input.plantId,
      oldValues: JSON.stringify({ isActive: existing.isActive }), newValues: JSON.stringify({ isActive: updated.isActive }),
    } });
    return updated;
  });
}
''')

# CRUD routes.
write('src/app/api/pm-tasks/route.ts', r'''
import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantFilterWhere, getPlantScope } from '@/lib/plant-scope';
import { PM_TASK_TYPES, PmTaskBatchValidationError, type PmTaskType } from '@/lib/pm-task';
import { createPmTaskBatch } from '@/services/pm/pmTask.service';
export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasPermission(session, 'pm_tasks.view') && !isAdmin(session)) return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim();
    const type = searchParams.get('type')?.trim().toLowerCase();
    const active = searchParams.get('active');
    const where = { ...getPlantFilterWhere(plantScope) } as Prisma.PmTaskWhereInput;
    if (search) {
      const numeric = Number(search.replace(/^#/, ''));
      where.OR = [{ description: { contains: search, mode: 'insensitive' } }, ...(Number.isInteger(numeric) && numeric > 0 ? [{ taskNumber: numeric }] : [])];
    }
    if (type) {
      if (!PM_TASK_TYPES.includes(type as PmTaskType)) return NextResponse.json({ success: false, error: 'Invalid PM task type' }, { status: 400 });
      where.taskType = type;
    }
    if (active !== null) where.isActive = active === 'true';
    const tasks = await db.pmTask.findMany({ where, include: {
      plant: { select: { id: true, name: true, code: true } }, createdBy: { select: { id: true, fullName: true, username: true } },
    }, orderBy: { taskNumber: 'asc' } });
    return NextResponse.json({ success: true, data: tasks });
  } catch (error: unknown) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to load PM tasks' }, { status: 500 }); }
}
export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasPermission(session, 'pm_tasks.create') && !isAdmin(session)) return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    if (!plantScope.plantId) return NextResponse.json({ success: false, error: 'Select a plant before creating PM tasks' }, { status: 400 });
    const body = await request.json();
    try {
      const created = await createPmTaskBatch({ plantId: plantScope.plantId, userId: session.userId, source: 'single', rows: [{ description: body?.description, taskType: body?.taskType }] });
      return NextResponse.json({ success: true, data: created[0] }, { status: 201 });
    } catch (error: unknown) {
      if (error instanceof PmTaskBatchValidationError) return NextResponse.json({ success: false, error: error.message, rowErrors: error.rowErrors }, { status: 400 });
      throw error;
    }
  } catch (error: unknown) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to create PM task' }, { status: 500 }); }
}
''')

write('src/app/api/pm-tasks/[id]/route.ts', r'''
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';
import { deactivatePmTask, updatePmTask } from '@/services/pm/pmTask.service';
function isPmTaskInputError(error: unknown): error is Error {
  return error instanceof Error && (error.message.startsWith('Task description') || error.message.startsWith('Task type') || error.message === 'No PM task changes were provided');
}
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasPermission(session, 'pm_tasks.view') && !isAdmin(session)) return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    const { id } = await params;
    const task = await db.pmTask.findUnique({ where: { id }, include: { plant: { select: { id: true, name: true, code: true } }, createdBy: { select: { id: true, fullName: true, username: true } } } });
    if (!task) return NextResponse.json({ success: false, error: 'PM task not found' }, { status: 404 });
    if (!canAccessPlantStrict(plantScope, task.plantId)) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    return NextResponse.json({ success: true, data: task });
  } catch (error: unknown) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to load PM task' }, { status: 500 }); }
}
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasPermission(session, 'pm_tasks.update') && !isAdmin(session)) return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    if (!plantScope.plantId) return NextResponse.json({ success: false, error: 'Select a plant before editing PM tasks' }, { status: 400 });
    const { id } = await params;
    const task = await db.pmTask.findUnique({ where: { id }, select: { id: true, plantId: true } });
    if (!task) return NextResponse.json({ success: false, error: 'PM task not found' }, { status: 404 });
    if (!canAccessPlantStrict(plantScope, task.plantId) || task.plantId !== plantScope.plantId) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    const body = await request.json();
    if (body?.isActive !== undefined && typeof body.isActive !== 'boolean') return NextResponse.json({ success: false, error: 'Task active state must be true or false' }, { status: 400 });
    try {
      const updated = await updatePmTask({ taskId: id, plantId: plantScope.plantId, userId: session.userId, patch: {
        ...(body?.description !== undefined ? { description: body.description } : {}), ...(body?.taskType !== undefined ? { taskType: body.taskType } : {}), ...(body?.isActive !== undefined ? { isActive: body.isActive } : {}),
      } });
      return NextResponse.json({ success: true, data: updated });
    } catch (error: unknown) {
      if (isPmTaskInputError(error)) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
      if (error instanceof Error && error.message === 'PM task not found') return NextResponse.json({ success: false, error: error.message }, { status: 404 });
      throw error;
    }
  } catch (error: unknown) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to update PM task' }, { status: 500 }); }
}
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasPermission(session, 'pm_tasks.delete') && !isAdmin(session)) return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    if (!plantScope.plantId) return NextResponse.json({ success: false, error: 'Select a plant before deactivating PM tasks' }, { status: 400 });
    const { id } = await params;
    const task = await db.pmTask.findUnique({ where: { id }, select: { id: true, plantId: true } });
    if (!task) return NextResponse.json({ success: false, error: 'PM task not found' }, { status: 404 });
    if (!canAccessPlantStrict(plantScope, task.plantId) || task.plantId !== plantScope.plantId) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    const updated = await deactivatePmTask({ taskId: id, plantId: plantScope.plantId, userId: session.userId });
    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to deactivate PM task' }, { status: 500 }); }
}
''')

write('src/app/api/pm-tasks/bulk/route.ts', r'''
import { NextRequest, NextResponse } from 'next/server';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope } from '@/lib/plant-scope';
import { PmTaskBatchValidationError } from '@/lib/pm-task';
import { createPmTaskBatch } from '@/services/pm/pmTask.service';
export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasPermission(session, 'pm_tasks.create') && !isAdmin(session)) return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    if (!plantScope.plantId) return NextResponse.json({ success: false, error: 'Select a plant before creating PM tasks' }, { status: 400 });
    const body = await request.json();
    if (!Array.isArray(body?.rows) || body.rows.length === 0) return NextResponse.json({ success: false, error: 'At least one task row is required' }, { status: 400 });
    try {
      const created = await createPmTaskBatch({ plantId: plantScope.plantId, userId: session.userId, source: 'bulk', rows: body.rows });
      return NextResponse.json({ success: true, data: created, count: created.length }, { status: 201 });
    } catch (error: unknown) {
      if (error instanceof PmTaskBatchValidationError) return NextResponse.json({ success: false, error: error.message, rowErrors: error.rowErrors }, { status: 400 });
      throw error;
    }
  } catch (error: unknown) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to create PM tasks' }, { status: 500 }); }
}
''')

# Excel import service and endpoints.
write('src/services/pm/pmTaskImport.service.ts', r'''
import * as XLSX from 'xlsx';
import { db } from '@/lib/db';
import { PM_TASK_TYPE_LABELS, validatePmTaskBatch } from '@/lib/pm-task';
export const PM_TASK_IMPORT_MAX_BYTES = 10 * 1024 * 1024;
export const PM_TASK_IMPORT_MAX_ROWS = 1000;
const REQUIRED_HEADERS = ['Task Description', 'Task Type'] as const;
export interface ParsedPmTaskImport { filename: string; rows: Array<{ sourceRow: number; description: string; taskType: string }>; structuralErrors: string[]; }
export interface PmTaskImportPreviewRow { sourceRow: number; description: string; taskType: string; errors: string[]; warnings: string[]; }
export interface PmTaskImportPreview { filename: string; totalRows: number; validRows: number; invalidRows: number; warningCount: number; structuralErrors: string[]; rows: PmTaskImportPreviewRow[]; }
const cellText = (value: unknown): string => String(value ?? '').trim();
const duplicateIdentity = (value: string): string => value.toLowerCase().trim().replace(/\s+/g, ' ');
export function buildPmTaskImportTemplate(): Buffer {
  const workbook = XLSX.utils.book_new();
  const tasks = XLSX.utils.aoa_to_sheet([['Task Description', 'Task Type']]);
  tasks['!cols'] = [{ wch: 48 }, { wch: 18 }]; XLSX.utils.book_append_sheet(workbook, tasks, 'Tasks');
  const instructions = XLSX.utils.aoa_to_sheet([
    ['PM Task Import Instructions'], ['1. Enter one maintenance task per row on the Tasks sheet.'], ['2. Task Description is required.'],
    [`3. Task Type must be one of: ${Object.values(PM_TASK_TYPE_LABELS).join(', ')}.`],
    ['4. Do not add a Task Number column; Task Number is generated by iAssetsPro when the import is confirmed.'],
    ['5. Blank rows are ignored. Duplicate descriptions are shown as warnings for review and are not auto-merged.'],
  ]);
  instructions['!cols'] = [{ wch: 110 }]; XLSX.utils.book_append_sheet(workbook, instructions, 'Instructions');
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}
export function parsePmTaskWorkbook(buffer: Buffer, filename: string): ParsedPmTaskImport {
  const structuralErrors: string[] = [];
  if (!/\.(xlsx|xls)$/i.test(filename)) return { filename, rows: [], structuralErrors: ['Only .xlsx or .xls PM task workbooks are accepted'] };
  let workbook: XLSX.WorkBook;
  try { workbook = XLSX.read(buffer, { type: 'buffer', cellFormula: false, cellDates: false, bookVBA: false, WTF: false }); }
  catch { return { filename, rows: [], structuralErrors: ['Workbook could not be read as a valid Excel file'] }; }
  const sheet = workbook.Sheets.Tasks;
  if (!sheet) return { filename, rows: [], structuralErrors: ['Workbook is missing the required Tasks sheet'] };
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true, blankrows: true });
  const headerCells = (matrix[0] ?? []).map(cellText);
  for (const required of REQUIRED_HEADERS) {
    const count = headerCells.filter((header) => header === required).length;
    if (count === 0) structuralErrors.push(`Tasks sheet is missing required header: ${required}`);
    if (count > 1) structuralErrors.push(`Tasks sheet contains duplicate required header: ${required}`);
  }
  const unexpected = headerCells.filter((header) => header && !REQUIRED_HEADERS.includes(header as typeof REQUIRED_HEADERS[number]));
  if (unexpected.length > 0) structuralErrors.push(`Tasks sheet contains unexpected header(s): ${unexpected.join(', ')}`);
  if (structuralErrors.length > 0) return { filename, rows: [], structuralErrors };
  const descriptionIndex = headerCells.indexOf('Task Description'); const typeIndex = headerCells.indexOf('Task Type');
  const rows: ParsedPmTaskImport['rows'] = [];
  for (let index = 1; index < matrix.length; index += 1) {
    const row = matrix[index] ?? []; const description = cellText(row[descriptionIndex]); const taskType = cellText(row[typeIndex]);
    if (!description && !taskType) continue;
    rows.push({ sourceRow: index + 1, description, taskType });
    if (rows.length > PM_TASK_IMPORT_MAX_ROWS) { structuralErrors.push('PM task import is limited to 1,000 nonblank rows per workbook'); break; }
  }
  return { filename, rows, structuralErrors };
}
export async function buildPmTaskImportPreview(input: { parsed: ParsedPmTaskImport; plantId: string }): Promise<PmTaskImportPreview> {
  if (input.parsed.structuralErrors.length > 0) return {
    filename: input.parsed.filename, totalRows: input.parsed.rows.length, validRows: 0, invalidRows: input.parsed.rows.length, warningCount: 0,
    structuralErrors: [...input.parsed.structuralErrors], rows: input.parsed.rows.map((row) => ({ ...row, errors: [], warnings: [] })),
  };
  const existing = input.parsed.rows.length > 0 ? await db.pmTask.findMany({ where: { plantId: input.plantId }, select: { id: true, taskNumber: true, description: true, taskType: true, isActive: true } }) : [];
  const existingByDescription = new Map<string, typeof existing>();
  for (const task of existing) { const key = duplicateIdentity(task.description); existingByDescription.set(key, [...(existingByDescription.get(key) ?? []), task]); }
  const seenUploadKeys = new Map<string, number>();
  const rows: PmTaskImportPreviewRow[] = input.parsed.rows.map((row) => {
    const validation = validatePmTaskBatch([{ description: row.description, taskType: row.taskType }]);
    const errors = validation.rowErrors.flatMap((entry) => entry.messages); const normalized = validation.rows[0];
    const description = normalized?.description ?? row.description.trim(); const taskType = normalized?.taskType ?? row.taskType.trim().toLowerCase(); const warnings: string[] = [];
    if (normalized) {
      const uploadKey = `${duplicateIdentity(description)}::${normalized.taskType}`; const firstRow = seenUploadKeys.get(uploadKey);
      if (firstRow !== undefined) warnings.push(`Possible duplicate of upload row ${firstRow}`); else seenUploadKeys.set(uploadKey, row.sourceRow);
      const matches = existingByDescription.get(duplicateIdentity(description)) ?? [];
      if (matches.length > 0) warnings.push(`Possible duplicate of existing PM task${matches.length > 1 ? 's' : ''}: ${matches.map((task) => `#${task.taskNumber}`).join(', ')}`);
    }
    return { sourceRow: row.sourceRow, description, taskType, errors, warnings };
  });
  const invalidRows = rows.filter((row) => row.errors.length > 0).length;
  return { filename: input.parsed.filename, totalRows: rows.length, validRows: rows.length - invalidRows, invalidRows, warningCount: rows.reduce((count, row) => count + row.warnings.length, 0), structuralErrors: [], rows };
}
''')

write('src/app/api/pm-tasks/import-template/route.ts', r'''
import { NextRequest, NextResponse } from 'next/server';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { buildPmTaskImportTemplate } from '@/services/pm/pmTaskImport.service';
export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  if (!hasPermission(session, 'pm_tasks.import') && !isAdmin(session)) return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
  const workbook = buildPmTaskImportTemplate();
  return new NextResponse(new Uint8Array(workbook), { status: 200, headers: {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="pm-task-import-template.xlsx"', 'Cache-Control': 'no-store',
  } });
}
''')
write('src/app/api/pm-tasks/import-preview/route.ts', r'''
import { NextRequest, NextResponse } from 'next/server';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope } from '@/lib/plant-scope';
import { PM_TASK_IMPORT_MAX_BYTES, buildPmTaskImportPreview, parsePmTaskWorkbook } from '@/services/pm/pmTaskImport.service';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    const session = getSession(request); if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasPermission(session, 'pm_tasks.import') && !isAdmin(session)) return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    const plantScope = await getPlantScope(request, session); if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    if (!plantScope.plantId) return NextResponse.json({ success: false, error: 'Select a plant before importing PM tasks' }, { status: 400 });
    const formData = await request.formData(); const file = formData.get('file');
    if (!(file instanceof File)) return NextResponse.json({ success: false, error: 'Excel workbook file is required' }, { status: 400 });
    if (file.size <= 0 || file.size > PM_TASK_IMPORT_MAX_BYTES) return NextResponse.json({ success: false, error: 'Workbook must be between 1 byte and 10 MB' }, { status: 400 });
    const parsed = parsePmTaskWorkbook(Buffer.from(await file.arrayBuffer()), file.name); const preview = await buildPmTaskImportPreview({ parsed, plantId: plantScope.plantId });
    if (preview.structuralErrors.length > 0) return NextResponse.json({ success: false, error: 'Workbook structure is invalid', data: preview, structuralErrors: preview.structuralErrors }, { status: 400 });
    return NextResponse.json({ success: true, data: preview });
  } catch (error: unknown) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to preview PM task import' }, { status: 500 }); }
}
''')
write('src/app/api/pm-tasks/import-confirm/route.ts', r'''
import { NextRequest, NextResponse } from 'next/server';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope } from '@/lib/plant-scope';
import { PmTaskBatchValidationError } from '@/lib/pm-task';
import { createPmTaskBatch } from '@/services/pm/pmTask.service';
import { PM_TASK_IMPORT_MAX_ROWS, buildPmTaskImportPreview, type ParsedPmTaskImport } from '@/services/pm/pmTaskImport.service';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    const session = getSession(request); if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    const canImport = hasPermission(session, 'pm_tasks.import'); const canCreate = hasPermission(session, 'pm_tasks.create');
    if ((!canImport || !canCreate) && !isAdmin(session)) return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    const plantScope = await getPlantScope(request, session); if (plantScope.denyAccess) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    if (!plantScope.plantId) return NextResponse.json({ success: false, error: 'Select a plant before importing PM tasks' }, { status: 400 });
    const body = await request.json(); const filename = typeof body?.filename === 'string' ? body.filename.trim() : '';
    if (!filename || !/\.(xlsx|xls)$/i.test(filename)) return NextResponse.json({ success: false, error: 'A valid .xlsx or .xls filename is required' }, { status: 400 });
    if (!Array.isArray(body?.rows) || body.rows.length === 0) return NextResponse.json({ success: false, error: 'At least one validated PM task row is required' }, { status: 400 });
    if (body.rows.length > PM_TASK_IMPORT_MAX_ROWS) return NextResponse.json({ success: false, error: 'PM task import is limited to 1,000 rows' }, { status: 400 });
    const parsed: ParsedPmTaskImport = { filename, structuralErrors: [], rows: body.rows.map((row: Record<string, unknown>, index: number) => ({
      sourceRow: Number.isInteger(row?.sourceRow) && Number(row.sourceRow) >= 2 ? Number(row.sourceRow) : index + 2,
      description: typeof row?.description === 'string' ? row.description : '', taskType: typeof row?.taskType === 'string' ? row.taskType : '',
    })) };
    const preview = await buildPmTaskImportPreview({ parsed, plantId: plantScope.plantId });
    if (preview.invalidRows > 0 || preview.structuralErrors.length > 0) return NextResponse.json({ success: false, error: 'PM task import contains validation errors', data: preview }, { status: 400 });
    try {
      const created = await createPmTaskBatch({ plantId: plantScope.plantId, userId: session.userId, source: 'import', filename, rows: preview.rows.map((row) => ({ description: row.description, taskType: row.taskType })) });
      return NextResponse.json({ success: true, data: created, count: created.length, warnings: preview.warningCount }, { status: 201 });
    } catch (error: unknown) {
      if (error instanceof PmTaskBatchValidationError) return NextResponse.json({ success: false, error: error.message, rowErrors: error.rowErrors }, { status: 400 });
      throw error;
    }
  } catch (error: unknown) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to import PM tasks' }, { status: 500 }); }
}
''')

# Small source contracts keep the foundational rules pinned.
write('src/__tests__/pm/pm-task-library-schema-contract.test.ts', r'''
import { describe, expect, it } from 'vitest';
import fs from 'node:fs'; import path from 'node:path';
const root = process.cwd(); const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
describe('PM Task Library schema/RBAC', () => {
  it('defines plant-scoped stable task numbers', () => { const s = read('prisma/schema.prisma'); expect(s).toContain('model PmTask {'); expect(s).toContain('@@unique([plantId, taskNumber])'); expect(s).toContain('@@index([plantId, taskType, isActive])'); expect(s).toContain('@@map("pm_tasks")'); });
  it('keeps permission catalogs synchronized', () => { for (const rel of ['prisma/seed-permissions-only.ts','prisma/seed.ts','prisma/seed-all.ts','prisma/seed-missing.ts']) expect(read(rel)).toContain("pm_tasks: ['view', 'create', 'update', 'delete', 'import']"); });
  it('mirrors task permissions into runtime sync', () => { const s = read('src/app/api/admin/sync-permissions/route.ts'); for (const p of ['pm_tasks.view','pm_tasks.create','pm_tasks.update','pm_tasks.delete','pm_tasks.import']) expect(s).toContain(`'${p}'`); });
});
''')
write('src/lib/__tests__/pm-task.test.ts', r'''
import { describe, expect, it } from 'vitest';
import { PM_TASK_TYPES, normalizePmTaskDraft, validatePmTaskBatch } from '@/lib/pm-task';
describe('PM task validation', () => {
  it('has the required canonical types', () => expect(PM_TASK_TYPES).toEqual(['mechanical','electrical','plumbing','lubrication']));
  it('normalizes whitespace/case', () => expect(normalizePmTaskDraft({ description: '  Check motor ', taskType: ' ELECTRICAL ' })).toEqual({ description: 'Check motor', taskType: 'electrical' }));
  it('rejects invalid rows before writes', () => { const v = validatePmTaskBatch([{description:'',taskType:'mechanical'}]); expect(v.rowErrors[0]?.row).toBe(1); expect(v.rowErrors[0]?.messages).toContain('Task description is required'); });
});
''')
write('src/__tests__/pm/pm-task-library-api-contract.test.ts', r'''
import { describe, expect, it } from 'vitest'; import fs from 'node:fs'; import path from 'node:path';
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
describe('PM Task Library APIs', () => {
  it('uses plant scope and shared creation service', () => { const c=read('src/app/api/pm-tasks/route.ts'); const b=read('src/app/api/pm-tasks/bulk/route.ts'); expect(c).toContain('getPlantFilterWhere(plantScope)'); expect(c).toContain("source: 'single'"); expect(b).toContain("source: 'bulk'"); });
  it('soft deactivates', () => { const d=read('src/app/api/pm-tasks/[id]/route.ts'); expect(d).toContain('deactivatePmTask'); expect(d).not.toContain('db.pmTask.delete'); });
  it('previews imports without writes and confirms canonically', () => { const p=read('src/app/api/pm-tasks/import-preview/route.ts'); const c=read('src/app/api/pm-tasks/import-confirm/route.ts'); expect(p).not.toContain('createPmTaskBatch'); expect(c).toContain('buildPmTaskImportPreview'); expect(c).toContain("source: 'import'"); expect(c).not.toContain('row.taskNumber'); });
});
''')

print('PM task library core recovery staged')
