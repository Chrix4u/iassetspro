import { beforeEach, describe, expect, it, vi } from 'vitest';
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
