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
          @page { size: A4 portrait; margin: 7mm 6mm 9mm; }
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
            font-size: 6.5pt !important;
            line-height: 1.1 !important;
          }
          #pm-machine-inspection-print table {
            width: 100% !important;
            table-layout: fixed !important;
            border-collapse: collapse !important;
          }
          #pm-machine-inspection-print th,
          #pm-machine-inspection-print td {
            border: 1px solid #9ca3af !important;
            padding: 1px 1.5px !important;
            overflow-wrap: normal !important;
            vertical-align: top !important;
          }
          #pm-machine-inspection-print thead { display: table-header-group !important; }
          #pm-machine-inspection-print tr,
          #pm-machine-inspection-print .pm-print-no-break {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          #pm-machine-inspection-print .pm-paper-task { margin-top: 8px !important; }
          #pm-machine-inspection-print .pm-paper-code,
          #pm-machine-inspection-print .pm-paper-part-name,
          #pm-machine-inspection-print .pm-paper-row td {
            white-space: nowrap !important;
            word-break: normal !important;
            line-break: auto !important;
          }
          #pm-machine-inspection-print .pm-paper-code { font-family: monospace; letter-spacing: -0.1pt; }
          #pm-machine-inspection-print .pm-paper-row { height: 6.8mm !important; }
          #pm-machine-inspection-print .pm-paper-row td { vertical-align: middle !important; }
          #pm-machine-inspection-print .pm-paper-field-table th { font-size: 6.0pt !important; white-space: nowrap !important; }
          #pm-machine-inspection-print .pm-paper-field-table { width: 100% !important; max-width: 198mm !important; }
          #pm-machine-inspection-print .pm-paper-cell-empty { background: #f7f7f7 !important; }
          #pm-machine-inspection-print .pm-paper-extra-line { display: inline-block !important; width: 5mm; min-height: 2mm; border-bottom: 1px solid #9ca3af; }
          #pm-machine-inspection-print .pm-print-header-grid { grid-template-columns: repeat(2,minmax(0,1fr)) !important; }

          #pm-machine-inspection-print .pm-paper-writing-line { display: block; min-height: 4.2mm; border-bottom: 1px solid #9ca3af; background: #fff !important; }
          #pm-machine-inspection-print .pm-paper-writing-note { display: block; min-height: 4.2mm; border-bottom: 1px solid #9ca3af; background: #fff !important; }
          #pm-machine-inspection-print .pm-paper-heading { background: #e2e8f0 !important; font-weight: bold; padding: 7px !important; }
          #pm-machine-inspection-print .pm-print-note {
            color: #374151 !important;
            font-size: 6.5pt !important;
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
              <div className="pm-print-header-grid mt-2 grid grid-cols-2 gap-1 border border-slate-400 p-1 text-[9px]">
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
                Task-grouped Action List — BLOCK = assembly; PART = sub-assembly;
                V.PART = component; GT CODE = registered part code.
                Record actual Temperature, Vibration, Sound and Corrosion where a check is assigned.
                Unused cells are blank, not zero. For other configured checks (e.g. pressure), use Remark.
                Enter these same values in the electronic table; write N/A with a reason when a check is impossible.
              </p>
            </header>
            {matrixSections.map((task) => (
              <section key={task.id} className="pm-paper-task" data-testid="pm-paper-task">
                <h2 className="pm-paper-heading pm-print-no-break text-[9px]">
                  {task.instruction} <span className="font-normal">({task.parts.length} parts)</span>
                </h2>
                <table className="pm-paper-field-table" data-testid="pm-paper-field-table">
                  <colgroup>
                    {[5,6,6,10,19,9,11,9,10,9,6].map((width,index)=><col key={index} style={{width:width+'%'}}/>)}
                  </colgroup>
                  <thead><tr className="bg-slate-100">
                    <th>BLOCK</th><th>PART</th><th>V.PART</th><th>GT CODE</th><th>DESCRIPTION</th>
                    {INDUSTRIAL_INSPECTION_COLUMNS.map(col=><th key={col.key}>{col.title}</th>)}
                    <th>REMARK</th><th>TIME</th>
                  </tr></thead>
                  <tbody>
                    {task.parts.map((part) => {
                      const codeScale=(code:string)=>Math.min(6.3,Math.max(2.8,108/(code.length+2)))+'pt';
                      const descScale=Math.min(6.4,Math.max(2.7,205/(part.partName.length+6)))+'pt';
                      const otherChecks=part.checks.other;
                      return (
                        <tr key={part.id} className="pm-paper-row" data-testid="pm-paper-field-row">
                          <td className="pm-paper-code" style={{fontSize:codeScale(part.assembly)}}>{part.assembly==='—'?'':part.assembly}</td>
                          <td className="pm-paper-code" style={{fontSize:codeScale(part.subassembly)}}>{part.subassembly==='—'?'':part.subassembly}</td>
                          <td className="pm-paper-code" style={{fontSize:codeScale(part.component)}}>{part.component==='—'?'':part.component}</td>
                          <td className="pm-paper-code font-semibold" style={{fontSize:codeScale(part.partCode)}}>{part.partCode}</td>
                          <td className="pm-paper-part-name" style={{fontSize:descScale}} title={'Scheduled PM due: '+(part.allChecks[0]?.scheduledDue||'Not configured')}>
                            {part.partName}
                          </td>
                          {INDUSTRIAL_INSPECTION_COLUMNS.map(col=>(
                            <td key={col.key} className={part.checks[col.key].length?'':'pm-paper-cell-empty'}>
                              {part.checks[col.key].length ? part.checks[col.key].map(check=>(
                                <span key={check.id} className="block" title={check.checkName+' | '+check.acceptedRange+' '+check.unit}>
                                  {check.requiresConfiguration ? 'SET UP' : <span
                                    className="pm-paper-writing-line" aria-label={'Blank '+col.title+' reading for '+part.partCode}>&nbsp;</span>}
                                </span>
                              )) : null}
                            </td>
                          ))}
                          <td>
                            {otherChecks.length ? otherChecks.map(check=>(
                              <span key={check.id} className="inline-flex items-center gap-0.5 whitespace-nowrap text-[5px]">
                                {check.checkName}{check.requiresConfiguration?' (set up)':''}
                                {!check.requiresConfiguration&&<span className="pm-paper-extra-line">&nbsp;</span>}
                              </span>
                            )) : <span className="pm-paper-writing-note" aria-label="Blank space for handwritten remark">&nbsp;</span>}
                          </td>
                          <td><span className="pm-paper-writing-line" aria-label="Blank space for handwritten inspection time">&nbsp;</span></td>
                        </tr>
                      );
                    })}
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
