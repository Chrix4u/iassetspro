'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PrintableMachineInspectionData } from '@/lib/pm-machine-checklist-print';
import { buildPaperInspectionTasks } from '@/lib/pm-machine-field-worksheet';
import { buildIndustrialInspectionMatrix, INDUSTRIAL_INSPECTION_COLUMNS } from '@/lib/pm-industrial-inspection-matrix';
import { missingInspectionTaskMappings } from '@/lib/pm-task-point-scope';
import {
  buildMachineInspectionPrintRows,
  machineInspectionPrintSummary,
} from '@/lib/pm-machine-checklist-print';

function displayTime(input: string): string {
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

/**
 * Dedicated paper/PDF report, visually based on the engineer's machine
 * inspectionlist. All data is from the server's SAVED inspection records.
 * No fake approvals, sign-offs, or inferred inspection timestamps.
 */
export function PmMachineInspectionPrint({ data, mode = 'saved', printedIssue }: {
  data: PrintableMachineInspectionData; mode?: 'saved' | 'field';
  printedIssue?: { reference: string; issuedAt: string; plannedForDate?: string | null; purpose?: string } | null;
}) {
  const rows = buildMachineInspectionPrintRows(data);
  const counts = machineInspectionPrintSummary(rows);
  const fieldSections = buildPaperInspectionTasks(data.groups, data.generalTasks, data.explicitTaskPointLinks || []);
  const matrixSections = buildIndustrialInspectionMatrix(fieldSections);
  const unresolved = missingInspectionTaskMappings(data.groups, data.explicitTaskPointLinks || []);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  // Print content is a direct body child, outside all dashboard scroll panels.
  // This prevents long, multi-page machine checklists being clipped by layout.
  return createPortal(
    <>
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 11mm; }
          html, body { height: auto !important; overflow: visible !important; }
          body:has(#pm-machine-inspection-print) > :not(#pm-machine-inspection-print) {
            display: none !important;
          }
          body:has(#pm-machine-inspection-print) {
            overflow: visible !important;
          }
          #pm-machine-inspection-print {
            display: block !important;
            position: static !important;
            width: 100% !important;
            max-width: none !important;
            overflow: visible !important;
            color: #111827 !important;
            background: white !important;
            font-size: 8pt !important;
            line-height: 1.25 !important;
          }
          #pm-machine-inspection-print table {
            width: 100% !important;
            table-layout: fixed !important;
            border-collapse: collapse !important;
          }
          #pm-machine-inspection-print th,
          #pm-machine-inspection-print td {
            border: 1px solid #9ca3af !important;
            padding: 2px 3px !important;
            overflow-wrap: anywhere !important;
            vertical-align: top !important;
          }
          #pm-machine-inspection-print thead { display: table-header-group !important; }
          #pm-machine-inspection-print tr,
          #pm-machine-inspection-print .pm-print-no-break {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          #pm-machine-inspection-print .pm-paper-task { margin-top: 14px !important; }
          #pm-machine-inspection-print .pm-paper-writing-line { display: block; min-height: 6mm; border: 1px solid #9ca3af; background: #fff !important; }
          #pm-machine-inspection-print .pm-paper-writing-note { display: block; min-height: 8mm; border: 1px solid #9ca3af; background: #fff !important; }
          #pm-machine-inspection-print .pm-paper-heading { background: #e2e8f0 !important; font-weight: bold; padding: 7px !important; }
          #pm-machine-inspection-print .pm-print-note {
            color: #374151 !important;
            font-size: 8pt !important;
          }
        }
      `}</style>
      <section
        id="pm-machine-inspection-print"
        data-testid="pm-machine-inspection-print"
        className="hidden"
        aria-label="Printable machine Action List"
      >
        {mode === 'field' ? (
          <>
            <header className="pm-print-no-break mb-3">
              <div className="flex items-start justify-between gap-4 border-b-2 border-slate-900 pb-2">
                <div>
                  <p className="text-xs font-semibold">iAssetsPro · Preventive Maintenance</p>
                  <h1 className="text-xl font-bold">ACTION LIST — {data.equipmentState === 'running' ? 'Running' : 'Standstill'}</h1>
                  <p className="text-base font-bold">{data.machine.name}</p>
                  <p>Machine code: <strong>{data.machine.assetTag}</strong></p>
                  <p>Machine description: {data.machine.description || data.machine.name}</p>
                  {data.machine.location && <p>Location: {data.machine.location}</p>}
                </div>
                <div className="text-right text-xs">
                  <p>Issued: {printedIssue ? displayTime(printedIssue.issuedAt) : 'Not yet issued'}</p>
                  <p>Visit: {printedIssue?.purpose === 'early_check' ? 'Early condition inspection' : 'Routine inspection'}</p>
                  <p>Plant: {data.machine.plantId}</p>
                  <p>{fieldSections.length} inspection task(s)</p>
                  <p>{fieldSections.reduce((total, task) => total + task.rows.length, 0)} inspection row(s)</p>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-3 border border-slate-400 p-2 text-xs">
                <span>Planned inspection: <strong data-testid="pm-print-planned-date">{printedIssue?.plannedForDate || '______________'}</strong></span>
                <span>Start time: __________</span>
                <span>End time: __________</span>
                <span>Action List reference: <strong data-testid="pm-print-sheet-reference">{printedIssue?.reference || 'NOT ISSUED'}</strong></span>
              </div>
              {unresolved.partCount > 0 && <p className="pm-print-note mt-2 border border-amber-500 p-2 font-semibold">
                NOT READY FOR FIELD USE: {unresolved.taskCount} PM task(s) across {unresolved.partCount} parts
                have no verified task-to-check mapping. A planner must assign the exact measurements before issue.
              </p>}
              {printedIssue?.purpose === 'early_check' && (
                <p className="pm-print-note mt-2 border border-slate-500 p-2 font-semibold">
                  EARLY INSPECTION — record actual conditions now. This visit does not generate,
                  complete or reschedule the planned PM work order. Scheduled PM due dates below remain unchanged.
                </p>
              )}
              <p className="pm-print-note mt-2 font-semibold">
                ACTION LIST — grouped by task, then registered machine part. Fill in the short
                parameter columns (Temp, Vib, Sound, Corr, Other), Remark and Time on paper.
                Enter the same values into the electronic table when you return.
                Write N/A and the reason if an instrument measurement is impossible (never zero).
                Only registered measurements are shown; an abnormal result requires planner review.
              </p>
            </header>
            {matrixSections.map((task) => (
              <section key={task.id} className="pm-paper-task" data-testid="pm-paper-task">
                <h2 className="pm-paper-heading pm-print-no-break text-sm">
                  Task #{task.number}: {task.instruction} — {task.parts.length} part(s)
                </h2>
                <table className="text-xs" data-testid="pm-paper-field-table">
                  <colgroup>
                    {[6,7,7,9,16,8,8,8,8,7,10,6].map((width, index) => <col key={index} style={{ width: width + '%' }}/>)}
                  </colgroup>
                  <thead><tr className="bg-slate-100">
                    <th>Asm</th><th>Subasm</th><th>Comp</th><th>Part code</th><th>Description</th>
                    {INDUSTRIAL_INSPECTION_COLUMNS.map((column) => <th key={column.key}>{column.title}</th>)}
                    <th>Remark</th><th>Time</th>
                  </tr></thead>
                  <tbody>
                    {task.parts.map((part) => (
                      <tr key={part.id} data-testid="pm-paper-field-row">
                        <td className="font-mono">{part.assembly}</td>
                        <td className="font-mono">{part.subassembly}</td>
                        <td className="font-mono">{part.component}</td>
                        <td className="font-mono"><strong>{part.partCode}</strong></td>
                        <td>{part.partName}</td>
                        {INDUSTRIAL_INSPECTION_COLUMNS.map((column) => (
                          <td key={column.key}>
                            {part.checks[column.key].length ? part.checks[column.key].map((check) =>
                              <div key={check.id} className="space-y-0.5">
                                {check.requiresConfiguration ? <strong className="text-[9px]">SET UP</strong> : <>
                                  {part.checks[column.key].length > 1 || column.key === 'other'
                                    ? <span className="block text-[8px]">{check.checkName}</span> : null}
                                  <span aria-label="Blank space for handwritten actual reading" className="pm-paper-writing-line">&nbsp;</span>
                                  <span className="block text-[8px]">{check.acceptedRange !== '—' ? check.acceptedRange : ''} {check.unit}</span>
                                </>}
                              </div>) : '—'}
                          </td>
                        ))}
                        <td><span aria-label="Blank space for handwritten observation" className="pm-paper-writing-note">&nbsp;</span></td>
                        <td><span aria-label="Blank space for handwritten inspection time" className="pm-paper-writing-line">&nbsp;</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
            {fieldSections.length === 0 && <p className="mt-3 border p-3">No active inspection tasks are assigned for this machine and operating state.</p>}
            <footer className="pm-print-no-break mt-4 space-y-3 text-xs">
              <p><strong>Reporting:</strong> Notify the supervisor of dangerous readings immediately. Data entry
                drafts a corrective work order for planner assessment; it does not authorize repairs or close the order.</p>
              <div className="grid grid-cols-2 gap-8 pt-3">
                <p>Inspector name/signature: _______________________________________</p>
                <p>Supervisor name/signature: _______________________________________</p>
                <p>Date/time handed in: _____________________________________________</p>
                <p>Instrument identification (where used): __________________________</p>
              </div>
            </footer>
          </>
        ) : (
          <>
        <header className="pm-print-no-break mb-3">
          <div className="flex items-center justify-between gap-6 border-b-2 border-slate-900 pb-2">
            <div>
              <h1 className="text-xl font-bold uppercase">Action List — saved inspection results — {data.equipmentState}</h1>
              <p className="text-sm font-semibold">{data.machine.name}</p>
              <p>Machine / asset code: <strong>{data.machine.assetTag}</strong></p>
            </div>
            <div className="text-right text-xs">
              <p>Generated: {displayTime(data.generatedAt)}</p>
              <p>Plant ID: {data.machine.plantId}</p>
              <p>{data.totalAssignments} assigned PM inspection tasks</p>
            </div>
          </div>
          <p className="pm-print-note mt-1">
            Latest saved inspection readings, not a single signed inspection run. Timestamps and operating states may differ by point.
            Blank values mean no saved reading; legacy entries have unknown operating state; unconfigured checks require planner setup.
          </p>
          <div className="mt-2 flex justify-between gap-3 border border-slate-400 p-2 text-xs">
            <span>Total configured checks: <strong>{counts.checks}</strong></span>
            <span>Recorded: <strong>{counts.recorded}</strong></span>
            <span>Normal: <strong>{counts.normal}</strong></span>
            <span>Abnormal: <strong>{counts.abnormal}</strong></span>
            <span>Not measurable: <strong>{counts.notMeasured}</strong></span>
            <span>Needs configuration: <strong>{counts.unconfigured}</strong></span>
          </div>
        </header>

        <table data-testid="pm-machine-print-table" className="text-xs">
          <colgroup>
            <col style={{ width: '11%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '8%' }} />
          </colgroup>
          <thead>
            <tr className="bg-slate-100">
              <th>Part / code</th>
              <th>PM task / check instruction</th>
              <th>Inspection point</th>
              <th>Method / normal range</th>
              <th>Actual saved value / observation</th>
              <th>Result</th>
              <th>Remark / recorded time</th>
              <th>Corrective WO</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={row.requiresConfiguration ? 'bg-amber-50' : ''}>
                <td className="break-words">
                  <strong>{row.partCode}</strong>
                  <div>{row.partName}</div>
                </td>
                <td className="break-words">{row.assignedTasks}</td>
                <td className="break-words">{row.checkName}</td>
                <td className="break-words">
                  <strong>{row.method}</strong>
                  <div>{row.reference}</div>
                </td>
                <td className="break-words">{row.actual}</td>
                <td className="break-words font-semibold">{row.outcome}</td>
                <td className="break-words">
                  {row.remarks}
                  {row.recordedAt && <div className="mt-1 text-[10px]">{row.recordedAt}</div>}
                  <div className="mt-1 text-[10px]">Operating state at recording: {row.recordedState}</div>
                  <div className="mt-1 text-[10px]">Capture source: {row.captureSource || 'unknown'}</div>
                  {row.captureSource === 'paper' && <>
                    <div className="mt-1 text-[10px]">Original field time: {row.fieldInspectedAt}</div>
                    <div className="text-[10px]">Field inspector: {row.fieldInspectorName}</div>
                    <div className="text-[10px]">Paper reference: {row.paperReference}</div>
                    <div className="text-[10px]">Entered into system: {row.recordedAt}</div>
                  </>}
                </td>
                <td className="break-words">{row.correctiveWorkOrder}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="mt-3 border p-3">No configured running/standstill tasks for this machine.</p>}
        <footer className="pm-print-no-break mt-4 space-y-3 text-xs">
          <p className="pm-print-note">
            Numeric acceptance is evaluated from configured limits. Outstanding corrective work orders remain subject to planner approval,
            technician execution, verification and proper closeout; this print does not approve or close them.
          </p>
          <div className="grid grid-cols-2 gap-8 pt-4">
            <div>Inspector name / signature: <span className="ml-2 inline-block w-56 border-b border-slate-600"> </span></div>
            <div>Supervisor review / signature: <span className="ml-2 inline-block w-56 border-b border-slate-600"> </span></div>
          </div>
          <p className="pm-print-note">Signature lines are blank until signed. The application audit trail remains the source of truth.</p>
        </footer>
          </>
        )}
      </section>
    </>,
    document.body,
  );
}
