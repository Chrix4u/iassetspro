'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PrintableMachineInspectionData } from '@/lib/pm-machine-checklist-print';
import { buildPaperInspectionTasks } from '@/lib/pm-machine-field-worksheet';
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
  printedIssue?: { reference: string; issuedAt: string } | null;
}) {
  const rows = buildMachineInspectionPrintRows(data);
  const counts = machineInspectionPrintSummary(rows);
  const fieldSections = buildPaperInspectionTasks(data.groups, data.generalTasks, data.explicitTaskPointLinks || []);
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
            font-size: 9pt !important;
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
            padding: 4px 5px !important;
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
          #pm-machine-inspection-print .pm-paper-writing-line { display: block; min-height: 11mm; border: 1px solid #9ca3af; background: #fff !important; }
          #pm-machine-inspection-print .pm-paper-writing-note { display: block; min-height: 13mm; border: 1px solid #9ca3af; background: #fff !important; }
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
        aria-label="Printable machine inspection checklist"
      >
        {mode === 'field' ? (
          <>
            <header className="pm-print-no-break mb-3">
              <div className="flex items-start justify-between gap-4 border-b-2 border-slate-900 pb-2">
                <div>
                  <p className="text-xs font-semibold">iAssetsPro · Preventive Maintenance</p>
                  <h1 className="text-xl font-bold">Machine Inspection Sheet — {data.equipmentState === 'running' ? 'Running' : 'Standstill'}</h1>
                  <p className="text-base font-bold">{data.machine.name}</p>
                  <p>Machine code: <strong>{data.machine.assetTag}</strong></p>
                  <p>Machine description: {data.machine.description || data.machine.name}</p>
                  {data.machine.location && <p>Location: {data.machine.location}</p>}
                </div>
                <div className="text-right text-xs">
                  <p>Issued: {printedIssue ? displayTime(printedIssue.issuedAt) : 'Not yet issued'}</p>
                  <p>Plant: {data.machine.plantId}</p>
                  <p>{fieldSections.length} inspection task(s)</p>
                  <p>{fieldSections.reduce((total, task) => total + task.rows.length, 0)} inspection row(s)</p>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-3 border border-slate-400 p-2 text-xs">
                <span>Inspection date: ______________</span>
                <span>Start time: __________</span>
                <span>End time: __________</span>
                <span>Paper reference: <strong data-testid="pm-print-sheet-reference">{printedIssue?.reference || 'NOT ISSUED'}</strong></span>
              </div>
              {unresolved.partCount > 0 && <p className="pm-print-note mt-2 border border-amber-500 p-2 font-semibold">
                NOT READY FOR FIELD USE: {unresolved.taskCount} PM task(s) across {unresolved.partCount} parts
                have no verified task-to-check mapping. A planner must assign the exact measurements before issue.
              </p>}
              <p className="pm-print-note mt-2 font-semibold">
                FIELD SHEET — grouped by task. Take this printout to the machine and write each actual
                instrument reading (with its unit), or describe what you saw or heard. Never tick Good/Bad
                as a substitute for a measurement. Enter the same readings into the electronic machine checklist
                afterwards. Any abnormal result requires planner review.
              </p>
            </header>
            {fieldSections.map((task) => (
              <section key={task.id} className="pm-paper-task" data-testid="pm-paper-task">
                <h2 className="pm-paper-heading pm-print-no-break text-sm">
                  Task #{task.number}: {task.instruction} — {new Set(task.rows.filter((row) => row.partId).map((row) => row.partId)).size} parts, {task.rows.length} reading boxes
                </h2>
                <table className="text-xs" data-testid="pm-paper-field-table">
                  <colgroup>
                    <col style={{ width: '18%' }} />
                    <col style={{ width: '14%' }} />
                    <col style={{ width: '14%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '14%' }} />
                    <col style={{ width: '20%' }} />
                    <col style={{ width: '8%' }} />
                  </colgroup>
                  <thead><tr className="bg-slate-100">
                    <th>Assembly / subassembly / part path</th>
                    <th>Part code / description</th>
                    <th>Check / parameter</th>
                    <th>Method / accepted range</th>
                    <th>Actual value (write here)</th>
                    <th>Actual observation / defect (write here)</th>
                    <th>Time checked</th>
                  </tr></thead>
                  <tbody>
                    {task.rows.map((row, index) => (
                      <tr key={row.id} data-testid="pm-paper-field-row">
                        <td>
                          {row.hierarchy.length ? row.hierarchy.map((ancestor, index) => (
                            <div key={ancestor.id} className="break-words">
                              {index > 0 ? '› ' : ''}{ancestor.type}: <strong>{ancestor.code}</strong>
                              <span> — {ancestor.name}</span>
                            </div>
                          )) : 'Machine-wide task — no registered part'}
                        </td>
                        <td><span className="text-[9px]">{index + 1}. </span><strong>{row.partCode}</strong><div>{row.partName}</div></td>
                        <td>
                          <strong>{row.checkName}</strong>
                          <div>{row.parameter}</div>
                        </td>
                        <td>
                          <strong>{row.method}</strong>
                          <div>{row.acceptedRange} {row.unit}</div>
                          {row.configurationNote && <div className="mt-1 text-[10px]">{row.configurationNote}</div>}
                        </td>
                        <td>
                          {row.requiresConfiguration ? (
                            <strong>CONFIGURE FIRST</strong>
                          ) : <span aria-label="Blank space for handwritten actual reading" className="pm-paper-writing-line">&nbsp;</span>}
                        </td>
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
              <h1 className="text-xl font-bold uppercase">Machine Inspection List — {data.equipmentState}</h1>
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
