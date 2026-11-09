'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PrintableMachineInspectionData } from '@/lib/pm-machine-checklist-print';
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
export function PmMachineInspectionPrint({ data }: { data: PrintableMachineInspectionData }) {
  const rows = buildMachineInspectionPrintRows(data);
  const counts = machineInspectionPrintSummary(rows);
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
            Latest saved inspection readings, not a single signed inspection run. Timestamps may differ by point.
            Blank values mean no saved reading; unconfigured checks require planner setup.
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
      </section>
    </>,
    document.body,
  );
}
