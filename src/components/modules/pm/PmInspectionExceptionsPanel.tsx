'use client';

import { formatUiDateTime } from '@/lib/date-display';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ClipboardCheck, Loader2, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { parseInspectionLimits } from '@/lib/pm-inspection';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AsyncSearchableSelect, type SearchableOption } from '@/components/ui/searchable-select';
import { ResponsiveDialog } from '@/components/shared/ResponsiveDialog';

interface ExceptionRow {
  id: string;
  result: string;
  value: string | null;
  findings: string | null;
  recommendation: string | null;
  inspectedAt: string;
  equipmentState: 'running' | 'standstill' | null;
  captureSource?: 'digital' | 'paper' | null;
  fieldInspectedAt?: string | null;
  fieldInspectorName?: string | null;
  paperReference?: string | null;
  inspector: { id: string; fullName: string | null };
  inspectionPoint: {
    id: string; name: string; inspectionType: string;
    parameterKey: string | null; normalRange: string | null;
  };
  component: {
    id: string; name: string; componentCode: string;
    asset: { id: string; name: string; assetTag: string; plantId: string; departmentId: string | null };
  };
  workOrder: { id: string; woNumber: string; status: string } | null;
}

interface ExceptionFilters {
  result: string;
  followUp: string;
  equipmentState: string;
  machine: string;
  from: string;
  to: string;
}
const INITIAL: ExceptionFilters = { result: 'all', followUp: 'all', equipmentState: 'all', machine: '', from: '', to: '' };

function dateLabel(raw: string): string {
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? formatUiDateTime(date) : '—';
}
function stateBadge(value: string) {
  return value === 'fail' ? 'destructive' as const
    : value === 'not_measured' ? 'outline' as const : 'secondary' as const;
}


function ExceptionDetails({ record }: { record: ExceptionRow }) {
            const limits = parseInspectionLimits(record.inspectionPoint.normalRange);
            const open = record.workOrder && !['closed', 'cancelled'].includes(record.workOrder.status);
            const value = record.result === 'not_measured'
              ? 'N/A — no instrument reading taken'
              : record.inspectionPoint.inspectionType === 'measurement'
                ? `${record.value ?? '—'} ${limits.unit || ''}`.trim()
                : record.findings || 'No written observation';
            return <article className="min-w-0 space-y-2 p-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold">{record.component.asset.name}</p>
                  <p className="break-all text-xs text-muted-foreground">{record.component.asset.assetTag}</p>
                  <p className="break-words text-xs">{record.component.name} · {record.component.componentCode}</p>
                </div>
                <Badge variant={stateBadge(record.result)}>
                  {record.result === 'not_measured' ? 'Not measurable' : record.result.replace(/_/g, ' ')}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-md bg-muted/30 p-2 text-xs">
                <div className="min-w-0"><span className="text-muted-foreground">Inspection point</span>
                  <p className="break-words font-semibold">{record.inspectionPoint.name}</p></div>
                <div className="min-w-0"><span className="text-muted-foreground">Actual reading / observation</span>
                  <p className="break-words font-semibold">{value}</p></div>
                <div className="min-w-0"><span className="text-muted-foreground">Configured normal limits</span>
                  <p className="break-words">{record.inspectionPoint.inspectionType === 'measurement'
                    ? (limits.min === null && limits.max === null ? 'Not configured'
                      : `${limits.min ?? '—'} to ${limits.max ?? '—'} ${limits.unit || ''}`)
                    : 'Sight / qualitative'}</p></div>
                <div className="min-w-0"><span className="text-muted-foreground">Recorded</span>
                  <p>{dateLabel(record.inspectedAt)}</p>
                  <p className="break-words">Entered by: {record.inspector?.fullName || 'Unknown user'}</p>
                  {record.captureSource === 'paper' ? <>
                    <p className="mt-1 font-semibold">Paper inspection</p>
                    <p>Original field time: {record.fieldInspectedAt ? dateLabel(record.fieldInspectedAt) : 'Not supplied'}</p>
                    <p className="break-words">Field inspector: {record.fieldInspectorName || 'Not supplied'}</p>
                    <p className="break-all">Sheet: {record.paperReference || 'Not supplied'}</p>
                  </> : <p>Source: {record.captureSource === 'digital' ? 'Direct electronic' : 'Unknown (legacy)'}</p>}
                  <p>State: {record.equipmentState || 'Unknown (legacy)'}</p></div>
              </div>
              {record.findings && <p className="break-words text-xs"><span className="font-semibold">Findings:</span> {record.findings}</p>}
              {record.recommendation && <p className="break-words text-xs"><span className="font-semibold">Recommended:</span> {record.recommendation}</p>}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
                {record.workOrder
                  ? <p className="break-all text-xs"><strong>Corrective WO:</strong> {record.workOrder.woNumber}
                    <Badge variant={open ? 'secondary' : 'outline'} className="ml-1.5">{record.workOrder.status}</Badge></p>
                  : record.result === 'not_measured'
                    ? <p className="text-xs text-amber-700 dark:text-amber-300">
                        Arrange a suitable approved instrument test. No corrective WO is generated solely because a measurement was unavailable.
                      </p>
                    : <p className="text-xs text-amber-700 dark:text-amber-300">No corrective WO linked — planner follow-up needed</p>}
                <Button type="button" size="sm" variant="outline"
                  onClick={() => { window.location.hash = `#/asset-detail?id=${encodeURIComponent(record.component.asset.id)}`; }}>
                  <ClipboardCheck className="mr-1 h-3.5 w-3.5" />View Machine
                </Button>
              </div>
            </article>;
}

/**
 * Read-only, paginated exception/event history for planners.
 * Displays historical abnormalities even when a subsequent point reading
 * passes, so unfinished corrective WOs do not disappear from follow-up.
 */
export function PmInspectionExceptionsPanel({
  assetId, departmentId, reloadKey, onClose,
}: {
  assetId: string;
  departmentId: string;
  reloadKey: number;
  onClose: () => void;
}) {
  const [filters, setFilters] = useState<ExceptionFilters>(INITIAL);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ExceptionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<ExceptionRow | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const updateFilters = (patch: Partial<ExceptionFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setSelectedRecord(null);
    setPage(1);
  };
  const fetchMachines = useCallback(async (query: string): Promise<SearchableOption[]> => {
    const params = new URLSearchParams({ search: query, limit: '100', page: '1' });
    const response = await api.get<Array<{ id: string; name: string; assetTag: string }>>('/api/assets?' + params);
    return response.success && Array.isArray(response.data)
      ? response.data.map((item) => ({ value: item.id, label: item.name + ' [' + item.assetTag + ']' }))
      : [];
  }, []);

  const load = useCallback(async (active: { current: boolean }) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (assetId || filters.machine) params.set('assetId', assetId || filters.machine);
      if (departmentId) params.set('departmentId', departmentId);
      if (filters.result !== 'all') params.set('result', filters.result);
      if (filters.followUp !== 'all') params.set('followUp', filters.followUp);
      if (filters.equipmentState !== 'all') params.set('equipmentState', filters.equipmentState);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      const response = await api.get<ExceptionRow[]>(`/api/pm-inspections/exceptions?${params}`);
      if (!active.current) return;
      if (!response.success || !Array.isArray(response.data)) {
        throw new Error(response.error || 'Could not load inspection exceptions');
      }
      const pagination = (response as typeof response & { pagination?: { total: number } }).pagination;
      setRows(response.data);
      setTotal(pagination?.total ?? response.data.length);
    } catch (cause) {
      if (!active.current) return;
      setRows([]);
      setTotal(0);
      setError(cause instanceof Error ? cause.message : 'Could not load inspection exceptions');
    } finally {
      if (active.current) setLoading(false);
    }
  }, [page, assetId, departmentId, filters, refreshKey, reloadKey]);

  useEffect(() => {
    const active = { current: true };
    void load(active);
    return () => { active.current = false; };
  }, [load]);
  useEffect(() => { setPage(1); }, [assetId, departmentId]);

  const pageCount = Math.max(1, Math.ceil(total / 25));
  const currentPageSummary = useMemo(() => ({
    failures: rows.filter((row) => row.result === 'fail').length,
    needsAttention: rows.filter((row) => row.result === 'needs_attention' || row.result === 'conditional').length,
    notMeasured: rows.filter((row) => row.result === 'not_measured').length,
    noWorkOrder: rows.filter((row) => !row.workOrder && row.result !== 'not_measured').length,
    openWorkOrder: rows.filter((row) =>
      row.workOrder && !['closed', 'cancelled'].includes(row.workOrder.status)).length,
  }), [rows]);

  return (
    <section aria-label="Inspection exception review" data-testid="pm-inspection-exceptions" className="min-w-0 space-y-3 rounded-xl border p-2.5 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 break-words text-base font-semibold">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />Inspection Exceptions
          </h3>
          <p className="text-xs text-muted-foreground">
            Historical abnormal observations and unmeasurable checks, grouped by inspection event.
            An unavailable standstill reading is flagged for a follow-up test, not classified as a failed machine part.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => setRefreshKey((value) => value + 1)}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" />Refresh
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onClose}>Back to List</Button>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <div className="col-span-2 min-w-0 lg:col-span-1">
          <Label className="mb-1.5 text-xs">Machine</Label>
          <AsyncSearchableSelect value={assetId || filters.machine}
            onValueChange={(machine) => updateFilters({ machine })}
            fetchOptions={fetchMachines} placeholder="All machines" searchPlaceholder="Search machine or code"
            disabled={Boolean(assetId)} />
        </div>
        <div><Label className="text-xs">Outcome</Label>
          <Select value={filters.result} onValueChange={(result) => updateFilters({ result })}>
            <SelectTrigger className="mt-1 h-9" aria-label="Outcome"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All findings</SelectItem>
              <SelectItem value="fail">Fail</SelectItem>
              <SelectItem value="needs_attention">Needs attention</SelectItem>
              <SelectItem value="conditional">Legacy conditional</SelectItem>
              <SelectItem value="not_measured">Not measurable — follow-up</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Corrective WO</Label>
          <Select value={filters.followUp} onValueChange={(followUp) => updateFilters({ followUp })}>
            <SelectTrigger className="mt-1 h-9" aria-label="Corrective WO"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="open">Open WO</SelectItem>
              <SelectItem value="none">No linked WO</SelectItem>
              <SelectItem value="closed">Closed / Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">At inspection</Label>
          <Select value={filters.equipmentState} onValueChange={(equipmentState) => updateFilters({ equipmentState })}>
            <SelectTrigger className="mt-1 h-9" aria-label="Inspection operating state"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All states</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="standstill">Standstill</SelectItem>
              <SelectItem value="unknown">Unknown (legacy)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs" htmlFor="pm-exception-from">Entered from</Label>
          <Input id="pm-exception-from" type="date" className="mt-1 h-9" value={filters.from}
            onChange={(event) => updateFilters({ from: event.target.value })} />
        </div>
        <div><Label className="text-xs" htmlFor="pm-exception-to">Entered to</Label>
          <Input id="pm-exception-to" type="date" className="mt-1 h-9" value={filters.to}
            onChange={(event) => updateFilters({ to: event.target.value })} />
        </div>
      </div>
      <p className="rounded-md border border-amber-200 bg-amber-50/30 p-2 text-xs text-muted-foreground dark:border-amber-900">
        New inspection records show the saved Running/Standstill state. Older records display Unknown; this report never infers operating state from today's machine settings.
      </p>

      {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading plant-authorized inspection exceptions…</p>}
      {error && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
      {!loading && !error && <>
        <div className="flex flex-wrap gap-1.5 text-xs">
          <Badge variant="outline">{total} matching exceptions</Badge>
          <Badge variant="outline">{currentPageSummary.failures} failures on page</Badge>
          <Badge variant="outline">{currentPageSummary.needsAttention} needing attention on page</Badge>
          <Badge variant="outline">{currentPageSummary.notMeasured} not measurable on page</Badge>
          <Badge variant="outline">{currentPageSummary.openWorkOrder} open WOs on page</Badge>
          <Badge variant="outline">{currentPageSummary.noWorkOrder} without WO on page</Badge>
        </div>
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
            No recorded exceptions match these filters. Adjust the date range, outcome, machine or corrective follow-up status.
          </div>
        ) : <div className="min-w-0 max-w-full overflow-x-auto rounded-lg border" data-testid="pm-exceptions-table-wrapper">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="border-b bg-muted/40"><tr>
              <th className="px-3 py-2">Machine</th><th className="px-3 py-2">Component</th>
              <th className="px-3 py-2">Check / reading</th><th className="px-3 py-2">Outcome</th>
              <th className="px-3 py-2">Recorded</th><th className="px-3 py-2">Corrective WO</th>
              <th className="sticky right-0 bg-muted px-2 py-2">Details</th>
            </tr></thead><tbody>
          {rows.map((record) => {
            return <tr key={record.id} data-testid="pm-inspection-exception-row" className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-3 py-2 align-top"><p className="font-medium break-words">{record.component.asset.name}</p><p className="font-mono text-[11px] text-muted-foreground">{record.component.asset.assetTag}</p></td>
              <td className="px-3 py-2 align-top"><p className="break-words">{record.component.name}</p><p className="break-all font-mono text-[11px] text-muted-foreground">{record.component.componentCode}</p></td>
              <td className="px-3 py-2 align-top"><p className="break-words">{record.inspectionPoint.name}</p><p className="font-semibold">{record.result === 'not_measured' ? 'Not measured' : record.value ?? (record.findings || '—')}</p></td>
              <td className="px-3 py-2 align-top"><Badge variant={stateBadge(record.result)}>{record.result.replaceAll('_', ' ')}</Badge></td>
              <td className="px-3 py-2 align-top text-muted-foreground">{dateLabel(record.inspectedAt)}</td>
              <td className="px-3 py-2 align-top">{record.workOrder?.woNumber || '—'}</td>
              <td className="sticky right-0 bg-background px-2 py-2 align-top">
                <Button type="button" size="sm" variant="outline" onClick={() => setSelectedRecord(record)}
                  aria-label={'View exception for ' + record.component.name}>View</Button>
              </td>
            </tr>;
          })}
          </tbody></table>
        </div>}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Page {page} of {pageCount} · {total} matching recorded exceptions</span>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button>
            <Button type="button" size="sm" variant="outline" disabled={page >= pageCount}
              onClick={() => setPage((current) => current + 1)}>Next</Button>
          </div>
        </div>
      </>}
      <ResponsiveDialog open={Boolean(selectedRecord)} onOpenChange={(open) => { if (!open) setSelectedRecord(null); }}
        size="wide" title="Inspection exception details"
        description={selectedRecord ? selectedRecord.component.asset.name + ' · ' + selectedRecord.inspectionPoint.name : ''}>
        {selectedRecord && <ExceptionDetails record={selectedRecord}/>}
        <div className="flex justify-end pt-3"><Button type="button" variant="outline" onClick={() => setSelectedRecord(null)}>Close</Button></div>
      </ResponsiveDialog>
    </section>
  );
}
