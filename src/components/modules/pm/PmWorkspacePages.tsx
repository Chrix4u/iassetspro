'use client';

import { PmPlanningPage } from './PmPlanningPage';
import { PmInspectionWorksheetPanel } from './PmInspectionWorksheetPanel';
import { PmGroupedReadingsPage } from './PmGroupedReadingsPage';
import { PmScheduledTasksPage } from './PmScheduledTasksPage';
import { PmInspectionExceptionsPanel } from './PmInspectionExceptionsPanel';
import { useNavigationStore } from '@/stores/navigationStore';
import { PmMachineRollupPanel } from './PmMachineRollupPanel';

export function PmForwardPlanningPage() {
  return <PmPlanningPage view="planning"/>;
}

export function PmComplianceWorkspacePage() {
  return <PmPlanningPage view="compliance"/>;
}

export function PmInspectionReadingsPage() {
  return <PmGroupedReadingsPage />;
}

export function PmActionListsPage() {
  return <div className="page-content space-y-4"><div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">PM Inspections</p><h1 className="text-2xl font-bold tracking-tight">Machine Action Lists</h1><p className="mt-1 text-sm text-muted-foreground">Print, complete and record machine-based inspection sheets without unrelated schedules or reports.</p></div><PmInspectionWorksheetPanel mode="action-lists"/></div>
}

export function PmScheduledInspectionsPage() {
  return <PmScheduledTasksPage />;
}

export function PmInspectionExceptionsPage() {
  const navigate = useNavigationStore((state) => state.navigate);
  return <div className="page-content space-y-4">
    <div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">PM Inspections</p>
      <h1 className="text-2xl font-bold tracking-tight">Inspection Exceptions</h1>
      <p className="mt-1 text-sm text-muted-foreground">Abnormal readings, corrective work orders and pending follow-up across authorized plants and departments.</p>
    </div>
    <PmInspectionExceptionsPanel assetId="" departmentId="" reloadKey={0} onClose={() => navigate('pm-inspections')}/>
  </div>;
}

export function PmMachinePlanningPage() {
  return <div className="page-content space-y-4">
    <div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">PM Planning</p>
    <h1 className="text-2xl font-bold tracking-tight">Machine Planning & Work Bundles</h1>
    <p className="mt-1 text-sm text-muted-foreground">Select one machine and a planning window. Group Running, Standstill or Shutdown maintenance tasks into controlled work bundles, then monitor completion.</p></div>
    <PmMachineRollupPanel />
  </div>;
}
