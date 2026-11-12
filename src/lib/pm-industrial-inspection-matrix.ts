import type { PaperInspectionRow, PaperInspectionTask } from './pm-machine-field-worksheet';

export type IndustrialInspectionColumn = 'temp' | 'vib' | 'sound' | 'corr' | 'other';
export const INDUSTRIAL_INSPECTION_COLUMNS: ReadonlyArray<{ key: IndustrialInspectionColumn; title: string }> = [
  { key: 'temp', title: 'Temperature' },
  { key: 'vib', title: 'Vibration' },
  { key: 'sound', title: 'Sound' },
  { key: 'corr', title: 'Corrosion' },
];
export interface IndustrialInspectionPartRow {
  id: string;
  partId: string | null;
  partCode: string;
  partName: string;
  assembly: string;
  subassembly: string;
  component: string;
  hierarchyComplete: boolean;
  checks: Record<IndustrialInspectionColumn, PaperInspectionRow[]>;
  allChecks: PaperInspectionRow[];
}
export interface IndustrialInspectionTask {
  id: string;
  number: number;
  instruction: string;
  parts: IndustrialInspectionPartRow[];
}
const emptyChecks = (): Record<IndustrialInspectionColumn, PaperInspectionRow[]> => ({
  temp: [], vib: [], sound: [], corr: [], other: [],
});

/** Use only the actual registered inspection-point parameter or name, not the task's generic text.
 * Never turn a motor check into a temperature check simply because the task mentioned temperature.
 */
export function industrialInspectionColumn(row: Pick<PaperInspectionRow, 'parameter' | 'checkName'>): IndustrialInspectionColumn {
  const label = `${row.parameter || ''} ${row.checkName || ''}`.toLowerCase().replace(/[_-]/g, ' ');
  if (/\b(temp(?:erature)?|thermal|winding heat|heat reading)\b/.test(label)) return 'temp';
  if (/\b(vib(?:ration)?|rms vibration|accelerometer)\b/.test(label)) return 'vib';
  if (/\b(sound|noise|acoustic|decibel|db\(a\))\b/.test(label)) return 'sound';
  if (/\b(corr(?:osion)?|rust|oxidation)\b/.test(label)) return 'corr';
  return 'other';
}

/** Codes come only from the machine's registered hierarchy, never from part-code substrings. */
export function industrialHierarchyCodes(row: PaperInspectionRow) {
  const levels = row.hierarchy;
  const find = (type: string) => levels.find((item) => item.type.toLowerCase().replace(/[\s_-]/g, '') === type)?.code || '—';
  return {
    assembly: find('assembly'),
    subassembly: find('subassembly'),
    component: find('component'),
  };
}

/** Same grouping is used by editable bulk entry and by the signed blank field sheet. */
export function buildIndustrialInspectionMatrix(tasks: readonly PaperInspectionTask[]): IndustrialInspectionTask[] {
  return tasks.map((task) => {
    const parts = new Map<string, IndustrialInspectionPartRow>();
    for (const row of task.rows) {
      const key = row.partId || row.id;
      let part = parts.get(key);
      if (!part) {
        const codes = industrialHierarchyCodes(row);
        part = {
          id: task.id + ':' + key,
          partId: row.partId,
          partCode: row.partCode,
          partName: row.partName,
          ...codes,
          hierarchyComplete: row.hierarchy.length > 0,
          checks: emptyChecks(),
          allChecks: [],
        };
        parts.set(key, part);
      }
      // Unconfigured/machine-wide rows remain visible, without editable fictitious readings.
      part.checks[industrialInspectionColumn(row)].push(row);
      part.allChecks.push(row);
    }
    return { id: task.id, number: task.number, instruction: task.instruction, parts: [...parts.values()] };
  });
}


/** Return each distinct, unsaved inspection point without a field timestamp.
 * A part may be repeated under separate tasks, but its point ID must only
 * be filled once. Only the rows currently visible to the operator are used.
 */
export function missingIndustrialFieldTimePointIds(
  tasks: readonly IndustrialInspectionTask[],
  getDraft: (id: string) => { fieldInspectedAt?: string; saved?: boolean },
): string[] {
  const ids = new Set<string>();
  for (const task of tasks) {
    for (const part of task.parts) {
      for (const check of part.allChecks) {
        if (!check.pointId || check.requiresConfiguration) continue;
        const draft = getDraft(check.pointId);
        if (draft.saved || draft.fieldInspectedAt) continue;
        ids.add(check.pointId);
      }
    }
  }
  return [...ids];
}
