'use client';

import type { KeyboardEvent } from 'react';
import type { MachineChecklistDraft, MachineChecklistPoint } from '@/lib/pm-machine-checklist';
import type { PaperInspectionRow, PaperInspectionTask } from '@/lib/pm-machine-field-worksheet';
import {
  buildIndustrialInspectionMatrix, INDUSTRIAL_INSPECTION_COLUMNS,
  type IndustrialInspectionColumn,
} from '@/lib/pm-industrial-inspection-matrix';
import { machineChecklistOutOfRange } from '@/lib/pm-machine-checklist';
import { Input } from '@/components/ui/input';

export interface IndustrialMatrixEntry extends MachineChecklistDraft {
  fieldInspectedAt?: string;
  saved?: boolean;
  saving?: boolean;
  error?: string;
  recordedOutcome?: string;
  workOrder?: string | null;
}
interface Props {
  sections: PaperInspectionTask[];
  points: MachineChecklistPoint[];
  getDraft: (id: string) => IndustrialMatrixEntry;
  edit: (id: string, patch: Partial<IndustrialMatrixEntry>) => void;
  canRecord: boolean;
  busy: boolean;
  captureMode: 'digital' | 'paper';
  taskFilter: string;
  partSearch: string;
}
const displayCell = (value: string) => value && value !== '—' ? value : '—';

/** A single editable sheet, aligned with the printable task/part matrix.
 * Each configured point is edited inline. Shared task/point mappings share
 * a single draft ID and are saved once by the parent Save Sheet workflow.
 */
export function PmIndustrialInspectionTable({
  sections, points, getDraft, edit, canRecord, busy, captureMode, taskFilter, partSearch,
}: Props) {
  const byPoint = new Map(points.map((point) => [point.id, point]));
  const term = partSearch.trim().toLowerCase();
  const tasks = buildIndustrialInspectionMatrix(sections)
    .filter((task) => taskFilter === 'all' || task.id === taskFilter)
    .map((task) => ({
      ...task,
      parts: !term ? task.parts : task.parts.filter((part) =>
        [part.partCode, part.partName, part.assembly, part.subassembly, part.component]
          .some((value) => value.toLowerCase().includes(term))),
    }))
    .filter((task) => task.parts.length > 0);

  const valueFor = (point: MachineChecklistPoint, entry: IndustrialMatrixEntry) =>
    point.inspectionType === 'measurement' ? entry.value : entry.findings;
  const editReading = (point: MachineChecklistPoint, value: string) =>
    edit(point.id, point.inspectionType === 'measurement' ? { value } : { findings: value });

  const forwardOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    const inputs = Array.from(event.currentTarget.closest('table')?.querySelectorAll<HTMLInputElement>(
      'input[data-inspection-matrix-input]:not([disabled])') || []);
    const index = inputs.indexOf(event.currentTarget);
    if (index >= 0 && index + 1 < inputs.length) {
      inputs[index + 1].focus();
      inputs[index + 1].select();
    }
  };
  const editShared = (rows: PaperInspectionRow[], patch: Partial<IndustrialMatrixEntry>) => {
    // A point may be listed beneath several PM tasks. Update each point once.
    for (const id of new Set(rows.flatMap((row) => row.pointId ? [row.pointId] : []))) {
      if (!getDraft(id).saved) edit(id, patch);
    }
  };

  return (
    <div className="min-w-0 space-y-2" data-testid="pm-industrial-inspection-grid">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <p className="font-semibold">Inspection sheet · Task → assembly → part → readings</p>
        <p className="text-muted-foreground">Tab or Enter moves between readings · One Save Sheet button saves all entered checks</p>
      </div>
      <div className="max-h-[70vh] overflow-auto rounded-lg border" data-testid="pm-industrial-grid-scroll">
        <table className="w-full min-w-[1430px] border-separate border-spacing-0 text-xs" data-testid="pm-industrial-entry-table">
          <thead className="sticky top-0 z-20 bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-100">
            <tr>
              <th className="w-[78px] border-b border-r px-2 py-2 text-left">Asm</th>
              <th className="w-[82px] border-b border-r px-2 py-2 text-left">Subasm</th>
              <th className="w-[88px] border-b border-r px-2 py-2 text-left">Comp</th>
              <th className="w-[105px] border-b border-r px-2 py-2 text-left">Part code</th>
              <th className="min-w-[155px] border-b border-r px-2 py-2 text-left">Description</th>
              <th className="w-[138px] border-b border-r px-2 py-2 text-left">Temp</th>
              <th className="w-[138px] border-b border-r px-2 py-2 text-left">Vib</th>
              <th className="w-[138px] border-b border-r px-2 py-2 text-left">Sound</th>
              <th className="w-[138px] border-b border-r px-2 py-2 text-left">Corr</th>
              <th className="w-[138px] border-b border-r px-2 py-2 text-left">Other</th>
              <th className="w-[190px] border-b border-r px-2 py-2 text-left">Remark</th>
              <th className="w-[158px] border-b px-2 py-2 text-left">Time</th>
            </tr>
          </thead>
          <tbody>
            {tasks.flatMap((task) => [
              <tr key={task.id + '-heading'} className="bg-slate-200/90 dark:bg-slate-800/90" data-testid="pm-industrial-task-heading">
                <th colSpan={12} className="sticky left-0 border-b px-3 py-2 text-left font-bold">
                  Task #{task.number} — {task.instruction}
                  <span className="ml-2 font-normal">({task.parts.length} parts)</span>
                </th>
              </tr>,
              ...task.parts.map((part, idx) => {
                const allPoints = [...new Set(part.allChecks.flatMap((row) => row.pointId ? [row.pointId] : []))]
                  .map((id) => byPoint.get(id)).filter((point): point is MachineChecklistPoint => !!point);
                const firstEntry = allPoints.map((point) => getDraft(point.id))
                  .find((entry) => entry.findings || entry.fieldInspectedAt) || (
                  allPoints[0] ? getDraft(allPoints[0].id) : null);
                const remarks = firstEntry?.findings || '';
                const inspectedAt = firstEntry?.fieldInspectedAt || '';
                return (
                  <tr key={part.id} className={idx % 2 ? 'bg-muted/20' : 'bg-background'}
                    data-testid="pm-industrial-part-row">
                    <td className="border-b border-r px-2 py-2 font-mono" title="Registered assembly code">{displayCell(part.assembly)}</td>
                    <td className="border-b border-r px-2 py-2 font-mono" title="Registered subassembly code">{displayCell(part.subassembly)}</td>
                    <td className="border-b border-r px-2 py-2 font-mono" title="Registered component code">{displayCell(part.component)}</td>
                    <td className="border-b border-r px-2 py-2 font-mono font-semibold">{part.partCode}</td>
                    <td className="border-b border-r px-2 py-2">{part.partName}</td>
                    {INDUSTRIAL_INSPECTION_COLUMNS.map(({ key }: { key: IndustrialInspectionColumn }) => (
                      <td key={key} className="border-b border-r px-1.5 py-1.5 align-top">
                        {part.checks[key].length === 0 ? <span className="text-muted-foreground">—</span>
                          : part.checks[key].map((item) => {
                            const point = item.pointId ? byPoint.get(item.pointId) : null;
                            if (!point || item.requiresConfiguration) return (
                              <span key={item.id} className="text-[10px] text-amber-700 dark:text-amber-300"
                                title={item.configurationNote}>{item.requiresConfiguration ? 'Set up' : '—'}</span>
                            );
                            const entry = getDraft(point.id);
                            const outOfRange = machineChecklistOutOfRange(point, entry.value);
                            const numeric = point.inspectionType === 'measurement';
                            const entered = valueFor(point, entry);
                            return <div key={item.id} className="mb-1.5 last:mb-0" data-testid="pm-industrial-check">
                              {(part.checks[key].length > 1 || key === 'other') && (
                                <span title={point.name} className="block truncate text-[10px]">{point.name}</span>
                              )}
                              <Input type={numeric ? 'number' : 'text'} step={numeric ? 'any' : undefined}
                                inputMode={numeric ? 'decimal' : 'text'}
                                data-inspection-matrix-input=""
                                aria-label={`${numeric ? 'Reading' : 'Observation'}: ${point.name} — ${part.partCode}`}
                                title={`${point.name}: ${item.acceptedRange} ${item.unit}`}
                                className={`h-8 min-w-0 px-1.5 text-xs ${outOfRange ? 'border-destructive bg-destructive/10' : ''}`}
                                value={entered} disabled={!canRecord || busy || entry.saved || entry.outcome === 'not_measured'}
                                placeholder={entry.outcome === 'not_measured' ? 'N/A' : numeric ? item.unit || 'Value' : 'Observation'}
                                onKeyDown={forwardOnEnter}
                                onChange={(e) => editReading(point, e.target.value)} />
                              <div className="flex min-w-0 items-center justify-between gap-1">
                                <span className={`max-w-[70px] truncate text-[9px] ${outOfRange ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}
                                  title={item.acceptedRange + ' ' + item.unit}>
                                  {item.acceptedRange === '—' ? '' : item.acceptedRange} {item.unit}
                                </span>
                                <select aria-label={`Assessment: ${point.name} — ${part.partCode}`}
                                  className="max-w-[68px] cursor-pointer rounded border bg-background px-0.5 py-0.5 text-[10px]"
                                  disabled={!canRecord || busy || entry.saved} value={entry.outcome}
                                  onChange={(e) => edit(point.id, {
                                    outcome: e.target.value as MachineChecklistDraft['outcome'],
                                    ...(e.target.value === 'not_measured' ? { value: '' } : {}),
                                  })}>
                                  <option value="pass">Normal</option><option value="needs_attention">Attention</option>
                                  <option value="fail">Defect</option>
                                  {numeric && <option value="not_measured">N/A</option>}
                                </select>
                              </div>
                              {entry.error && <span role="alert" className="block break-words text-[10px] text-destructive">{entry.error}</span>}
                              {entry.saved && <span className="block text-[10px] text-emerald-600">Saved{entry.workOrder ? ' · ' + entry.workOrder : ''}</span>}
                            </div>;
                          })}
                      </td>
                    ))}
                    <td className="border-b border-r px-1.5 py-1.5 align-top">
                      <Input data-inspection-matrix-input="" className="h-8 w-full min-w-0 px-1.5 text-xs"
                        aria-label={`Remark: ${part.partCode}`} value={remarks}
                        disabled={!canRecord || busy || allPoints.length === 0 || allPoints.every((p) => getDraft(p.id).saved)}
                        placeholder="Observation / defect"
                        onKeyDown={forwardOnEnter}
                        onChange={(event) => editShared(part.allChecks, { findings: event.target.value })}/>
                      {allPoints.some((p) => !!p.openCorrectiveWorkOrder) && <span className="block text-[10px] text-amber-700">Open corrective WO</span>}
                    </td>
                    <td className="border-b px-1.5 py-1.5 align-top">
                      {captureMode === 'paper'
                        ? <input type="datetime-local" data-inspection-matrix-input=""
                            aria-label={`Field time: ${part.partCode}`}
                            className="h-8 w-full min-w-0 rounded border bg-background px-1 text-[10px]"
                            value={inspectedAt} disabled={!canRecord || busy || allPoints.length === 0}
                            onKeyDown={forwardOnEnter}
                            onChange={(event) => editShared(part.allChecks, { fieldInspectedAt: event.target.value })}/>
                        : <span className="text-muted-foreground">At save</span>}
                    </td>
                  </tr>
                );
              }),
            ])}
            {tasks.length === 0 && <tr><td colSpan={12} className="px-4 py-5 text-center text-muted-foreground">
              No parts match this task or part filter.
            </td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        — means no inspection point assigned to that column. A code appears only when registered in the machine hierarchy.
        Red numeric readings are outside the configured limits. Enter N/A only with a reason in Remark.
        Shared points appearing under multiple tasks are saved once. This is an entry form, not an approval or work-order closeout.
      </p>
    </div>
  );
}
