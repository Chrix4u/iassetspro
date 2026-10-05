'use client';

import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, BarChart3, CheckCircle2, Database, Download, FileSpreadsheet, Loader2, LockKeyhole, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AsyncSearchableSelect } from '@/components/ui/searchable-select';
import { ResponsiveDialog } from '@/components/shared/ResponsiveDialog';

type AuditIssue = { code: string; severity: 'warning' | 'error'; message: string };
type AuditResult = {
  dryRun: boolean;
  importLocked: boolean;
  source: { fileName: string; sizeBytes: number; sha256?: string; sheets: string[]; hasVba: boolean };
  workbook: { jobRecords: number; machineMasterRows: number; uniqueMachineCodes: number };
  legacyParityBaseline?: {
    available: boolean;
    expectedSheetCount: number;
    extractedSheetCount: number;
    sheets: Array<{
      sheetName: string;
      chartFamily: 'bar' | 'line';
      metric: string;
      filters: Record<string, string | number>;
      cachedGrandTotal: string | number | null;
      computedSeriesTotal: number;
      points: Array<{ category: string; value: number; order?: number }>;
    }>;
  };
  workbookParity?: {
    authoritativeJobRecords: number;
    authoritativeBreakdowns: number;
    cachedBreakdownPivotTotal: number | null;
    breakdownPivotFresh: boolean;
    breakdownWeekMismatches: Array<{ week: string; source: number; cachedPivot: number }>;
    priorityOneBreakdowns: number;
    cachedPriorityOneBreakdowns: number | null;
    priorityOneBreakdownParity: boolean;
    priorityOneResponseMinutes: number;
    cachedResponseByWeekTotal: number | null;
    cachedResponseByMachineTotal: number | null;
    responseParity: boolean;
    legacyDowntimeFormulaErrorRows: Array<{ rowNumber: number; workOrderNo: string; equipmentDescription: string; value: string }>;
    warnings: string[];
  };
  summary: {
    totalRows: number; importReadyRows: number; blockedRows: number; breakdownRows: number;
    missingStatusRows: number; missingStartRows: number; missingCompletionRows: number;
    unmatchedMachineRows: number; duplicateMachineCodes: string[]; tradeAliasesNormalized: number;
    resolvedDuplicateMachineRows?: number; inferredStatusRows?: number;
    issueCounts: Record<string, number>;
  };
  reconciliation?: {
    overridesSubmitted: number;
    overridesApplied: number;
    rows: Array<{ rowNumber: number; workOrderNo: string; action: 'asset' | 'non_equipment' | 'historical_unassigned'; assetId: string | null; assetName: string | null }>;
    reportedTimeCorrectionsSubmitted?: number;
    reportedTimeCorrectionsApplied?: number;
    reportedTimeCorrections?: Array<{ rowNumber: number; workOrderNo: string; reportedAt: string; reason: string }>;
  };
  tenantReadiness?: {
    spreadsheetReadyRows: number;
    tenantReadyRows: number;
    tenantBlockedRows: number;
    unlinkedEquipmentCodes: string[];
    directlyMatchedAssetTags: number;
    legacyMetadataMatchedRows?: number;
    adminAssetOverrides: number;
    legacyCodeMappingsSubmitted?: number;
    legacyCodeMappedRows?: number;
    nonEquipmentRows: number;
    historicalUnassignedRows?: number;
  };
  equipmentMappings?: Array<{ equipmentCode: string; assetId: string; assetTag: string | null; assetName: string | null }>;
  importPreview?: {
    requested: boolean;
    available: boolean;
    safeToInsert: boolean;
    blockers: string[];
    totalRows?: number;
    maintenanceRequestsToCreate?: number;
    workOrdersToCreate?: number;
    migrationActorUserId?: string;
    fingerprint?: string;
    sourceSha256?: string;
    identityConvention?: { maintenanceRequest: string; workOrder: string };
    manifest?: {
      generatedAt?: string;
      fingerprint?: string;
      safeToInsert?: boolean;
      executionReady?: boolean;
      blockers?: string[];
      executionBlockers?: string[];
      approval?: { algorithm: 'HMAC-SHA256'; signature: string } | null;
      [key: string]: unknown;
    };
    sourceIdentityCollisions?: Array<{
      legacyWorkOrderNo: string;
      count: number;
      requestNumber: string;
      woNumber: string;
    }>;
    idempotencyCollisions?: Array<{
      legacyWorkOrderNo: string;
      woNumber: string;
      requestNumber: string;
      workOrderExists: boolean;
      maintenanceRequestExists: boolean;
    }>;
    sample?: Array<{
      legacyRowNumber: number | null;
      legacyWorkOrderNo: string;
      sourceType: string;
      sourceStatus: string | null;
      assetName: string | null;
      reportedAt: string | null;
      workStartedAt: string | null;
      workCompletedAt: string | null;
      trade: string | null;
      proposedMaintenanceRequest: { requestNumber: string; title: string; priority: string };
      proposedWorkOrder: { woNumber: string; type: string; priority: string; status: string };
    }>;
  };
  assetLinkageRows?: Array<{
    legacyRowNumber: number | null;
    legacyWorkOrderNo: string;
    equipmentCode: string;
    equipmentName: string;
    assetId: string | null;
    assetTag: string | null;
    assetName: string | null;
    resolution: 'asset_tag_match' | 'legacy_metadata_match' | 'admin_asset_override' | 'legacy_code_mapping' | 'non_equipment' | 'historical_unassigned' | 'duplicate_variant_unconfirmed' | 'unlinked';
    tenantReady: boolean;
  }>;
  duplicateMachines: Array<{ code: string; affectedJobs: number; variants: Array<{ name: string; priority: number | null; order: number | null }> }>;
  blankMachineCodeRows: Array<{
    rowNumber: number | null;
    workOrderNo: string;
    description: string;
    equipmentDescription: string;
    trade: string;
    workOrderType: string;
    suggestions?: Array<{
      equipmentCode: string;
      matchScore: number;
      sharedTerms: string[];
      supportCount: number;
      assetId: string | null;
      assetTag: string | null;
      assetName: string | null;
      canApply: boolean;
      examples: Array<{ workOrderNo: string; description: string; trade: string }>;
    }>;
  }>;
  tradeNormalizations: Array<{ from: string; to: string; count: number }>;
  blockedRows: Array<{ rowNumber: number | null; workOrderNo: string; equipmentCode: string; description: string; issues: AuditIssue[] }>;
};


type ReconciliationBundle = {
  schemaVersion: 'gtp-reconciliation-bundle/v1';
  source: {
    filename: string;
    sizeBytes: number;
    sha256: string;
  };
  overrides: Array<{
    rowNumber: number;
    action: 'asset' | 'non_equipment' | 'historical_unassigned';
    assetId?: string;
    reason?: string;
  }>;
  reportedTimeCorrections: Array<{
    rowNumber: number;
    reportedAt: string;
    reason: string;
  }>;
  notes?: string[];
};

const sha256File = async (file: File): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const toDateTimeLocalValue = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Reconciliation bundle contains an invalid reported timestamp');
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

const issueLabels: Record<string, string> = {
  missing_machine_code: 'Missing machine code',
  unmatched_machine_code: 'Machine code not in master',
  duplicate_machine_code: 'Duplicate machine code',
  duplicate_machine_code_resolved: 'Duplicate machine code resolved',
  unmapped_priority_fallback: 'Legacy priority 5 fallback',
  missing_or_unknown_status: 'Missing / unknown status',
  status_inferred_from_timestamps: 'Status inferred from timestamps',
  missing_reported_time: 'Missing reported time',
  missing_breakdown_start: 'Breakdown missing start time',
  missing_breakdown_completion: 'Breakdown missing completion time',
  missing_trade: 'Missing trade',
};

export function GtpMigrationPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const bundleInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [loadedBundle, setLoadedBundle] = useState<{ filename: string; sourceFilename: string; sha256: string; overrides: number; timeCorrections: number } | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [overrides, setOverrides] = useState<Record<string, { action: 'asset' | 'non_equipment' | 'historical_unassigned'; assetId?: string; reason?: string }>>({});
  const [reportedTimeCorrections, setReportedTimeCorrections] = useState<Record<string, { reportedAt: string; reason: string }>>({});
  const [equipmentMappings, setEquipmentMappings] = useState<Record<string, string>>({});
  const [importConfirmOpen, setImportConfirmOpen] = useState(false);
  const [importConfirmation, setImportConfirmation] = useState('');
  const [importing, setImporting] = useState(false);
  const [lastImport, setLastImport] = useState<{
    imported: number;
    fingerprint: string;
    sourceSha256?: string;
    completedAt: string;
  } | null>(null);

  const readiness = useMemo(() => {
    if (!result?.summary.totalRows) return 0;
    return Math.round((result.summary.importReadyRows / result.summary.totalRows) * 1000) / 10;
  }, [result]);

  const runAudit = async (previewRequested = false) => {
    if (!file) return toast.error('Choose the GTP workbook first');
    setAuditing(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const reconciliation = Object.entries(overrides)
        .map(([rowNumber, value]) => ({
          rowNumber: Number(rowNumber),
          action: value.action,
          assetId: value.action === 'asset' ? value.assetId : undefined,
          reason: value.reason?.trim() || undefined,
        }))
        .filter((value) => value.action === 'non_equipment' || value.action === 'historical_unassigned' || Boolean(value.assetId));
      if (reconciliation.length) form.append('overrides', JSON.stringify(reconciliation));

      const timeCorrections = Object.entries(reportedTimeCorrections)
        .map(([rowNumber, value]) => ({
          rowNumber: Number(rowNumber),
          reportedAt: value.reportedAt ? new Date(value.reportedAt).toISOString() : '',
          reason: value.reason.trim(),
        }))
        .filter((value) => value.reportedAt && value.reason.length >= 8);
      if (timeCorrections.length) form.append('reportedTimeCorrections', JSON.stringify(timeCorrections));

      const legacyMappings = Object.entries(equipmentMappings)
        .filter(([, assetId]) => Boolean(assetId))
        .map(([equipmentCode, assetId]) => ({ equipmentCode, assetId }));
      if (legacyMappings.length) form.append('equipmentMappings', JSON.stringify(legacyMappings));
      if (previewRequested) form.append('preview', 'true');

      const response = await api.post<AuditResult>('/api/admin/gtp-migration/audit', form, { timeout: 120000 });
      if (!response.success || !response.data) return toast.error(response.error || 'Workbook audit failed');
      setResult(response.data);
      const applied = response.data.reconciliation?.overridesApplied || 0;
      toast.success(applied ? `GTP audit completed · ${applied} reconciliation override(s) applied` : 'GTP dry-run audit completed');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Workbook audit failed');
    } finally {
      setAuditing(false);
    }
  };


  const loadReconciliationBundle = async (bundleFile: File) => {
    if (!file) {
      if (bundleInputRef.current) bundleInputRef.current.value = '';
      return toast.error('Choose the exact GTP workbook before loading its reconciliation bundle');
    }

    setBundleLoading(true);
    try {
      const raw = JSON.parse(await bundleFile.text()) as Partial<ReconciliationBundle>;
      if (raw.schemaVersion !== 'gtp-reconciliation-bundle/v1'
        || !raw.source
        || !Array.isArray(raw.overrides)
        || !Array.isArray(raw.reportedTimeCorrections)) {
        throw new Error('Unsupported or incomplete GTP reconciliation bundle');
      }

      if (raw.source.sizeBytes !== file.size) {
        throw new Error(`Workbook size does not match this bundle (expected ${raw.source.sizeBytes.toLocaleString()} bytes)`);
      }
      const workbookSha256 = await sha256File(file);
      if (workbookSha256.toLowerCase() !== String(raw.source.sha256 || '').toLowerCase()) {
        throw new Error('Workbook SHA-256 does not match this reconciliation bundle');
      }

      const nextOverrides: Record<string, { action: 'asset' | 'non_equipment' | 'historical_unassigned'; assetId?: string; reason?: string }> = {};
      for (const item of raw.overrides) {
        if (!Number.isInteger(item.rowNumber) || item.rowNumber < 2) throw new Error('Bundle contains an invalid reconciliation row number');
        if (!['asset', 'non_equipment', 'historical_unassigned'].includes(item.action)) throw new Error('Bundle contains an invalid reconciliation action');
        if (item.action === 'asset' && !item.assetId) throw new Error(`Asset resolution for row ${item.rowNumber} is missing assetId`);
        if ((item.action === 'non_equipment' || item.action === 'historical_unassigned') && (!item.reason || item.reason.trim().length < 8)) {
          throw new Error(`Non-Asset resolution for row ${item.rowNumber} is missing a provenance reason`);
        }
        nextOverrides[String(item.rowNumber)] = {
          action: item.action,
          assetId: item.action === 'asset' ? item.assetId : undefined,
          reason: item.reason?.trim() || undefined,
        };
      }

      const nextCorrections: Record<string, { reportedAt: string; reason: string }> = {};
      for (const item of raw.reportedTimeCorrections) {
        if (!Number.isInteger(item.rowNumber) || item.rowNumber < 2) throw new Error('Bundle contains an invalid reported-time row number');
        if (!item.reason || item.reason.trim().length < 8) throw new Error(`Reported-time correction for row ${item.rowNumber} is missing a provenance reason`);
        nextCorrections[String(item.rowNumber)] = {
          reportedAt: toDateTimeLocalValue(item.reportedAt),
          reason: item.reason.trim(),
        };
      }

      setOverrides(nextOverrides);
      setReportedTimeCorrections(nextCorrections);
      setEquipmentMappings({});
      setResult(null);
      setLastImport(null);
      setLoadedBundle({
        filename: bundleFile.name,
        sourceFilename: raw.source.filename,
        sha256: workbookSha256,
        overrides: raw.overrides.length,
        timeCorrections: raw.reportedTimeCorrections.length,
      });
      toast.success(`Reconciliation bundle verified · ${raw.overrides.length} row resolution(s) and ${raw.reportedTimeCorrections.length} time correction(s) loaded`);
    } catch (error: unknown) {
      setLoadedBundle(null);
      toast.error(error instanceof Error ? error.message : 'Failed to load reconciliation bundle');
    } finally {
      setBundleLoading(false);
      if (bundleInputRef.current) bundleInputRef.current.value = '';
    }
  };

  const fetchAssetOptions = async (query: string) => {
    const params = new URLSearchParams({ limit: '50' });
    if (query.trim()) params.set('search', query.trim());
    const response = await api.get<any[]>(`/api/assets?${params.toString()}`);
    if (!response.success || !Array.isArray(response.data)) return [];
    return response.data.map((asset: any) => ({
      value: asset.id,
      label: `${asset.name || 'Unnamed Asset'}${asset.assetTag ? ` [${asset.assetTag}]` : ''}`,
      badge: asset.criticality || undefined,
    }));
  };

  const setRowOverride = (
    rowNumber: number | null,
    next: { action: 'asset' | 'non_equipment' | 'historical_unassigned'; assetId?: string; reason?: string } | null,
  ) => {
    if (!rowNumber) return;
    setOverrides((current) => {
      const updated = { ...current };
      if (!next) delete updated[String(rowNumber)];
      else updated[String(rowNumber)] = next;
      return updated;
    });
  };

  const downloadAudit = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gtp-workbook-audit.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const executeHistoricalImport = async () => {
    const preview = result?.importPreview;
    const manifest = preview?.manifest;
    const fingerprint = preview?.fingerprint;
    if (!file || !manifest || !fingerprint || manifest.executionReady !== true) {
      return toast.error('Generate an execution-ready signed preview first');
    }
    if (lastImport?.fingerprint === fingerprint) {
      return toast.error('This approved fingerprint has already been imported in this session');
    }
    if (importConfirmation.trim() !== fingerprint) {
      return toast.error('Confirmation fingerprint must exactly match the approved preview');
    }

    setImporting(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('manifest', new Blob([JSON.stringify(manifest)], { type: 'application/json' }), 'gtp-approved-preview.json');
      form.append('fingerprint', fingerprint);
      const response = await api.post<{ imported: number; fingerprint: string; sourceSha256?: string }>('/api/admin/gtp-migration/import', form, { timeout: 120000 });
      if (!response.success || !response.data) {
        return toast.error(response.error || 'Historical import failed');
      }
      setLastImport({
        imported: response.data.imported,
        fingerprint: response.data.fingerprint,
        sourceSha256: response.data.sourceSha256,
        completedAt: new Date().toISOString(),
      });
      toast.success(`Historical import completed · ${response.data.imported.toLocaleString()} work order(s) created`);
      setImportConfirmOpen(false);
      setImportConfirmation('');
      await runAudit(true);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Historical import failed');
    } finally {
      setImporting(false);
    }
  };

  const downloadPreviewManifest = () => {
    const preview = result?.importPreview;
    if (!preview?.safeToInsert || !preview.manifest || !preview.fingerprint) {
      return toast.error('Generate a clean transactional preview before downloading the approved manifest');
    }
    const blob = new Blob([JSON.stringify(preview.manifest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gtp-approved-preview-${preview.fingerprint.slice(0, 12)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Approved GTP preview manifest downloaded');
  };

  return (
    <div className="page-content space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2"><Database className="h-6 w-6 text-emerald-600" /><h1 className="text-2xl font-bold">GTP Data Migration</h1></div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Audit and reconcile the legacy Repairs & Maintenance workbook before historical records are allowed into iAssetsPro.</p>
        </div>
        {result && <Button variant="outline" onClick={downloadAudit} className="gap-2"><Download className="h-4 w-4" />Download Audit JSON</Button>}
      </div>

      <Card className={result?.importPreview?.manifest?.executionReady === true ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/60 dark:bg-emerald-950/20' : 'border-amber-200 bg-amber-50/50 dark:border-amber-900/60 dark:bg-amber-950/20'}>
        <CardContent className="flex gap-3 p-4">
          {result?.importPreview?.manifest?.executionReady === true
            ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-700" />
            : <LockKeyhole className="mt-0.5 h-5 w-5 text-amber-700" />}
          <div>
            <p className="font-semibold">{result?.importPreview?.manifest?.executionReady === true ? 'Historical import execution is ready' : 'Historical import execution is gated'}</p>
            <p className="text-sm text-muted-foreground">
              {result?.importPreview?.manifest?.executionReady === true
                ? 'The exact workbook, Asset links, collision checks and server signature have passed. Execution still requires full fingerprint confirmation.'
                : 'Audit and reconciliation are always zero-write. Historical records can only be created from an execution-ready signed preview with explicit fingerprint confirmation.'}
            </p>
          </div>
        </CardContent>
      </Card>

      {lastImport && <Card className="border-emerald-300 bg-emerald-50/40 dark:border-emerald-900/70 dark:bg-emerald-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><CheckCircle2 className="h-5 w-5 text-emerald-700" />Historical Import Receipt</CardTitle>
          <CardDescription>The approved transaction completed successfully. The automatic re-audit may now show identity collisions because those historical identities correctly exist.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border bg-background/70 p-3"><p className="text-xs text-muted-foreground">Imported work orders</p><p className="text-xl font-semibold">{lastImport.imported.toLocaleString()}</p></div>
          <div className="rounded-lg border bg-background/70 p-3 sm:col-span-2"><p className="text-xs text-muted-foreground">Approved fingerprint</p><p className="mt-1 break-all font-mono text-xs">{lastImport.fingerprint}</p></div>
          <div className="rounded-lg border bg-background/70 p-3"><p className="text-xs text-muted-foreground">Completed</p><p className="text-sm font-medium">{new Date(lastImport.completedAt).toLocaleString()}</p></div>
          {lastImport.sourceSha256 && <div className="rounded-lg border bg-background/70 p-3 sm:col-span-2 lg:col-span-4"><p className="text-xs text-muted-foreground">Workbook SHA-256</p><p className="mt-1 break-all font-mono text-xs">{lastImport.sourceSha256}</p></div>}
        </CardContent>
      </Card>}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileSpreadsheet className="h-5 w-5" />GTP Workbook</CardTitle><CardDescription>Expected sheets: JobRecords, NewOder, Machines and Trade. .xlsm and .xlsx are accepted.</CardDescription></CardHeader>
        <CardContent>
          <Input ref={inputRef} type="file" accept=".xlsm,.xlsx" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] || null); setResult(null); setOverrides({}); setReportedTimeCorrections({}); setEquipmentMappings({}); setLastImport(null); setLoadedBundle(null); }} />
          <Input ref={bundleInputRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const bundleFile = e.target.files?.[0]; if (bundleFile) void loadReconciliationBundle(bundleFile); }} />
          <div className="space-y-3 rounded-xl border border-dashed p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="font-medium">{file?.name || 'Select the current GTP workbook'}</p><p className="text-sm text-muted-foreground">{file ? (file.size / 1024 / 1024).toFixed(2) + ' MB · ready for dry-run audit' : 'The original workbook remains unchanged.'}</p></div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => inputRef.current?.click()} className="gap-2"><Upload className="h-4 w-4" />{file ? 'Change workbook' : 'Choose workbook'}</Button>
                <Button variant="outline" onClick={() => bundleInputRef.current?.click()} disabled={!file || bundleLoading} className="gap-2">
                  {bundleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {bundleLoading ? 'Verifying bundle…' : 'Load reconciliation bundle'}
                </Button>
                <Button onClick={() => void runAudit()} disabled={!file || auditing || bundleLoading}>{auditing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{auditing ? 'Auditing…' : 'Run Dry-Run Audit'}</Button>
              </div>
            </div>
            {loadedBundle && <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-sm dark:border-emerald-900/60 dark:bg-emerald-950/20">
              <div className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /><div>
                <p className="font-medium text-emerald-900 dark:text-emerald-200">Reconciliation bundle verified against the selected workbook</p>
                <p className="text-xs text-muted-foreground">{loadedBundle.overrides} row resolution(s) · {loadedBundle.timeCorrections} reported-time correction(s) · source {loadedBundle.sourceFilename}</p>
                <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">SHA-256 {loadedBundle.sha256}</p>
              </div></div>
            </div>}
          </div>
        </CardContent>
      </Card>

      {result && <>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {[['Legacy jobs', result.summary.totalRows], ['Import-ready', result.summary.importReadyRows], ['Blocked', result.summary.blockedRows], ['Breakdowns', result.summary.breakdownRows], ['Aliases normalized', result.summary.tradeAliasesNormalized]].map(([label, value]) => <Card key={String(label)}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold">{Number(value).toLocaleString()}</p></CardContent></Card>)}
        </div>

        {result.workbookParity && <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-5 w-5" />Workbook Report & Graph Parity</CardTitle>
            <CardDescription>Checks the authoritative JobRecords rows against the cached GTP pivot/report outputs before historical import. Stale Excel pivots are reported, not copied into iAssetsPro.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Authoritative JobRecords</p><p className="mt-1 text-xl font-semibold">{result.workbookParity.authoritativeJobRecords.toLocaleString()}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Authoritative breakdowns</p><p className="mt-1 text-xl font-semibold">{result.workbookParity.authoritativeBreakdowns.toLocaleString()}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Priority 1 breakdown parity</p><p className="mt-1 text-xl font-semibold">{result.workbookParity.priorityOneBreakdownParity ? 'PASS' : 'CHECK'}</p><p className="text-xs text-muted-foreground">{result.workbookParity.priorityOneBreakdowns.toLocaleString()} source · {result.workbookParity.cachedPriorityOneBreakdowns?.toLocaleString() ?? '—'} cached</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Response-time parity</p><p className="mt-1 text-xl font-semibold">{result.workbookParity.responseParity ? 'PASS' : 'CHECK'}</p><p className="text-xs text-muted-foreground">{result.workbookParity.priorityOneResponseMinutes.toLocaleString(undefined, { maximumFractionDigits: 2 })} min</p></div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant={result.workbookParity.breakdownPivotFresh ? 'secondary' : 'destructive'}>
                BD_Wk cached pivot {result.workbookParity.breakdownPivotFresh ? 'fresh' : 'stale'}
              </Badge>
              <Badge variant={result.workbookParity.priorityOneBreakdownParity ? 'secondary' : 'destructive'}>
                No_BD_MC {result.workbookParity.priorityOneBreakdownParity ? 'matches source' : 'mismatch'}
              </Badge>
              <Badge variant={result.workbookParity.responseParity ? 'secondary' : 'destructive'}>
                Response pivots {result.workbookParity.responseParity ? 'match source' : 'mismatch'}
              </Badge>
              <Badge variant={result.workbookParity.legacyDowntimeFormulaErrorRows.length ? 'outline' : 'secondary'}>
                {result.workbookParity.legacyDowntimeFormulaErrorRows.length} legacy downtime formula error(s)
              </Badge>
            </div>

            {result.workbookParity.breakdownWeekMismatches.length > 0 && <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader><TableRow><TableHead>Week</TableHead><TableHead className="text-right">JobRecords source</TableHead><TableHead className="text-right">Cached Excel pivot</TableHead></TableRow></TableHeader>
                <TableBody>{result.workbookParity.breakdownWeekMismatches.map((row) => <TableRow key={row.week}><TableCell>{row.week}</TableCell><TableCell className="text-right font-semibold">{row.source}</TableCell><TableCell className="text-right">{row.cachedPivot}</TableCell></TableRow>)}</TableBody>
              </Table>
            </div>}

            {result.workbookParity.warnings.map((warning) => <p key={warning} className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{warning}</p>)}
          </CardContent>
        </Card>}


        {result.legacyParityBaseline && <Card>
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-base">Workbook Parity Baseline</CardTitle>
                <CardDescription>Frozen acceptance values extracted directly from the five saved GTP workbook pivots before import.</CardDescription>
              </div>
              <Badge variant="outline">
                {result.legacyParityBaseline.extractedSheetCount}/{result.legacyParityBaseline.expectedSheetCount} pivot sheets
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Pivot sheet</TableHead><TableHead>Metric</TableHead><TableHead className="text-right">Points</TableHead><TableHead className="text-right">Cached total</TableHead><TableHead className="text-right">Independent total</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>{result.legacyParityBaseline.sheets.map((sheet) => {
                const cachedNumeric = typeof sheet.cachedGrandTotal === 'number' ? sheet.cachedGrandTotal : null;
                const reconciles = cachedNumeric !== null && Math.abs(cachedNumeric - sheet.computedSeriesTotal) < 0.000001;
                const cachedLabel = sheet.cachedGrandTotal === null ? '—' : typeof sheet.cachedGrandTotal === 'number'
                  ? sheet.cachedGrandTotal.toLocaleString(undefined, { maximumFractionDigits: 6 })
                  : sheet.cachedGrandTotal;
                return <TableRow key={sheet.sheetName}>
                  <TableCell><div className="font-mono font-semibold">{sheet.sheetName}</div><div className="text-xs text-muted-foreground">{sheet.chartFamily} chart</div></TableCell>
                  <TableCell className="max-w-[420px] whitespace-normal">{sheet.metric}</TableCell>
                  <TableCell className="text-right">{sheet.points.length.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono">{cachedLabel}</TableCell>
                  <TableCell className="text-right font-mono">{sheet.computedSeriesTotal.toLocaleString(undefined, { maximumFractionDigits: 6 })}</TableCell>
                  <TableCell>{reconciles
                    ? <span className="text-emerald-700">Reconciled</span>
                    : cachedNumeric === null
                      ? <span className="text-amber-700">Cached value needs review</span>
                      : <span className="text-amber-700">Total differs</span>}
                  </TableCell>
                </TableRow>;
              })}</TableBody>
            </Table>
          </CardContent>
        </Card>}

        <Card><CardHeader><CardTitle className="text-base">Migration Readiness</CardTitle><CardDescription>{readiness}% of historical rows have no blocking master-data errors.</CardDescription></CardHeader><CardContent className="space-y-3"><Progress value={readiness} /><div className="flex flex-wrap gap-2"><Badge variant="outline">{result.source.hasVba ? 'VBA detected' : 'No VBA payload'}</Badge><Badge variant="outline">{result.workbook.machineMasterRows} machine-master rows</Badge><Badge variant="outline">{result.workbook.uniqueMachineCodes} unique machine codes</Badge>
          {(result.summary.resolvedDuplicateMachineRows || 0) > 0 && <Badge variant="outline">{result.summary.resolvedDuplicateMachineRows} duplicate-code jobs auto-resolved</Badge>}
          {(result.summary.inferredStatusRows || 0) > 0 && <Badge variant="outline">{result.summary.inferredStatusRows} statuses inferred with provenance</Badge>}
          {(result.reconciliation?.overridesApplied || 0) > 0 && <Badge variant="outline">{result.reconciliation?.overridesApplied} admin reconciliation override(s)</Badge>}
          {(result.reconciliation?.reportedTimeCorrectionsApplied || 0) > 0 && <Badge variant="outline">{result.reconciliation?.reportedTimeCorrectionsApplied} reported-time correction(s) applied</Badge>}
          {(result.tenantReadiness?.legacyCodeMappedRows || 0) > 0 && <Badge variant="outline">{result.tenantReadiness?.legacyCodeMappedRows} rows linked through legacy-code mapping</Badge>}</div></CardContent></Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-5 w-5 text-amber-600" />Machine Master Conflicts</CardTitle><CardDescription>Duplicate machine codes must be reconciled before affected jobs can be imported.</CardDescription></CardHeader>
          <CardContent>{result.duplicateMachines.length === 0 ? <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />No duplicate machine codes.</p> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Master variants</TableHead><TableHead className="text-right">Affected jobs</TableHead></TableRow></TableHeader><TableBody>{result.duplicateMachines.map((item) => <TableRow key={item.code}><TableCell className="font-mono font-semibold">{item.code}</TableCell><TableCell>{item.variants.map((v, i) => <div key={i} className="text-sm">{v.name || 'Unnamed'} <span className="text-xs text-muted-foreground">· priority {v.priority ?? '—'} · order {v.order ?? '—'}</span></div>)}</TableCell><TableCell className="text-right font-semibold">{item.affectedJobs}</TableCell></TableRow>)}</TableBody></Table></div>}</CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card><CardHeader><CardTitle className="text-base">Trade Normalization</CardTitle><CardDescription>Historical spelling variants are mapped to one canonical trade.</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Legacy</TableHead><TableHead>Canonical</TableHead><TableHead className="text-right">Rows</TableHead></TableRow></TableHeader><TableBody>{result.tradeNormalizations.map((row) => <TableRow key={row.from + row.to}><TableCell>{row.from}</TableCell><TableCell>{row.to}</TableCell><TableCell className="text-right">{row.count}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Data Quality Findings</CardTitle><CardDescription>Warnings determine which historical KPIs can be reconstructed reliably.</CardDescription></CardHeader><CardContent className="grid grid-cols-2 gap-3">{Object.entries(result.summary.issueCounts).sort((a,b)=>b[1]-a[1]).map(([code,count]) => <div key={code} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{issueLabels[code] || code.replaceAll('_',' ')}</p><p className="text-xl font-semibold">{count.toLocaleString()}</p></div>)}</CardContent></Card>
        </div>

        {result.blankMachineCodeRows.length > 0 && <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle className="text-base">Rows With No Machine Code</CardTitle>
                <CardDescription>Resolve each row by mapping it to an existing Asset, marking true non-equipment work, or preserving it as unassigned historical work when the legacy record clearly concerns equipment but its Asset identity cannot be proven. Decisions are applied to the dry-run only.</CardDescription>
              </div>
              <Button
                variant="outline"
                onClick={() => void runAudit()}
                disabled={auditing || Object.keys(overrides).length === 0}
              >
                {auditing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Apply Resolutions & Re-audit
              </Button>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>WO</TableHead><TableHead>Type</TableHead><TableHead>Description</TableHead><TableHead>Trade</TableHead><TableHead className="min-w-[320px]">Resolution</TableHead></TableRow></TableHeader>
              <TableBody>{result.blankMachineCodeRows.map((row) => {
                const key = String(row.rowNumber || '');
                const override = overrides[key];
                return <TableRow key={key + row.workOrderNo}>
                  <TableCell className="font-mono">{row.workOrderNo}</TableCell>
                  <TableCell>{row.workOrderType}</TableCell>
                  <TableCell className="max-w-[560px] whitespace-normal">{row.description || row.equipmentDescription || '—'}</TableCell>
                  <TableCell>{row.trade || '—'}</TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      {row.suggestions && row.suggestions.length > 0 && <div className="space-y-2 rounded-lg border bg-muted/30 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium">Historical evidence suggestions</p>
                          <Badge variant="outline">{row.suggestions.length} candidate{row.suggestions.length === 1 ? '' : 's'}</Badge>
                        </div>
                        {row.suggestions.map((suggestion) => (
                          <div key={suggestion.equipmentCode} className="rounded-md border bg-background p-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-semibold">{suggestion.equipmentCode}</span>
                              <Badge variant="secondary">{Math.round(suggestion.matchScore * 100)}% match</Badge>
                              <span className="text-[11px] text-muted-foreground">{suggestion.supportCount} supporting historical row{suggestion.supportCount === 1 ? '' : 's'}</span>
                            </div>
                            {suggestion.sharedTerms.length > 0 && <p className="mt-1 text-[11px] text-muted-foreground">Shared terms: {suggestion.sharedTerms.join(', ')}</p>}
                            <div className="mt-1 space-y-1">
                              {suggestion.examples.slice(0, 2).map((example) => (
                                <p key={example.workOrderNo + example.description} className="text-[11px] leading-4 text-muted-foreground">
                                  <span className="font-mono">{example.workOrderNo || 'Legacy WO'}</span> · {example.description || 'No description'}{example.trade ? ` · ${example.trade}` : ''}
                                </p>
                              ))}
                            </div>
                            {suggestion.canApply && suggestion.assetId ? <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="mt-2 h-7 text-xs"
                              onClick={() => setRowOverride(row.rowNumber, { action: 'asset', assetId: suggestion.assetId! })}
                            >
                              Use {suggestion.assetName || suggestion.assetTag || suggestion.equipmentCode}
                            </Button> : <p className="mt-2 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                              Evidence only — review and confirm manually{suggestion.assetName ? ` (${suggestion.assetName})` : ''}.
                            </p>}
                          </div>
                        ))}
                        <p className="text-[11px] text-muted-foreground">Suggestions are advisory only. Confirm the physical Asset before applying a mapping.</p>
                      </div>}
                      <Select
                        value={override?.action || 'unresolved'}
                        onValueChange={(value) => {
                          if (value === 'unresolved') setRowOverride(row.rowNumber, null);
                          else if (value === 'non_equipment') setRowOverride(row.rowNumber, { action: 'non_equipment', reason: override?.reason });
                          else if (value === 'historical_unassigned') setRowOverride(row.rowNumber, { action: 'historical_unassigned', reason: override?.reason });
                          else setRowOverride(row.rowNumber, { action: 'asset', assetId: override?.assetId });
                        }}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unresolved">Needs review</SelectItem>
                          <SelectItem value="asset">Map to existing Asset</SelectItem>
                          <SelectItem value="non_equipment">Non-equipment work</SelectItem>
                          <SelectItem value="historical_unassigned">Unassigned historical work</SelectItem>
                        </SelectContent>
                      </Select>
                      {override?.action === 'asset' && <AsyncSearchableSelect
                        value={override.assetId || ''}
                        onValueChange={(assetId) => setRowOverride(row.rowNumber, { action: 'asset', assetId })}
                        fetchOptions={fetchAssetOptions}
                        placeholder="Search asset / machine..."
                        searchPlaceholder="Search asset name or tag..."
                        emptyMessage="No matching Assets."
                        clearable
                        groupBy={false}
                      />}
                      {override?.action === 'non_equipment' && <p className="text-xs text-muted-foreground">This record is confirmed as work that did not belong to a specific Asset.</p>}
                      {override?.action === 'historical_unassigned' && <p className="text-xs text-muted-foreground">The job remains plant-scoped and auditable, but the legacy Asset identity is intentionally preserved as unknown.</p>}
                      {(override?.action === 'non_equipment' || override?.action === 'historical_unassigned') && <div className="space-y-1">
                        <Label className="text-xs">Resolution reason / provenance</Label>
                        <Input
                          value={override.reason || ''}
                          onChange={(event) => setRowOverride(row.rowNumber, { action: override.action, reason: event.target.value })}
                          placeholder="Explain why no Asset can or should be linked..."
                        />
                        <p className="text-[11px] text-muted-foreground">Required · minimum 8 characters · signed into the approved manifest.</p>
                      </div>}
                    </div>
                  </TableCell>
                </TableRow>;
              })}</TableBody>
            </Table>
          </CardContent>
        </Card>}


        {result.blockedRows.some((row) => row.issues.some((issue) => issue.code === 'missing_reported_time')) && <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle className="text-base">Missing Reported Time</CardTitle>
                <CardDescription>Correct only source rows that have no reported timestamp. A reason is mandatory and the correction is recorded in the dry-run audit provenance.</CardDescription>
              </div>
              <Button
                variant="outline"
                onClick={() => void runAudit()}
                disabled={auditing || !Object.values(reportedTimeCorrections).some((value) => value.reportedAt && value.reason.trim().length >= 8)}
              >
                {auditing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Apply Time Corrections & Re-audit
              </Button>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>WO</TableHead><TableHead>Description</TableHead><TableHead>Correct reported time</TableHead><TableHead>Reason / provenance</TableHead></TableRow></TableHeader>
              <TableBody>
                {result.blockedRows
                  .filter((row) => row.issues.some((issue) => issue.code === 'missing_reported_time'))
                  .map((row) => {
                    const key = String(row.rowNumber || '');
                    const correction = reportedTimeCorrections[key] || { reportedAt: '', reason: '' };
                    return <TableRow key={'reported-time-' + key}>
                      <TableCell className="font-mono">{row.workOrderNo}</TableCell>
                      <TableCell className="max-w-[520px] whitespace-normal">{row.description || '—'}</TableCell>
                      <TableCell className="min-w-[230px]">
                        <Input
                          type="datetime-local"
                          value={correction.reportedAt}
                          onChange={(event) => setReportedTimeCorrections((current) => ({
                            ...current,
                            [key]: { ...correction, reportedAt: event.target.value },
                          }))}
                        />
                      </TableCell>
                      <TableCell className="min-w-[320px]">
                        <Input
                          value={correction.reason}
                          placeholder="e.g. Confirmed from shift log / signed maintenance register"
                          onChange={(event) => setReportedTimeCorrections((current) => ({
                            ...current,
                            [key]: { ...correction, reason: event.target.value },
                          }))}
                        />
                        <p className="mt-1 text-xs text-muted-foreground">Minimum 8 characters. This is audit provenance, not an overwrite of the workbook.</p>
                      </TableCell>
                    </TableRow>;
                  })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>}

        {result.tenantReadiness && <Card className={result.tenantReadiness.tenantBlockedRows === 0 ? 'border-emerald-200' : 'border-amber-200'}>
          <CardHeader>
            <CardTitle className="text-base">iAssetsPro Asset Linkage</CardTitle>
            <CardDescription>A workbook row can be structurally clean but still cannot be imported until its equipment resolves to an Asset in this iAssetsPro tenant.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Spreadsheet-ready rows</p><p className="text-xl font-semibold">{result.tenantReadiness.spreadsheetReadyRows.toLocaleString()}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Tenant-ready rows</p><p className="text-xl font-semibold">{result.tenantReadiness.tenantReadyRows.toLocaleString()}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Asset-link blocked</p><p className="text-xl font-semibold">{result.tenantReadiness.tenantBlockedRows.toLocaleString()}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Direct Asset-tag matches</p><p className="text-xl font-semibold">{result.tenantReadiness.directlyMatchedAssetTags.toLocaleString()}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Legacy metadata matches</p><p className="text-xl font-semibold">{(result.tenantReadiness.legacyMetadataMatchedRows || 0).toLocaleString()}</p></div>
            </div>
            {(result.assetLinkageRows || []).some((row) => row.resolution === 'duplicate_variant_unconfirmed') && <Card className="border-amber-200">
          <CardHeader>
            <CardTitle className="text-base">Duplicate Machine Variant Asset Confirmation</CardTitle>
            <CardDescription>These legacy jobs were deterministically resolved to a machine-master variant, but a code-wide Asset mapping would be unsafe. Confirm the physical Asset for each row.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Legacy WO</TableHead><TableHead>Code</TableHead><TableHead>Resolved machine</TableHead><TableHead>Existing Asset</TableHead></TableRow></TableHeader>
              <TableBody>
                {(result.assetLinkageRows || []).filter((row) => row.resolution === 'duplicate_variant_unconfirmed').map((row) => (
                  <TableRow key={String(row.legacyRowNumber) + row.legacyWorkOrderNo}>
                    <TableCell className="font-mono">{row.legacyWorkOrderNo}</TableCell>
                    <TableCell className="font-mono">{row.equipmentCode}</TableCell>
                    <TableCell>{row.equipmentName}</TableCell>
                    <TableCell className="min-w-[360px]">
                      <AsyncSearchableSelect
                        value={overrides[String(row.legacyRowNumber)]?.assetId || ''}
                        onValueChange={(assetId) => setRowOverride(row.legacyRowNumber, { action: 'asset', assetId })}
                        fetchOptions={fetchAssetOptions}
                        placeholder="Confirm exact Asset..."
                        searchPlaceholder="Search asset name or tag..."
                        emptyMessage="No matching Assets."
                        clearable
                        groupBy={false}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>}

            {result.tenantReadiness.unlinkedEquipmentCodes.length > 0 && <>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm font-medium">Unlinked legacy equipment codes</p>
                  <p className="text-xs text-muted-foreground">Map each legacy machine code to an existing Asset. One mapping resolves every import-ready historical row carrying that code.</p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => void runAudit()}
                  disabled={auditing || !Object.values(equipmentMappings).some(Boolean)}
                >
                  {auditing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Apply Equipment Mappings & Re-audit
                </Button>
              </div>
              <div className="max-h-[520px] overflow-y-auto rounded-lg border">
                <Table>
                  <TableHeader><TableRow><TableHead>Legacy equipment code</TableHead><TableHead>Existing iAssetsPro Asset</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {result.tenantReadiness.unlinkedEquipmentCodes.slice(0, 250).map((code) => (
                      <TableRow key={code}>
                        <TableCell className="font-mono font-semibold">{code}</TableCell>
                        <TableCell className="min-w-[360px]">
                          <AsyncSearchableSelect
                            value={equipmentMappings[code] || ''}
                            onValueChange={(assetId) => setEquipmentMappings((current) => ({ ...current, [code]: assetId }))}
                            fetchOptions={fetchAssetOptions}
                            placeholder="Map to existing Asset..."
                            searchPlaceholder="Search asset name or tag..."
                            emptyMessage="No matching Assets."
                            clearable
                            groupBy={false}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground">This audit never creates Assets. Missing machines must first be registered in Asset Management, then mapped here.</p>
            </>}
          </CardContent>
        </Card>}

        {result.summary.blockedRows === 0 && (result.tenantReadiness?.tenantBlockedRows || 0) === 0 && <Card className="border-blue-200">
          <CardHeader>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle className="text-base">Transactional Import Preview</CardTitle>
                <CardDescription>Preview only — no records will be written. The server checks deterministic GTP identities for collisions before any future import can be enabled.</CardDescription>
              </div>
              <Button variant="outline" onClick={() => void runAudit(true)} disabled={auditing}>
                {auditing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Generate Transactional Import Preview
              </Button>
            </div>
          </CardHeader>
          {result.importPreview?.requested && <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Rows in preview</p><p className="text-xl font-semibold">{(result.importPreview.totalRows || 0).toLocaleString()}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Maintenance Requests</p><p className="text-xl font-semibold">{(result.importPreview.maintenanceRequestsToCreate || 0).toLocaleString()}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Work Orders</p><p className="text-xl font-semibold">{(result.importPreview.workOrdersToCreate || 0).toLocaleString()}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Identity collisions</p><p className="text-xl font-semibold">{((result.importPreview.sourceIdentityCollisions?.length || 0) + (result.importPreview.idempotencyCollisions?.length || 0)).toLocaleString()}</p></div>
            </div>
            {result.importPreview.fingerprint && <div className="rounded-lg border bg-muted/20 p-3 text-xs">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-medium">Preview fingerprint</p>
                  <p className="mt-1 break-all font-mono text-muted-foreground">{result.importPreview.fingerprint}</p>
                  <p className="mt-2 text-muted-foreground">Any workbook or reconciliation change produces a different fingerprint. A future import must require this exact approved fingerprint.</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {result.importPreview.safeToInsert && result.importPreview.manifest && <Button size="sm" variant="outline" onClick={downloadPreviewManifest} className="gap-2">
                    <Download className="h-4 w-4" />
                    Download Approved Preview Manifest
                  </Button>}
                  {result.importPreview.manifest?.executionReady === true && lastImport?.fingerprint !== result.importPreview.fingerprint && <Button size="sm" onClick={() => { setImportConfirmation(''); setImportConfirmOpen(true); }} className="gap-2">
                    <Database className="h-4 w-4" />
                    Execute Historical Import
                  </Button>}
                </div>
              </div>
            </div>}
            <div className={`rounded-lg border p-3 text-sm ${result.importPreview.safeToInsert ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/40'}`}>
              {result.importPreview.manifest?.executionReady === true
                ? 'Execution gate is ready: workbook identity, Asset linkage, deterministic MR/WO identities and server approval are all satisfied.'
                : result.importPreview.safeToInsert
                  ? 'Preview gate is clean, but execution remains locked until the server signing key is configured and every equipment-backed row is bound to an active Asset.'
                  : 'Preview detected blockers: ' + (result.importPreview.blockers || []).join('; ')}
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Legacy WO</TableHead><TableHead>Asset</TableHead><TableHead>Reported</TableHead><TableHead>Proposed MR</TableHead><TableHead>Proposed WO</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(result.importPreview.sample || []).slice(0, 50).map((row) => <TableRow key={row.legacyWorkOrderNo}>
                    <TableCell className="font-mono">{row.legacyWorkOrderNo}</TableCell>
                    <TableCell>{row.assetName || 'Non-equipment'}</TableCell>
                    <TableCell className="whitespace-nowrap">{row.reportedAt ? new Date(row.reportedAt).toLocaleString() : '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{row.proposedMaintenanceRequest.requestNumber}</TableCell>
                    <TableCell className="font-mono text-xs">{row.proposedWorkOrder.woNumber}</TableCell>
                    <TableCell>{row.proposedWorkOrder.status}</TableCell>
                  </TableRow>)}
                </TableBody>
              </Table>
            </div>
          </CardContent>}
  
      </Card>}

        <Card className={result.summary.blockedRows === 0 ? 'border-emerald-200' : 'border-red-200'}><CardHeader><CardTitle className="flex items-center gap-2 text-base"><LockKeyhole className="h-5 w-5" />Historical Import Gate</CardTitle></CardHeader><CardContent><p className="text-sm">{result.summary.blockedRows > 0
  ? 'Resolve the ' + result.summary.blockedRows.toLocaleString() + ' workbook-blocked row(s) first. Historical import remains disabled.'
  : (result.tenantReadiness?.tenantBlockedRows || 0) > 0
    ? 'Workbook blockers are resolved, but ' + result.tenantReadiness!.tenantBlockedRows.toLocaleString() + ' row(s) still lack an iAssetsPro Asset link. Historical import remains disabled.'
    : result.importPreview?.manifest?.executionReady === true
      ? 'Workbook, Asset linkage and signed approval gates are satisfied. Execute only the exact fingerprinted preview shown above.'
      : 'Workbook and tenant Asset-link blockers are resolved. Generate a signed transactional preview; execution remains locked until all approval gates are satisfied.'}</p></CardContent></Card>
      <ResponsiveDialog open={importConfirmOpen} onOpenChange={(open) => { if (!importing) setImportConfirmOpen(open); }}>
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Execute GTP Historical Import</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This will create the approved historical Maintenance Request and Work Order records in one database transaction. Any row failure rolls the complete batch back.
            </p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs font-medium">Approved fingerprint</p>
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{result?.importPreview?.fingerprint || '—'}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gtp-import-confirmation">Type the complete fingerprint to confirm</Label>
            <Input
              id="gtp-import-confirmation"
              value={importConfirmation}
              onChange={(event) => setImportConfirmation(event.target.value)}
              placeholder="Paste the approved fingerprint"
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setImportConfirmOpen(false)} disabled={importing}>Cancel</Button>
            <Button
              onClick={() => void executeHistoricalImport()}
              disabled={importing || !result?.importPreview?.fingerprint || importConfirmation.trim() !== result.importPreview.fingerprint}
            >
              {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
              {importing ? 'Importing…' : 'Execute Approved Import'}
            </Button>
          </div>
        </div>
      </ResponsiveDialog>
      </>}
    </div>
  );
}

export default GtpMigrationPage;