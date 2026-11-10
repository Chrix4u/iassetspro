'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ClipboardCheck, Download, Eye, Gauge, Loader2, Printer, RefreshCw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { parseInspectionLimits } from '@/lib/pm-inspection';
import {
  machineChecklistOutOfRange,
  validateMachineChecklistEntry,
  type MachineChecklistDraft,
  type MachineChecklistGroup,
  type MachineChecklistPoint,
  type MachineChecklistTask,
  type MachineInspectionState,
} from '@/lib/pm-machine-checklist';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PmMachineInspectionPrint } from './PmMachineInspectionPrint';
import { buildPaperInspectionTasks, type PaperInspectionTask } from '@/lib/pm-machine-field-worksheet';
import { assessMachineInspectionReadiness } from '@/lib/pm-machine-inspection-readiness';
import { isRecordablePaperPoint } from '@/lib/pm-paper-worksheet-issue';
import {
  inspectionPointsForTask, inspectionTaskLabelsForPoint, missingInspectionTaskMappings, type InspectionTaskPointLink,
} from '@/lib/pm-task-point-scope';
import { PmInspectionTaskPointMapper } from './PmInspectionTaskPointMapper';
import { PmActionListParameterSetup } from './PmActionListParameterSetup';
import { actionListAcceptance } from '@/lib/pm-action-list-parameters';
import { type InspectionPurpose } from '@/lib/pm-early-field-inspection';
import { parseInspectionCaptureEvidence, type InspectionCaptureEvidence } from '@/lib/pm-paper-inspection-evidence';

interface MachineChecklistResponse {
  machine: { id: string; name: string; assetTag: string; plantId: string };
  equipmentState: MachineInspectionState;
  generatedAt: string;
  totalAssignments: number;
  totalConfiguredPoints: number;
  explicitTaskPointLinks?: InspectionTaskPointLink[];
  unconfiguredTasks: number;
  groups: MachineChecklistGroup[];
  generalTasks: MachineChecklistTask[];
}

interface IssuedPaperSheet {
  reference: string;
  issuedAt: string;
  issuedById?: string;
  plannedForDate?: string | null;
  purpose?: InspectionPurpose;
  expected: number;
  entered: number;
  remaining: number;
  followUpRequired?: number;
  missingPointIds?: string[];
  status: string;
}
interface EntryState extends MachineChecklistDraft {
  fieldInspectedAt?: string;
  saving?: boolean;
  saved?: boolean;
  error?: string;
  workOrder?: string | null;
  recordedOutcome?: string;
}
const EMPTY_DRAFT: MachineChecklistDraft = {
  value: '', outcome: 'pass', findings: '', recommendation: '', requestKey: '',
};
function dateTime(value: string | Date | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : '—';
}
function csvCell(input: unknown): string {
  const raw = String(input ?? '');
  // Plant metadata and inspection remarks are user-controlled. Do not let a
  // CSV spreadsheet interpret text as formulas when exporting this checklist.
  const safe = '=+@-'.includes(raw.trimStart().charAt(0)) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * Paper-style, on-demand machine checklist with direct value entry.
 * Every row saves through the existing idempotent inspection-record API.
 * This deliberately does NOT auto-complete PM tasks or close corrective WOs.
 */
export function PmMachineInspectionChecklistPanel({
  assetId,
  equipmentState,
  canRecord,
  canPlan,
  onConfigure,
  onClose,
  onRecorded,
  reloadKey,
}: {
  assetId: string;
  equipmentState: MachineInspectionState;
  canRecord: boolean;
  canPlan: boolean;
  onConfigure: (task: MachineChecklistTask) => void;
  onClose: () => void;
  onRecorded: () => void;
  reloadKey: number;
}) {
  const [data, setData] = useState<MachineChecklistResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [entries, setEntries] = useState<Record<string, EntryState>>({});
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [saveProgress, setSaveProgress] = useState('');
  const [printMode, setPrintMode] = useState<'saved' | 'field'>('saved');
  const [entryLayout, setEntryLayout] = useState<'part' | 'task'>('task');
  const [taskFilter, setTaskFilter] = useState('all');
  const [partSearch, setPartSearch] = useState('');
  const [captureMode, setCaptureMode] = useState<'digital' | 'paper'>('digital');
  const [paperInspector, setPaperInspector] = useState('');
  const [paperReference, setPaperReference] = useState('');
  const [plannedForDate, setPlannedForDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [inspectionPurpose, setInspectionPurpose] = useState<InspectionPurpose>('early_check');
  const [issuedSheets, setIssuedSheets] = useState<IssuedPaperSheet[]>([]);
  const [printedIssue, setPrintedIssue] = useState<{
    reference: string; issuedAt: string; plannedForDate: string; purpose: InspectionPurpose;
  } | null>(null);
  const [issuingPaper, setIssuingPaper] = useState(false);
  const [mappingPartId, setMappingPartId] = useState<string | null>(null);
  const [parameterSetupOpen, setParameterSetupOpen] = useState(false);
  const pendingIssueKey = useRef<string | null>(null);
  const loadIssued = useCallback(async () => {
    try {
      const query = new URLSearchParams({ assetId, equipmentState });
      const response = await api.get<IssuedPaperSheet[]>(`/api/pm-inspections/sheets?${query}`);
      setIssuedSheets(response.success && Array.isArray(response.data) ? response.data : []);
    } catch {
      setIssuedSheets([]);
    }
  }, [assetId, equipmentState]);

  const printSheet = async (mode: 'saved' | 'field') => {
    if (mode === 'saved') {
      setPrintMode('saved');
      window.requestAnimationFrame(() => window.print());
      return;
    }
    if (!data || issuingPaper) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(plannedForDate)) {
      toast.error('Select the planned field inspection date before issuing the sheet.');
      return;
    }
    const unresolved = missingInspectionTaskMappings(data.groups, data.explicitTaskPointLinks || []);
    if (unresolved.taskCount) {
      toast.error(unresolved.taskCount + ' shared-part PM tasks need exact inspection-check mapping before the paper sheet can be issued.');
      if (canPlan) setMappingPartId(unresolved.firstComponentId);
      return;
    }
    setIssuingPaper(true);
    try {
      const requestKey = pendingIssueKey.current || crypto.randomUUID();
      pendingIssueKey.current = requestKey;
      const allowedRecordable = new Set(data.groups.flatMap((group) => group.points
        .filter(isRecordablePaperPoint).map((point) => point.id)));
      const sections = buildPaperInspectionTasks(data.groups, data.generalTasks, data.explicitTaskPointLinks || []);
      const taskPointLinks = sections.flatMap((section) => section.rows.flatMap((row) =>
        row.pointId && allowedRecordable.has(row.pointId)
          ? [{ pmTaskId: section.id, inspectionPointId: row.pointId }]
          : []));
      const pointIds = [...new Set(taskPointLinks.map((pair) => pair.inspectionPointId))];
      const taskIds = Array.from(new Set([
        ...data.groups.flatMap((g) => g.tasks.map((t) => t.id)),
        ...data.generalTasks.map((t) => t.id),
      ]));
      const response = await api.post<{ reference: string; issuedAt: string }>(
        '/api/pm-inspections/sheets', {
          assetId, equipmentState, requestKey, pointIds, taskIds, taskPointLinks,
          plannedForDate, purpose: inspectionPurpose,
        });
      if (!response.success || !response.data) throw new Error(response.error || 'Could not issue paper reference');
      const issued = {
        reference: response.data.reference, issuedAt: response.data.issuedAt,
        plannedForDate, purpose: inspectionPurpose,
      };
      pendingIssueKey.current = null;
      setPrintedIssue(issued);
      setPrintMode('field');
      void loadIssued();
      window.requestAnimationFrame(() => window.print());
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not issue paper inspection sheet');
    } finally {
      setIssuingPaper(false);
    }
  };
  const [showSetupIssues, setShowSetupIssues] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ assetId, equipmentState });
      const result = await api.get<MachineChecklistResponse>(`/api/pm-inspections/checklist?${params}`);
      if (!result.success || !result.data) throw new Error(result.error || 'Could not generate machine checklist');
      setData(result.data);
    } catch (caught) {
      setData(null);
      setError(caught instanceof Error ? caught.message : 'Could not generate machine checklist');
    } finally {
      setLoading(false);
    }
  }, [assetId, equipmentState]);

  useEffect(() => { void load(); }, [load, reloadKey, reload]);
  useEffect(() => { void loadIssued(); }, [loadIssued, reload]);
  useEffect(() => {
    // A previous machine's unsaved readings must NEVER be silently submitted
    // against a newly selected machine or another inspection state.
    setEntries({});
    setSaveProgress('');
    setShowSetupIssues(false);
    setCaptureMode('digital');
    setPaperInspector('');
    setPaperReference('');
    setPrintedIssue(null);
    setInspectionPurpose('early_check');
    setPlannedForDate(new Date().toISOString().slice(0, 10));
    setMappingPartId(null);
    setTaskFilter('all');
    setPartSearch('');
    pendingIssueKey.current = null;
  }, [assetId, equipmentState]);

  const points = useMemo(() => data?.groups.flatMap((group) => group.points) || [], [data]);
  const taskSections = useMemo(
    () => data ? buildPaperInspectionTasks(data.groups, data.generalTasks, data.explicitTaskPointLinks || []) : [],
    [data],
  );
  const unresolvedMapping = useMemo(
    () => missingInspectionTaskMappings(data?.groups || [], data?.explicitTaskPointLinks || []),
    [data],
  );
  const activeIssuedSheet = issuedSheets.find((sheet) => sheet.reference === paperReference);
  const missingSheetReadings = useMemo(() => {
    if (!data || !activeIssuedSheet?.missingPointIds) return [];
    return activeIssuedSheet.missingPointIds.map((id) => {
      const group = data.groups.find((candidate) => candidate.points.some((point) => point.id === id));
      const point = group?.points.find((candidate) => candidate.id === id);
      return {
        id,
        partCode: group?.component.componentCode || 'Previously configured part',
        name: point?.name || 'Check no longer in current machine configuration',
      };
    });
  }, [activeIssuedSheet, data]);
  const readiness = useMemo(
    () => data ? assessMachineInspectionReadiness(data.groups, data.generalTasks) : null,
    [data],
  );
  const setupPointIds = useMemo(
    () => new Set(readiness?.issues.flatMap((issue) => issue.pointId ? [issue.pointId] : []) || []),
    [readiness],
  );
  const visibleGroups = useMemo(() => {
    if (!data) return [];
    if (!showSetupIssues) return data.groups;
    return data.groups
      .filter((group) => group.points.length === 0 || group.points.some((point) => setupPointIds.has(point.id)))
      .map((group) => ({
        ...group,
        points: group.points.filter((point) => setupPointIds.has(point.id)),
      }));
  }, [data, showSetupIssues, setupPointIds]);
  const filteredPartGroups = useMemo(() => {
    const term = partSearch.trim().toLowerCase();
    if (!term) return visibleGroups;
    return visibleGroups.filter((group) =>
      [group.component.name, group.component.componentCode,
        ...(group.component.hierarchyPath || []).flatMap((node) => [node.code, node.name])]
        .some((value) => value.toLowerCase().includes(term)));
  }, [visibleGroups, partSearch]);
  const displayGroups = useMemo(() => {
    type DisplayGroup = MachineChecklistGroup & {
      paperTask: PaperInspectionTask | null; showTaskHeading: boolean; mappingRequired: boolean;
    };
    if (!data) return [] as DisplayGroup[];
    if (entryLayout === 'part') {
      return filteredPartGroups.map((group) => ({
        ...group, paperTask: null, showTaskHeading: false, mappingRequired: false,
      }));
    }
    const sectionList = buildPaperInspectionTasks(filteredPartGroups, showSetupIssues ? [] : data.generalTasks)
      .filter((section) => taskFilter === 'all' || section.id === taskFilter);
    const byPart = new Map(filteredPartGroups.map((group) => [group.component.id, group]));
    return sectionList.flatMap((section) => {
      const partIds = Array.from(new Set(section.rows.flatMap((row) => row.partId ? [row.partId] : [])));
      return partIds.flatMap((partId, index) => {
        const source = byPart.get(partId);
        if (!source) return [];
        const scoped = inspectionPointsForTask(source, section.id, data.explicitTaskPointLinks || []);
        return [{
          ...source,
          points: scoped.points,
          mappingRequired: scoped.mappingRequired,
          tasks: source.tasks.filter((assignment) => assignment.pmTask.id === section.id),
          paperTask: section,
          showTaskHeading: index === 0,
        }];
      });
    });
  }, [data, entryLayout, filteredPartGroups, showSetupIssues, taskFilter]);

  const getDraft = (id: string): EntryState => entries[id] || EMPTY_DRAFT;
  const edit = (id: string, patch: Partial<EntryState>) => {
    setEntries((current) => ({
      ...current,
      [id]: { ...EMPTY_DRAFT, ...current[id], ...patch, requestKey: '', saved: false, error: '', workOrder: null },
    }));
  };
  const hasInput = (point: MachineChecklistPoint, entry: EntryState) => (
    point.inspectionType === 'visual'
      ? Boolean(entry.findings.trim())
      : Boolean(entry.value.trim() || entry.findings.trim() || entry.recommendation.trim() || entry.outcome !== 'pass')
  );

  const save = async (selected: MachineChecklistPoint[]) => {
    if (busy || !canRecord || selected.length === 0) return;
    const snapshot = selected.map((point) => ({ point, entry: { ...getDraft(point.id) } }));
    const invalid = snapshot.find(({ point, entry }) => validateMachineChecklistEntry(point, entry));
    if (invalid) {
      const reason = validateMachineChecklistEntry(invalid.point, invalid.entry) || 'Incomplete record';
      setEntries((current) => ({
        ...current, [invalid.point.id]: { ...EMPTY_DRAFT, ...current[invalid.point.id], error: reason },
      }));
      toast.error(`${invalid.point.name}: ${reason}`);
      return;
    }

    // Validate physical inspection evidence BEFORE any readings are written.
    // One paper can have many points inspected at different times.
    const captureByPoint = new Map<string, InspectionCaptureEvidence>();
    try {
      for (const { point, entry } of snapshot) {
        const raw = entry.fieldInspectedAt ? new Date(entry.fieldInspectedAt) : new Date(NaN);
        captureByPoint.set(point.id, parseInspectionCaptureEvidence(
          captureMode === 'paper' ? {
            captureSource: 'paper',
            fieldInspectedAt: Number.isFinite(raw.getTime()) ? raw.toISOString() : '',
            fieldInspectorName: paperInspector,
            paperReference,
          } : { captureSource: 'digital' },
        ));
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Invalid paper inspection details';
      toast.error(message);
      return;
    }
    setBusy(true);
    let succeeded = 0;
    let failed = 0;
    const failures: string[] = [];
    try {
      // Sequential writes preserve a clear per-row audit trail; completed rows
      // stay completed if a later request fails. Keys persist for safe retries.
      for (const { point, entry } of snapshot) {
        const requestKey = entry.requestKey || crypto.randomUUID();
        setSaveProgress(`Recording ${succeeded + failed + 1} / ${snapshot.length}`);
        setEntries((current) => ({
          ...current,
          [point.id]: { ...EMPTY_DRAFT, ...current[point.id], requestKey, saving: true, error: '' },
        }));
        try {
          const result = await api.post<{
            record: { id: string; result: string };
            workOrder: { woNumber: string; status: string } | null;
            duplicate?: boolean;
          }>(`/api/pm-inspections/${encodeURIComponent(point.id)}/records`, {
            outcome: entry.outcome,
            value: point.inspectionType === 'measurement' ? entry.value : '',
            findings: entry.findings.trim(),
            recommendation: entry.recommendation.trim(),
            requestKey,
            equipmentState,
            inspectionPurpose: captureMode === 'paper'
              ? (activeIssuedSheet?.purpose || inspectionPurpose) : inspectionPurpose,
            ...captureByPoint.get(point.id),
          });
          if (!result.success || !result.data) throw new Error(result.error || 'Inspection could not be saved');
          succeeded += 1;
          setEntries((current) => ({
            ...current,
            [point.id]: {
              ...EMPTY_DRAFT, ...current[point.id], requestKey,
              saving: false, saved: true, error: '',
              workOrder: result.data?.workOrder?.woNumber || null,
              recordedOutcome: result.data?.record.result,
            },
          }));
        } catch (caught) {
          failed += 1;
          const message = caught instanceof Error ? caught.message : 'Submission failed';
          failures.push(`${point.name}: ${message}`);
          setEntries((current) => ({
            ...current,
            [point.id]: { ...EMPTY_DRAFT, ...current[point.id], requestKey, saving: false, error: message },
          }));
        }
      }
      if (succeeded) {
        toast.success(`${succeeded} inspection reading${succeeded === 1 ? '' : 's'} saved. Abnormal readings are sent to corrective WO planning.`);
        // Reload the authoritative latest readings and outstanding WO numbers.
        setReload((value) => value + 1);
        onRecorded();
        void loadIssued();
      }
      if (failed) toast.error(`${failed} item${failed === 1 ? '' : 's'} not saved. Fix and retry; already saved rows will not be repeated.`);
      setSaveProgress(failures.length ? failures[0] : `${succeeded} entries saved`);
    } finally {
      setBusy(false);
    }
  };

  const ready = points.filter((point) => {
    const draft = getDraft(point.id);
    return !draft.saved && (draft.outcome === 'not_measured' || hasInput(point, draft));
  });
  const exportCsv = () => {
    if (!data) return;
    const rows: unknown[][] = [
      ['Machine', data.machine.name, 'Asset code', data.machine.assetTag, 'Inspection state', data.equipmentState, 'Generated', data.generatedAt],
      ['Part code', 'Part description', 'PM tasks', 'Inspection / parameter', 'Method', 'Normal min', 'Normal max', 'Unit', 'Latest recorded value', 'Latest result', 'Latest remark', 'Latest time', 'Outstanding corrective WO', 'Recorded operating state',
        'Reading source', 'Field inspector', 'Original field time', 'Paper reference'],
    ];
    for (const group of data.groups) {
      const allAssignedTasks = group.tasks.map((item) => `#${item.pmTask.taskNumber} ${item.pmTask.description}`).join('; ');
      if (!group.points.length) rows.push([group.component.componentCode, group.component.name, allAssignedTasks, 'UNCONFIGURED']);
      for (const point of group.points) {
        const limits = parseInspectionLimits(point.normalRange);
        const taskLabels = inspectionTaskLabelsForPoint(group, point.id, data.explicitTaskPointLinks || []);
        rows.push([
          group.component.componentCode, group.component.name,
          taskLabels.length ? taskLabels.join('; ') : 'UNMAPPED — planner review required', point.name,
          point.inspectionType, limits.min ?? '', limits.max ?? '', limits.unit || '',
          point.latestRecord?.value || '', point.latestRecord?.result || '',
          point.latestRecord?.findings || '', point.latestRecord ? dateTime(point.latestRecord.inspectedAt) : '',
          point.openCorrectiveWorkOrder?.woNumber || '',
          point.latestRecord?.equipmentState || 'unknown',
          point.latestRecord?.captureSource || 'unknown',
          point.latestRecord?.fieldInspectorName || '',
          point.latestRecord?.fieldInspectedAt ? dateTime(point.latestRecord.fieldInspectedAt) : '',
          point.latestRecord?.paperReference || '',
        ]);
      }
    }
    for (const task of data.generalTasks) rows.push(['UNASSIGNED', 'Whole machine', `#${task.pmTask.taskNumber} ${task.pmTask.description}`, 'Assign a part first']);
    const csv = '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
    const blobUrl = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `inspection-${data.machine.assetTag}-${data.equipmentState}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  };

  return (
    <section aria-label="Machine running or standstill inspection checklist" data-testid="pm-machine-checklist" className="min-w-0 space-y-3 rounded-xl border p-2.5 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <h3 className="break-words text-base font-bold">Machine Action List — {equipmentState === 'running' ? 'Running' : 'Standstill'}</h3>
          {data && <>
            <p className="break-words text-sm font-semibold">{data.machine.name}</p>
            <p className="break-all text-xs text-muted-foreground">{data.machine.assetTag} · Generated {dateTime(data.generatedAt)}</p>
          </>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setReload((v) => v + 1)} disabled={busy || loading}><RefreshCw className="mr-1 h-3.5 w-3.5"/>Refresh</Button>
          {canPlan && <Button type="button" size="sm" variant="outline" onClick={() => setParameterSetupOpen(true)}
            disabled={!data || busy}><Gauge className="mr-1 h-3.5 w-3.5"/>Assign Parameters & Limits</Button>}
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!data || busy}><Download className="mr-1 h-3.5 w-3.5"/>Export CSV</Button>
          <Button type="button" size="sm" variant="default" onClick={() => void printSheet('field')} disabled={!data || busy || loading || issuingPaper} aria-label="Print task-grouped blank Action List">{issuingPaper ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin"/> : <Printer className="mr-1 h-3.5 w-3.5"/>}Print Blank Action List</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void printSheet('saved')} disabled={!data || busy || loading || issuingPaper} aria-label="Print saved Action List readings"><Printer className="mr-1 h-3.5 w-3.5"/>Print Saved Readings</Button>
          <Button size="sm" variant="outline" onClick={onClose} disabled={busy}>Close Action List</Button>
        </div>
      </div>
      {loading && <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin"/>Generating the machine's assigned inspection checklist…</p>}
      {error && <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
      {data && !loading && <>
        <div className="flex flex-wrap gap-2 rounded-lg border bg-muted/20 p-3" data-testid="pm-field-visit-planning">
          <div className="min-w-0 flex-1 space-y-1 sm:max-w-[230px]">
            <Label className="text-xs">Planned field inspection date</Label>
            <Input type="date" aria-label="Planned field inspection date" value={plannedForDate}
              disabled={busy || issuingPaper}
              onChange={(event) => {
                setPlannedForDate(event.target.value);
                setPrintedIssue(null);
                pendingIssueKey.current = null;
              }} />
          </div>
          <div className="w-full space-y-1 sm:w-[220px]">
            <Label className="text-xs">Inspection purpose</Label>
            <Select value={inspectionPurpose} disabled={busy || issuingPaper}
              onValueChange={(value) => {
                setInspectionPurpose(value as InspectionPurpose);
                setPrintedIssue(null);
                pendingIssueKey.current = null;
              }}>
              <SelectTrigger aria-label="Inspection purpose"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="early_check">Early condition inspection</SelectItem>
                <SelectItem value="routine">Routine inspection</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="w-full text-xs text-muted-foreground">
            {inspectionPurpose === 'early_check'
              ? 'Early inspections may take place before the scheduled PM due date. Readings remain auditable, but do not complete the scheduled work order or reset inspection due dates.'
              : 'Routine inspection readings follow their own configured checkpoint recurrence. Scheduled PM work orders retain their separate due dates.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          <Badge variant="outline">{taskSections.length} inspection task groups</Badge>
          <Badge variant="outline">{data.totalAssignments} part/task assignments</Badge>
          <Badge variant="outline">{taskSections.reduce((sum, task) => sum + task.rows.length, 0)} value/observation rows on printout</Badge>
          <Badge variant="outline">{data.groups.length} registered parts</Badge>
          <Badge variant="outline">{data.totalConfiguredPoints} configured checks</Badge>
          {data.unconfiguredTasks > 0 && <Badge variant="secondary">{data.unconfiguredTasks} tasks need part/check configuration</Badge>}
        </div>
        {readiness && (
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 p-3" data-testid="pm-machine-readiness">
            <div className="min-w-0 space-y-1 text-xs">
              <p className="font-semibold">Inspection setup readiness</p>
              <p>{readiness.readyPoints} recordable checks · {readiness.blockers} setup blockers · {readiness.warnings} threshold warnings</p>
              <p className="text-muted-foreground">
                Missing parts, methods or parameters block entry. Missing numeric thresholds allow manual assessment,
                but automatic out-of-range detection is unavailable until the planner configures limits.
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" disabled={!readiness.issues.length}
              aria-pressed={showSetupIssues} onClick={() => setShowSetupIssues((current) => !current)}
              data-testid="pm-machine-readiness-filter">
              {showSetupIssues ? 'Show all checks' : 'Review setup issues (' + readiness.issues.length + ')'}
            </Button>
          </div>
        )}
        {unresolvedMapping.partCount > 0 && (
          <div role="note" className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300/70 p-3 text-xs text-amber-800 dark:text-amber-300"
            data-testid="pm-shared-check-task-warning">
            <p className="min-w-0 flex-1 break-words">
              {unresolvedMapping.taskCount} task(s) across {unresolvedMapping.partCount} shared part(s)
              still need explicit inspection-check mapping. Do not print or guess readings for those tasks.
            </p>
            {canPlan && unresolvedMapping.firstComponentId && <Button size="sm" variant="outline"
              onClick={() => setMappingPartId(unresolvedMapping.firstComponentId)}>
              Map task readings
            </Button>}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Print the blank sheet to see each inspection task followed by ALL the parts assigned to it, including their assembly/subassembly codes and an actual-reading box on every row.
          Record measured temperature, vibration, pressure or sound in their configured units; for sight and qualitative sound checks, describe what you observed.
          The server validates limits and drafts corrective work orders for abnormalities. Saving readings does not close PM work orders.
        </p>
        {!data.totalAssignments && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No active {equipmentState} inspection tasks are assigned to this machine. Configure them in PM Planning before capturing a checklist.
        </p>}
        <div className="space-y-2 rounded-lg border p-3" data-testid="pm-inspection-capture-source">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">How were these readings taken?</p>
              <p className="text-xs text-muted-foreground">
                Paper entry keeps the original field inspector and inspection time separate from the logged-in person entering the data.
              </p>
            </div>
            <div className="w-full sm:w-[230px] space-y-1">
              <Label className="text-xs">Reading source</Label>
              <Select value={captureMode} disabled={busy} onValueChange={(value) => {
                if (ready.length && !window.confirm('Change the source and clear unsaved readings?')) return;
                setEntries({});
                setCaptureMode(value as 'digital' | 'paper');
              }}>
                <SelectTrigger aria-label="Inspection reading source" className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="digital">Direct electronic inspection</SelectItem>
                  <SelectItem value="paper">Transcribe paper worksheet</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {captureMode === 'paper' && (
            <div className="grid min-w-0 gap-2 sm:grid-cols-2" data-testid="pm-paper-evidence">
              <div className="min-w-0 space-y-1">
                <Label className="text-xs">Field inspector (name written on paper)</Label>
                <Input aria-label="Paper field inspector" value={paperInspector} disabled={busy}
                  maxLength={160} placeholder="Technician who physically inspected"
                  onChange={(event) => setPaperInspector(event.target.value)} />
              </div>
              <div className="min-w-0 space-y-1">
                <Label className="text-xs">Paper sheet reference</Label>
                <Input aria-label="Paper worksheet reference" value={paperReference} disabled={busy}
                  maxLength={120} placeholder="e.g. C314-OPM-P267-09NOV2026"
                  onChange={(event) => setPaperReference(event.target.value)} />
              </div>
              {issuedSheets.length > 0 && <div className="sm:col-span-2 space-y-1">
                <Label className="text-xs">Issued paper worksheets (select to enter readings)</Label>
                <Select value={issuedSheets.some((sheet) => sheet.reference === paperReference) ? paperReference : ''}
                  disabled={busy} onValueChange={setPaperReference}>
                  <SelectTrigger aria-label="Select issued paper worksheet" className="w-full"><SelectValue placeholder="Choose issued sheet or type an older external reference" /></SelectTrigger>
                  <SelectContent>{issuedSheets.map((sheet) => <SelectItem key={sheet.reference} value={sheet.reference}>
                    {sheet.reference} · {sheet.plannedForDate || 'Date unknown'} · {sheet.purpose === 'early_check' ? 'Early' : 'Routine'} · {sheet.entered}/{sheet.expected} entered ({sheet.status.replace('_', ' ')})
                  </SelectItem>)}</SelectContent>
                </Select>
              </div>}
              {activeIssuedSheet && (
                <div className="sm:col-span-2 space-y-1 rounded-md border p-2.5 text-xs"
                  data-testid="pm-paper-missing-readings" aria-live="polite">
                  <p className="font-semibold">
                    {activeIssuedSheet.status === 'requires_setup'
                      ? 'This sheet needs planner configuration before readings can be entered.'
                      : activeIssuedSheet.remaining === 0
                        ? activeIssuedSheet.followUpRequired
                          ? `${activeIssuedSheet.followUpRequired} reading(s) could not be measured — planner follow-up required.`
                          : 'All configured readings have been entered for this sheet.'
                        : `${activeIssuedSheet.remaining} reading${activeIssuedSheet.remaining === 1 ? '' : 's'} remaining on this sheet`}
                  </p>
                  {activeIssuedSheet.remaining > 0 && missingSheetReadings.length > 0 && (
                    <ul className="list-inside list-disc space-y-1">
                      {missingSheetReadings.map((item) => (
                        <li key={item.id} className="break-words">
                          <span className="font-medium">{item.partCode}</span> · {item.name}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-muted-foreground">
                    {activeIssuedSheet.followUpRequired
                      ? `${activeIssuedSheet.followUpRequired} N/A check(s) require a suitable follow-up measurement. `
                      : ''}
                    {activeIssuedSheet.purpose === 'early_check'
                      ? 'Early inspection: no scheduled PM due date is reset. '
                      : ''}
                    Based on readings saved against this issued reference. A fully entered sheet still requires normal planner review.
                  </p>
                </div>
              )}
              <p className="sm:col-span-2 text-xs text-muted-foreground">
                For each part below, enter the exact date and time shown on the returned paper.
                The system also records who typed it in and when. Never backdate the electronic entry timestamp.
              </p>
            </div>
          )}
        </div>
        {issuedSheets.length > 0 && <div data-testid="pm-paper-sheet-register" className="space-y-1 rounded-lg border p-2.5 text-xs">
          <p className="font-semibold">Issued paper sheets · {issuedSheets.length} recent</p>
          {issuedSheets.slice(0, 5).map((sheet) => (
            <div key={sheet.reference} className="flex flex-wrap justify-between gap-2 py-1">
              <span className="break-all font-medium">{sheet.reference}</span>
              <span>{sheet.entered} / {sheet.expected} entered · {sheet.status.replace('_',' ')}</span>
            </div>
          ))}
          <p className="text-muted-foreground">Completion counts configured checks only; unconfigured parts still need planner setup.</p>
        </div>}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5">
          <div>
            <p className="text-sm font-semibold">Enter inspection readings</p>
            <p className="text-xs text-muted-foreground">
              The task view follows the printed worksheet. Shared part/check points are saved once even if listed under multiple tasks.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant={entryLayout === 'task' ? 'default' : 'outline'}
              aria-pressed={entryLayout === 'task'} onClick={() => setEntryLayout('task')}>By Task (Paper Order)</Button>
            <Button type="button" size="sm" variant={entryLayout === 'part' ? 'default' : 'outline'}
              aria-pressed={entryLayout === 'part'} onClick={() => setEntryLayout('part')}>By Part</Button>
          </div>
        </div>
        <div className="grid min-w-0 gap-2 rounded-lg border p-3 md:grid-cols-2" data-testid="pm-machine-inspection-navigation">
          <div className="space-y-1">
            <Label className="text-xs">Find a part by name or code</Label>
            <Input value={partSearch} onChange={(event) => setPartSearch(event.target.value)}
              aria-label="Search parts in machine inspection checklist"
              placeholder="e.g. bearing, motor, C314-21-04" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Inspection task (on-screen view only)</Label>
            <Select value={taskFilter} onValueChange={(value) => { setTaskFilter(value); setEntryLayout('task'); }}>
              <SelectTrigger aria-label="Choose inspection task"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All inspection tasks ({taskSections.length})</SelectItem>
                {taskSections.map((section) => <SelectItem key={section.id} value={section.id}>
                  #{section.number} {section.instruction} ({new Set(section.rows.map((row) => row.partId).filter(Boolean)).size} parts)
                </SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground md:col-span-2">
            These filters affect only the on-screen list; the printed field sheet still includes every assigned inspection task and part.
          </p>
        </div>
        {displayGroups.length === 0 && partSearch.trim() && (
          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">No parts match your search. Clear the part search to see the full machine.</p>
        )}
        {data.generalTasks.length > 0 && (
          <div className="rounded-lg border border-amber-200 p-3 dark:border-amber-900">
            <p className="text-sm font-semibold">General machine checks — part assignment required</p>
            <p className="mb-2 text-xs text-muted-foreground">These PM tasks were assigned to the whole machine. Select the exact part or instrument in PM Planning before entering check values.</p>
            {data.generalTasks.map((task) => <p key={task.id} className="break-words py-1 text-xs">Task #{task.pmTask.taskNumber}: {task.pmTask.description}</p>)}
          </div>
        )}
        {displayGroups.map((group) => (
          <div key={group.paperTask ? group.paperTask.id + ':' + group.component.id : group.component.id}
            className="min-w-0 space-y-2 rounded-lg border" data-testid="pm-machine-checklist-part">
            {group.showTaskHeading && group.paperTask && (
              <div data-testid="pm-machine-task-heading" className="rounded-t-lg bg-slate-100 p-3 text-sm font-bold text-slate-900 dark:bg-slate-800 dark:text-slate-100">
                Task #{group.paperTask.number}: {group.paperTask.instruction} · {new Set(group.paperTask.rows.map((row) => row.partId).filter(Boolean)).size} assigned parts
              </div>
            )}
            <div className="rounded-t-lg bg-muted/40 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="break-words text-sm font-bold">{group.component.name}</h4>
                  <p className="break-all text-xs text-muted-foreground">{group.component.componentCode} · {group.component.componentType}</p>
                </div>
                <div className="flex items-center gap-2">
                  {canPlan && <Button size="sm" variant="outline"
                    onClick={() => setMappingPartId(group.component.id)}>Map task readings</Button>}
                  <Badge variant="outline">{group.points.length} inspection checks</Badge>
                </div>
              </div>
              {group.tasks.map((task) => <p key={task.id} className="mt-1 break-words text-xs text-muted-foreground">
                <span className="font-semibold">Task #{task.pmTask.taskNumber}:</span> {task.pmTask.description}
              </p>)}
            </div>
            {group.points.length === 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 p-3">
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {group.mappingRequired
                    ? 'This part has configured checks, but none are assigned to this specific PM task. Ask the planner to map them.'
                    : 'No sight or instrument point configured on this part. Do not enter or infer readings.'}
                </p>
                {canPlan && (group.mappingRequired ? (
                  <Button size="sm" variant="outline" onClick={() => setMappingPartId(group.component.id)}>Map task readings</Button>
                ) : <Button size="sm" variant="outline" onClick={() => onConfigure(group.tasks[0])}>Configure Check</Button>)}
              </div>
            ) : (
              <div className="min-w-0 space-y-2 p-2 sm:p-3">
                {group.points.map((point) => {
                  const limits = parseInspectionLimits(point.normalRange);
                  const entry = getDraft(point.id);
                  const outOfRange = machineChecklistOutOfRange(point, entry.value);
                  const supported = point.inspectionType === 'measurement' || point.inspectionType === 'visual';
                  const recordable = supported && (point.inspectionType !== 'measurement' || Boolean(point.parameterKey?.trim()));
                  return (
                    <div key={point.id} className="min-w-0 space-y-2 rounded-lg border p-2.5 sm:p-3" data-testid="pm-machine-checklist-row">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            {point.inspectionType === 'measurement' ? <Gauge className="h-4 w-4 shrink-0 text-emerald-600"/> : <Eye className="h-4 w-4 shrink-0 text-emerald-600"/>}
                            <p className="break-words text-sm font-semibold">{point.name}</p>
                          </div>
                          {point.description && <p className="break-words text-xs text-muted-foreground">{point.description}</p>}
                          <p className="text-xs text-muted-foreground">
                            {point.inspectionType === 'measurement'
                              ? `Instrument · ${point.parameterKey || 'Unconfigured parameter'} · Accepted ${limits.min ?? '—'} to ${limits.max ?? '—'} ${limits.unit || ''}`
                              : point.inspectionType === 'visual' ? 'Sight / qualitative observation' : `Legacy ${point.inspectionType}: needs configuration`}
                          </p>
                          {point.inspectionType === 'measurement' && limits.min === null && limits.max === null && (
                            <p className="text-xs text-amber-700 dark:text-amber-300">
                              No numeric acceptance limits configured. Automatic out-of-range detection is unavailable;
                              the technician must assess the reading and the planner should set valid limits.
                            </p>
                          )}
                        </div>
                        <Badge variant={point.dueState === 'overdue' ? 'destructive' : 'outline'}>{point.dueState.replace('_', ' ')}</Badge>
                      </div>
                      {recordable && canRecord && <>
                      {captureMode === 'paper' && (
                        <div className="min-w-0 space-y-1">
                          <Label className="text-xs">Original field inspection date/time for this part</Label>
                          <Input type="datetime-local" step="60" aria-label={`Field inspection date/time: ${point.name}`}
                            className="w-full sm:max-w-xs" disabled={busy}
                            value={entry.fieldInspectedAt || ''}
                            onChange={(event) => edit(point.id, { fieldInspectedAt: event.target.value })}/>
                        </div>
                      )}
                      <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_10rem] sm:items-start">
                        <div className="min-w-0 space-y-1">
                          {point.inspectionType === 'measurement' ? <>
                            <Label className="text-xs">Actual reading ({limits.unit || 'unit'})</Label>
                            <Input inputMode="decimal" type="number" step="any" aria-label={`Actual reading: ${point.name}`}
                              value={entry.value} disabled={busy || entry.outcome === 'not_measured'}
                              placeholder={entry.outcome === 'not_measured' ? 'N/A — explain below' : 'Enter measured value'}
                              onChange={(e) => edit(point.id, { value: e.target.value })}/>
                            {outOfRange && <p className="flex items-center gap-1 text-[11px] text-destructive"><AlertTriangle className="h-3 w-3 shrink-0"/>Outside configured limits — corrective review required</p>}
                          </> : <>
                            <Label className="text-xs">Actual sight / sound observation</Label>
                            <Textarea rows={2} aria-label={`Observed condition: ${point.name}`}
                              value={entry.findings} disabled={busy} placeholder="E.g. no leaks; regular sound, no unusual vibration"
                              onChange={(e) => edit(point.id, { findings: e.target.value })}/>
                          </>}
                        </div>
                        <div className="min-w-0 space-y-1">
                          {point.inspectionType === 'measurement' && <>
                            <Label className="text-xs">Observations / remarks</Label>
                            <Textarea rows={2} aria-label={`Inspection remarks: ${point.name}`} value={entry.findings} disabled={busy}
                              placeholder={entry.outcome === 'not_measured'
                                ? 'State why this reading cannot be obtained while stopped; identify the required follow-up method.'
                                : 'What did you see or hear? Describe abnormal conditions.'}
                              onChange={(e) => edit(point.id, { findings: e.target.value })}/>
                          </>}
                          <Label className="text-xs">Recommended action (optional)</Label>
                          <Input value={entry.recommendation} disabled={busy} placeholder="What should be inspected or repaired?"
                            aria-label={`Recommended action: ${point.name}`}
                            onChange={(e) => edit(point.id, { recommendation: e.target.value })}/>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Technician assessment</Label>
                          <Select value={entry.outcome} disabled={busy} onValueChange={(value) => edit(point.id, {
                            outcome: value as MachineChecklistDraft['outcome'],
                            ...(value === 'not_measured' ? { value: '' } : {}),
                          })}>
                            <SelectTrigger aria-label={`Assessment: ${point.name}`}><SelectValue/></SelectTrigger>
                            <SelectContent><SelectItem value="pass">Normal</SelectItem><SelectItem value="needs_attention">Needs attention</SelectItem><SelectItem value="fail">Defect / Fail</SelectItem>
                              {point.inspectionType === 'measurement' && <SelectItem value="not_measured">Not measurable — explain why</SelectItem>}
                            </SelectContent>
                          </Select>
                          <Button size="sm" className="w-full" variant="outline" disabled={busy || entry.saved}
                            onClick={() => void save([point])}><Save className="mr-1.5 h-3.5 w-3.5"/>{entry.saved ? 'Saved' : 'Save reading'}</Button>
                        </div>
                      </div>
                      </>}
                      {!recordable && <p className="text-xs text-amber-700 dark:text-amber-300">
                        {supported ? 'A planner must configure the measurement parameter before readings can be recorded.'
                          : 'This legacy check needs a new sight or instrument point before it can be recorded.'}
                      </p>}
                      {entry.error && <p role="alert" className="text-xs text-destructive">{entry.error}</p>}
                      {entry.saved && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300">
                        Recorded: {entry.recordedOutcome?.replace('_', ' ') || 'saved'}{entry.workOrder ? ` · Corrective ${entry.workOrder} awaiting planner workflow` : ''}
                      </p>}
                      {point.openCorrectiveWorkOrder && <p className="break-words text-xs text-amber-700 dark:text-amber-300">
                        Existing corrective {point.openCorrectiveWorkOrder.woNumber} ({point.openCorrectiveWorkOrder.status}) — next due remains pending verified closeout.
                      </p>}
                      <p className="text-[11px] text-muted-foreground">
                        {point.inspectionType === 'visual' && actionListAcceptance(point.normalRange) &&
                          <span className="block">Approved visual criterion: {actionListAcceptance(point.normalRange)}</span>}
                        Latest: {point.latestRecord
                          ? `${point.latestRecord.result.replace('_', ' ')} · ${point.latestRecord.value ?? point.latestRecord.findings ?? 'observation'} · ${dateTime(point.latestRecord.inspectedAt)}`
                          : 'Not yet recorded'}
                        {point.latestRecord && ` · Operating: ${point.latestRecord.equipmentState || 'unknown (legacy)'}`}
                        {point.latestRecord?.inspectionPurpose === 'early_check' && ' · Early check (PM due unchanged)'}
                        {point.latestRecord?.captureSource === 'paper' && (
                          <span className="block break-words">
                            Paper ${point.latestRecord.paperReference || 'reference unknown'} · Field inspector ${point.latestRecord.fieldInspectorName || 'unknown'} ·
                            Checked ${dateTime(point.latestRecord.fieldInspectedAt || null)} · Entered ${dateTime(point.latestRecord.inspectedAt)}
                          </span>
                        )}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <div className="min-w-0 text-xs text-muted-foreground">
            <p>{points.length} configured part checks · {ready.length} entered and unsaved</p>
            {saveProgress && <p role="status" className="break-words">{saveProgress}</p>}
          </div>
          {canRecord && <Button size="sm" disabled={busy || ready.length === 0}
            onClick={() => void save(ready)}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin"/> : <ClipboardCheck className="mr-1.5 h-4 w-4"/>}
            Save Entered Readings ({ready.length})
          </Button>}
        </div>
      </>}
      {data && !loading && <PmMachineInspectionPrint data={data} mode={printMode} printedIssue={printedIssue} />}
      <PmActionListParameterSetup assetId={assetId} equipmentState={equipmentState} open={canPlan && parameterSetupOpen}
        onClose={() => setParameterSetupOpen(false)}
        onSaved={() => {
          pendingIssueKey.current = null;
          setPrintedIssue(null);
          setReload(value => value + 1);
        }}/>
      <PmInspectionTaskPointMapper
        componentId={mappingPartId}
        componentCode={data?.groups.find((group) => group.component.id === mappingPartId)?.component.componentCode || ''}
        onClose={() => setMappingPartId(null)}
        onSaved={() => {
          pendingIssueKey.current = null;
          setPrintedIssue(null);
          setReload((current) => current + 1);
        }}
      />
    </section>
  );
}
