'use client';

import { useState, type KeyboardEvent } from 'react';
import type { MachineChecklistDraft, MachineChecklistPoint } from '@/lib/pm-machine-checklist';
import type { PaperInspectionRow, PaperInspectionTask } from '@/lib/pm-machine-field-worksheet';
import {
  buildIndustrialInspectionMatrix, missingIndustrialFieldTimePointIds, INDUSTRIAL_INSPECTION_COLUMNS,
  type IndustrialInspectionColumn,
} from '@/lib/pm-industrial-inspection-matrix';
import { machineChecklistOutOfRange } from '@/lib/pm-machine-checklist';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

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
  fillBlankTimes: (pointIds: string[], time: string) => void;
  canRecord: boolean;
  busy: boolean;
  captureMode: 'digital' | 'paper';
  taskFilter: string;
  partSearch: string;
}
const displayCell = (value: string) => value && value !== '—' ? value : '';

/** A single editable sheet, aligned with the printable task/part matrix.
 * Each configured point is edited inline. Shared task/point mappings share
 * a single draft ID and are saved once by the parent Save Sheet workflow.
 */
export function PmIndustrialInspectionTable({
  sections, points, getDraft, edit, fillBlankTimes, canRecord, busy, captureMode, taskFilter, partSearch,
}: Props) {
  const [commonTime, setCommonTime] = useState('');
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
  const missingTimeIds = captureMode === 'paper'
    ? missingIndustrialFieldTimePointIds(tasks, getDraft) : [];
  const validCommonTime = commonTime.length >= 16
    && Number.isFinite(new Date(commonTime).getTime())
    && new Date(commonTime).getTime() <= Date.now();

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
    // A point may be listed beneath several PM tasks. Update it once.
    const ids = [...new Set(rows.flatMap((row) => row.pointId ? [row.pointId] : []))];
    // Remarks belong to instrument findings when present. Sight/sound/corrosion
    // observations are entered in their OWN cells and must not be overwritten.
    const measured = ids.filter((id) => byPoint.get(id)?.inspectionType === 'measurement');
    const targets = patch.findings !== undefined && measured.length ? measured : ids;
    for (const id of targets) {
      if (!getDraft(id).saved) edit(id, patch);
    }
  };

  return (
    <div className="min-w-0 space-y-2" data-testid="pm-industrial-inspection-grid">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <p className="font-semibold">Inspection sheet · BLOCK / PART / V.PART / GT CODE → readings</p>
        <p className="text-muted-foreground">BLOCK = assembly; PART = sub-assembly; V.PART = component; GT CODE = part code. Tab / Enter moves to the next entry.</p>
      </div>
      {captureMode === 'paper' && <div className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/20 p-2.5"
        data-testid="pm-industrial-common-time">
        <div className="min-w-0 space-y-1">
          <Label htmlFor="industrial-common-field-time" className="text-xs">Common field time (optional)</Label>
          <Input id="industrial-common-field-time" type="datetime-local" className="h-9 min-w-0 w-[230px] max-w-full"
            value={commonTime} disabled={!canRecord || busy}
            onChange={(event) => setCommonTime(event.target.value)}/>
        </div>
        <Button type="button" size="sm" variant="outline"
          disabled={!canRecord || busy || !validCommonTime || missingTimeIds.length === 0}
          onClick={() => fillBlankTimes(missingTimeIds, commonTime)}>
          Fill blank Times ({missingTimeIds.length})
        </Button>
        <p className="basis-full text-[11px] text-muted-foreground">
          Only use when these checks were actually performed at the same time.
          Fills visible, unsaved checks only; never overwrites recorded times.
          The inspection time must be after the issued worksheet date and before now.
        </p>
      </div>}
      <div className="max-h-[70vh] overflow-auto rounded-lg border" data-testid="pm-industrial-grid-scroll">
        <table className="w-full min-w-[1420px] table-fixed border-separate border-spacing-0 text-xs" data-testid="pm-industrial-entry-table">
          <thead className="sticky top-0 z-20 bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-100">
            <tr>
              <th className="w-[125px] border-b border-r px-1 py-2 text-left text-[10px]">BLOCK</th>
              <th className="w-[125px] border-b border-r px-1 py-2 text-left text-[10px]">PART</th>
              <th className="w-[125px] border-b border-r px-1 py-2 text-left text-[10px]">V.PART</th>
              <th className="w-[150px] border-b border-r px-1 py-2 text-left text-[10px]">GT CODE</th>
              <th className="w-[230px] border-b border-r px-1 py-2 text-left text-[10px]">DESCRIPTION</th>
              <th className="w-[128px] border-b border-r px-1 py-2 text-left text-[10px]">Temperature</th>
              <th className="w-[100px] border-b border-r px-1 py-2 text-left text-[10px]">Vibration</th>
              <th className="w-[100px] border-b border-r px-1 py-2 text-left text-[10px]">Sound</th>
              <th className="w-[95px] border-b border-r px-1 py-2 text-left text-[10px]">Corrosion</th>
              <th className="w-[185px] border-b px-1 py-2 text-left text-[10px]">TIME</th>
            </tr>
          </thead>
          <tbody>
            {tasks.flatMap((task) => [
              <tr key={task.id + '-heading'} className="bg-slate-200/90 dark:bg-slate-800/90" data-testid="pm-industrial-task-heading">
                <th colSpan={10} className="sticky left-0 border-b px-3 py-2 text-left font-bold">
                  {task.instruction}
                  <span className="ml-2 font-normal">({task.parts.length} parts)</span>
                </th>
              </tr>,
              ...task.parts.map((part, idx) => {
                const allPoints = [...new Set(part.allChecks.flatMap((row) => row.pointId ? [row.pointId] : []))]
                  .map((id) => byPoint.get(id)).filter((point): point is MachineChecklistPoint => !!point);
                const inspectedAt = allPoints.map((point) => getDraft(point.id))
                  .find((entry) => entry.fieldInspectedAt)?.fieldInspectedAt || '';
                return (
                  <tr key={part.id} className={idx % 2 ? 'bg-muted/20' : 'bg-background'}
                    data-testid="pm-industrial-part-row">
                    <td className="max-w-0 overflow-hidden whitespace-nowrap border-b border-r px-1 py-1.5 font-mono text-[10px]" title="Registered assembly code">{displayCell(part.assembly)}</td>
                    <td className="max-w-0 overflow-hidden whitespace-nowrap border-b border-r px-1 py-1.5 font-mono text-[10px]" title="Registered sub-assembly code">{displayCell(part.subassembly)}</td>
                    <td className="max-w-0 overflow-hidden whitespace-nowrap border-b border-r px-1 py-1.5 font-mono text-[10px]" title="Registered component code">{displayCell(part.component)}</td>
                    <td className="max-w-0 overflow-hidden whitespace-nowrap border-b border-r px-1 py-1.5 font-mono text-[10px] font-semibold">{part.partCode}</td>
                    <td className="max-w-0 overflow-hidden whitespace-nowrap border-b border-r px-1 py-1.5 text-[11px]" title={part.partName}>{part.partName}</td>
                    {INDUSTRIAL_INSPECTION_COLUMNS.map(({ key }: { key: IndustrialInspectionColumn }) => (
                      <td key={key} className="border-b border-r px-1.5 py-1.5 align-top">
                        {part.checks[key].length === 0 ? (
                            <Input className="h-8 w-full min-w-0 border-dashed bg-muted/20 text-xs"
                              aria-label={`No configured ${INDUSTRIAL_INSPECTION_COLUMNS.find((c) => c.key === key)?.title} reading for ${part.partCode}`}
                              title="No inspection parameter has been configured on this part. Assign it in the asset inspection settings before recording."
                              disabled value="" readOnly />
                          ) : part.checks[key].map((item) => {
                            const point = item.pointId ? byPoint.get(item.pointId) : null;
                            if (!point || item.requiresConfiguration) return (
                              <span key={item.id} className="text-[10px] text-amber-700 dark:text-amber-300"
                                title={item.configurationNote}>{item.requiresConfiguration ? 'Configure' : ''}</span>
                            );
                            const entry = getDraft(point.id);
                            const outOfRange = machineChecklistOutOfRange(point, entry.value);
                            const numeric = point.inspectionType === 'measurement';
                            const entered = valueFor(point, entry);
                            return <div key={item.id} className="flex min-w-0 items-center gap-1 whitespace-nowrap" data-testid="pm-industrial-check">
                              {part.checks[key].length > 1 && (
                                <span title={point.name} className="sr-only">{point.name}</span>
                              )}
                              <Input type={numeric ? 'number' : 'text'} step={numeric ? 'any' : undefined}
                                inputMode={numeric ? 'decimal' : 'text'}
                                data-inspection-matrix-input=""
                                aria-label={`${numeric ? 'Reading' : 'Observation'}: ${point.name} — ${part.partCode}`}
                                title={`${point.name}: ${item.acceptedRange} ${item.unit}`}
                                className={`h-8 min-w-0 flex-1 px-1.5 text-xs ${outOfRange ? 'border-destructive bg-destructive/10' : ''}`}
                                value={entered} disabled={!canRecord || busy || entry.saved || entry.outcome === 'not_measured'}
                                placeholder={entry.outcome === 'not_measured' ? 'N/A' : numeric ? item.unit || 'Value' : 'Observation'}
                                onKeyDown={forwardOnEnter}
                                onChange={(e) => editReading(point, e.target.value)} />
                              <select aria-label={`Assessment: ${point.name} — ${part.partCode}`}
                                title={`Assessment · approved ${item.acceptedRange} ${item.unit}`}
                                className="h-8 w-[53px] min-w-0 shrink-0 cursor-pointer rounded border bg-background px-0.5 text-[9px]"
                                disabled={!canRecord || busy || entry.saved} value={entry.outcome}
                                onChange={(e) => edit(point.id, {
                                  outcome: e.target.value as MachineChecklistDraft['outcome'],
                                  ...(e.target.value === 'not_measured' ? { value: '' } : {}),
                                })}>
                                <option value="pass">OK</option><option value="needs_attention">Alert</option>
                                <option value="fail">Fail</option>
                                {numeric && <option value="not_measured">N/A</option>}
                              </select>
                              {entry.error && <span role="alert" className="block break-words text-[10px] text-destructive">{entry.error}</span>}
                              {entry.saved && <span className="block text-[10px] text-emerald-600">Saved{entry.workOrder ? ' · ' + entry.workOrder : ''}</span>}
                            </div>;
                          })}
                      </td>
                    ))}
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
            {tasks.length === 0 && <tr><td colSpan={10} className="px-4 py-5 text-center text-muted-foreground">
              No parts match this task or part filter.
            </td></tr>}
          </tbody>
        </table>
      </div>
      {tasks.some(task=>task.parts.some(part=>part.checks.other.length>0)) && (
        <div className="rounded-md border p-2" data-testid="pm-industrial-extra-checks">
          <p className="mb-2 text-xs font-semibold">Additional configured checks</p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {[...new Map(tasks.flatMap(task=>task.parts.flatMap(part=>part.checks.other.map(item=>[
              item.pointId || item.id, {part,item},
            ] as const)))).values()].map(({part,item})=>{
              const point=item.pointId ? byPoint.get(item.pointId) : null;
              if(!point || item.requiresConfiguration) return <p key={item.id} className="text-xs">
                {part.partCode} · {item.checkName}: configure inspection point
              </p>;
              const entry=getDraft(point.id);
              return <label key={item.id} className="flex min-w-0 items-center gap-2 text-xs">
                <span className="max-w-[45%] truncate" title={part.partCode+' · '+point.name}>
                  {part.partCode} · {point.name}
                </span>
                <Input type={point.inspectionType==='measurement'?'number':'text'}
                  step={point.inspectionType==='measurement'?'any':undefined}
                  data-inspection-matrix-input=""
                  aria-label={`Reading: ${point.name} — ${part.partCode}`}
                  className="h-8 min-w-0 flex-1 px-1.5 text-xs"
                  value={valueFor(point,entry)} disabled={!canRecord||busy||entry.saved||entry.outcome==='not_measured'}
                  onKeyDown={forwardOnEnter}
                  onChange={e=>editReading(point,e.target.value)}/>
              </label>;
            })}
          </div>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Blank disabled inputs mean that no check is configured for that measurement; they do not represent zero.
        Comments and detailed outcomes remain available under Detailed cards (advanced).
        Codes are taken from the registered hierarchy; shared points are saved once.
      </p>
    </div>
  );
}
