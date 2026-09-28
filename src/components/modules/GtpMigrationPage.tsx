'use client';

import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, Download, FileSpreadsheet, Loader2, LockKeyhole, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AsyncSearchableSelect } from '@/components/ui/searchable-select';

type AuditIssue = { code: string; severity: 'warning' | 'error'; message: string };
type AuditResult = {
  dryRun: boolean;
  importLocked: boolean;
  source: { fileName: string; sizeBytes: number; sheets: string[]; hasVba: boolean };
  workbook: { jobRecords: number; machineMasterRows: number; uniqueMachineCodes: number };
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
    rows: Array<{ rowNumber: number; workOrderNo: string; action: 'asset' | 'non_equipment'; assetId: string | null; assetName: string | null }>;
  };
  duplicateMachines: Array<{ code: string; affectedJobs: number; variants: Array<{ name: string; priority: number | null; order: number | null }> }>;
  blankMachineCodeRows: Array<{ rowNumber: number | null; workOrderNo: string; description: string; equipmentDescription: string; trade: string; workOrderType: string }>;
  tradeNormalizations: Array<{ from: string; to: string; count: number }>;
  blockedRows: Array<{ rowNumber: number | null; workOrderNo: string; equipmentCode: string; description: string; issues: AuditIssue[] }>;
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
  const [file, setFile] = useState<File | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [overrides, setOverrides] = useState<Record<string, { action: 'asset' | 'non_equipment'; assetId?: string }>>({});

  const readiness = useMemo(() => {
    if (!result?.summary.totalRows) return 0;
    return Math.round((result.summary.importReadyRows / result.summary.totalRows) * 1000) / 10;
  }, [result]);

  const runAudit = async () => {
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
        }))
        .filter((value) => value.action === 'non_equipment' || Boolean(value.assetId));
      if (reconciliation.length) form.append('overrides', JSON.stringify(reconciliation));
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
    next: { action: 'asset' | 'non_equipment'; assetId?: string } | null,
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

  return (
    <div className="page-content space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2"><Database className="h-6 w-6 text-emerald-600" /><h1 className="text-2xl font-bold">GTP Data Migration</h1></div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Audit and reconcile the legacy Repairs & Maintenance workbook before historical records are allowed into iAssetsPro.</p>
        </div>
        {result && <Button variant="outline" onClick={downloadAudit} className="gap-2"><Download className="h-4 w-4" />Download Audit JSON</Button>}
      </div>

      <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900/60 dark:bg-amber-950/20">
        <CardContent className="flex gap-3 p-4">
          <LockKeyhole className="mt-0.5 h-5 w-5 text-amber-700" />
          <div><p className="font-semibold">Historical import is locked</p><p className="text-sm text-muted-foreground">This page performs reconciliation only. It does not create or modify historical Work Orders, Assets, Trades or Maintenance Requests.</p></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileSpreadsheet className="h-5 w-5" />GTP Workbook</CardTitle><CardDescription>Expected sheets: JobRecords, NewOder, Machines and Trade. .xlsm and .xlsx are accepted.</CardDescription></CardHeader>
        <CardContent>
          <Input ref={inputRef} type="file" accept=".xlsm,.xlsx" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] || null); setResult(null); setOverrides({}); }} />
          <div className="flex flex-col gap-3 rounded-xl border border-dashed p-5 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-medium">{file?.name || 'Select the current GTP workbook'}</p><p className="text-sm text-muted-foreground">{file ? (file.size / 1024 / 1024).toFixed(2) + ' MB · ready for dry-run audit' : 'The original workbook remains unchanged.'}</p></div>
            <div className="flex gap-2"><Button variant="outline" onClick={() => inputRef.current?.click()} className="gap-2"><Upload className="h-4 w-4" />{file ? 'Change workbook' : 'Choose workbook'}</Button><Button onClick={runAudit} disabled={!file || auditing}>{auditing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{auditing ? 'Auditing…' : 'Run Dry-Run Audit'}</Button></div>
          </div>
        </CardContent>
      </Card>

      {result && <>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {[['Legacy jobs', result.summary.totalRows], ['Import-ready', result.summary.importReadyRows], ['Blocked', result.summary.blockedRows], ['Breakdowns', result.summary.breakdownRows], ['Aliases normalized', result.summary.tradeAliasesNormalized]].map(([label, value]) => <Card key={String(label)}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold">{Number(value).toLocaleString()}</p></CardContent></Card>)}
        </div>

        <Card><CardHeader><CardTitle className="text-base">Migration Readiness</CardTitle><CardDescription>{readiness}% of historical rows have no blocking master-data errors.</CardDescription></CardHeader><CardContent className="space-y-3"><Progress value={readiness} /><div className="flex flex-wrap gap-2"><Badge variant="outline">{result.source.hasVba ? 'VBA detected' : 'No VBA payload'}</Badge><Badge variant="outline">{result.workbook.machineMasterRows} machine-master rows</Badge><Badge variant="outline">{result.workbook.uniqueMachineCodes} unique machine codes</Badge>
          {(result.summary.resolvedDuplicateMachineRows || 0) > 0 && <Badge variant="outline">{result.summary.resolvedDuplicateMachineRows} duplicate-code jobs auto-resolved</Badge>}
          {(result.summary.inferredStatusRows || 0) > 0 && <Badge variant="outline">{result.summary.inferredStatusRows} statuses inferred with provenance</Badge>}
          {(result.reconciliation?.overridesApplied || 0) > 0 && <Badge variant="outline">{result.reconciliation?.overridesApplied} admin reconciliation override(s)</Badge>}</div></CardContent></Card>

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
                <CardDescription>Resolve each row by mapping it to an existing Asset or marking it as non-equipment work. Decisions are applied to the dry-run only.</CardDescription>
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
                      <Select
                        value={override?.action || 'unresolved'}
                        onValueChange={(value) => {
                          if (value === 'unresolved') setRowOverride(row.rowNumber, null);
                          else if (value === 'non_equipment') setRowOverride(row.rowNumber, { action: 'non_equipment' });
                          else setRowOverride(row.rowNumber, { action: 'asset', assetId: override?.assetId });
                        }}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unresolved">Needs review</SelectItem>
                          <SelectItem value="asset">Map to existing Asset</SelectItem>
                          <SelectItem value="non_equipment">Non-equipment work</SelectItem>
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
                      {override?.action === 'non_equipment' && <p className="text-xs text-muted-foreground">This historical job will remain intentionally unlinked to an Asset.</p>}
                    </div>
                  </TableCell>
                </TableRow>;
              })}</TableBody>
            </Table>
          </CardContent>
        </Card>}

        <Card className={result.summary.blockedRows === 0 ? 'border-emerald-200' : 'border-red-200'}><CardHeader><CardTitle className="flex items-center gap-2 text-base"><LockKeyhole className="h-5 w-5" />Historical Import Gate</CardTitle></CardHeader><CardContent><p className="text-sm">{result.summary.blockedRows === 0 ? 'Blocking master-data errors are resolved. The next stage will be a previewable transactional import with explicit approval and rollback protection.' : 'Resolve the ' + result.summary.blockedRows.toLocaleString() + ' blocked row(s) first. Historical import remains disabled.'}</p></CardContent></Card>
      </>}
    </div>
  );
}

export default GtpMigrationPage;
