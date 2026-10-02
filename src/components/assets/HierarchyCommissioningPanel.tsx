'use client';

import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';

type ExistingComponent = {
  id: string;
  componentCode: string;
  name: string;
};

type ImportRow = {
  componentCode: string;
  name: string;
  componentType: string;
  parentCode: string;
  criticality: string;
  manufacturer: string;
  modelNumber: string;
  description: string;
  line: number;
};

const TYPES = new Set(['assembly', 'subassembly', 'component', 'part', 'auxiliary', 'instrument']);
const CRITICALITIES = new Set(['low', 'medium', 'high', 'critical']);

function splitDelimited(line: string, delimiter: string) {
  const values: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      values.push(value.trim());
      value = '';
    } else {
      value += char;
    }
  }
  values.push(value.trim());
  return values;
}

function parseRows(text: string): ImportRow[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const delimiter = lines.some((line) => line.includes('\t')) ? '\t' : ',';
  const first = splitDelimited(lines[0], delimiter).map((value) => value.toLowerCase().replace(/[^a-z]/g, ''));
  const hasHeader = first.includes('componentcode') || first.includes('code');
  const body = hasHeader ? lines.slice(1) : lines;
  return body.map((line, index) => {
    const [componentCode = '', name = '', componentType = 'component', parentCode = '', criticality = 'medium', manufacturer = '', modelNumber = '', description = ''] = splitDelimited(line, delimiter);
    return {
      componentCode,
      name,
      componentType: componentType.toLowerCase() || 'component',
      parentCode,
      criticality: criticality.toLowerCase() || 'medium',
      manufacturer,
      modelNumber,
      description,
      line: index + (hasHeader ? 2 : 1),
    };
  });
}

function orderRows(rows: ImportRow[], existingCodes: Set<string>) {
  const remaining = [...rows];
  const resolved = new Set(existingCodes);
  const ordered: ImportRow[] = [];
  while (remaining.length > 0) {
    const readyIndex = remaining.findIndex((row) => !row.parentCode || resolved.has(row.parentCode));
    if (readyIndex === -1) {
      throw new Error('A parentCode is missing, circular, or appears under a different code. Fix the parent relationships before importing.');
    }
    const [row] = remaining.splice(readyIndex, 1);
    ordered.push(row);
    resolved.add(row.componentCode);
  }
  return ordered;
}

export function HierarchyCommissioningPanel({
  assetId,
  existingComponents,
  onComplete,
  onCancel,
}: {
  assetId: string;
  existingComponents: ExistingComponent[];
  onComplete: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(
    'componentCode,name,componentType,parentCode,criticality,manufacturer,modelNumber,description\n' +
    'ASM-DRIVE,Drive System,assembly,,high,,,Top-level drive assembly\n' +
    'CMP-MOTOR,Main Motor,component,ASM-DRIVE,critical,,,Main process motor\n' +
    'PRT-BEAR-DE,Drive End Bearing,part,CMP-MOTOR,high,SKF,22222 EK,Motor drive-end bearing'
  );
  const [importing, setImporting] = useState(false);

  const parsed = useMemo(() => parseRows(text), [text]);
  const validation = useMemo(() => {
    const errors: string[] = [];
    const codes = new Set<string>();
    const existingCodes = new Set(existingComponents.map((item) => item.componentCode));
    for (const row of parsed) {
      if (!row.componentCode) errors.push(`Line ${row.line}: componentCode is required.`);
      if (!row.name) errors.push(`Line ${row.line}: name is required.`);
      if (row.componentCode && existingCodes.has(row.componentCode)) errors.push(`Line ${row.line}: ${row.componentCode} already exists on this machine.`);
      if (row.componentCode && codes.has(row.componentCode)) errors.push(`Line ${row.line}: duplicate componentCode ${row.componentCode} in this import.`);
      if (row.componentCode) codes.add(row.componentCode);
      if (!TYPES.has(row.componentType)) errors.push(`Line ${row.line}: invalid type "${row.componentType}".`);
      if (!CRITICALITIES.has(row.criticality)) errors.push(`Line ${row.line}: invalid criticality "${row.criticality}".`);
    }
    const allCodes = new Set([...existingCodes, ...parsed.map((row) => row.componentCode)]);
    for (const row of parsed) {
      if (row.parentCode && !allCodes.has(row.parentCode)) errors.push(`Line ${row.line}: parentCode ${row.parentCode} was not found.`);
      if (row.parentCode && row.parentCode === row.componentCode) errors.push(`Line ${row.line}: a component cannot be its own parent.`);
    }
    if (parsed.length > 100) errors.push('Import is limited to 100 hierarchy nodes per batch.');
    try {
      if (errors.length === 0) orderRows(parsed, existingCodes);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Invalid hierarchy.');
    }
    return errors;
  }, [parsed, existingComponents]);

  const rootCount = parsed.filter((row) => !row.parentCode).length;

  const handleImport = async () => {
    if (parsed.length === 0 || validation.length > 0) return;
    setImporting(true);
    try {
      const ordered = orderRows(parsed, new Set(existingComponents.map((item) => item.componentCode)));
      const response = await api.post<any>('/api/component-registry/bulk', {
        assetId,
        rows: ordered.map((row) => ({
          componentCode: row.componentCode,
          name: row.name,
          componentType: row.componentType,
          parentCode: row.parentCode || null,
          criticality: row.criticality,
          manufacturer: row.manufacturer || null,
          modelNumber: row.modelNumber || null,
          description: row.description || null,
        })),
      });

      if (!response.success || !response.data?.createdCount) {
        throw new Error(response.error || 'Hierarchy import failed');
      }

      const createdCount = Number(response.data.createdCount);
      toast.success(`Imported ${createdCount} hierarchy node${createdCount === 1 ? '' : 's'} successfully`);
      onComplete();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Hierarchy import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card className="border-primary/20 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm"><FileSpreadsheet className="h-4 w-4" />Bulk Hierarchy Commissioning</CardTitle>
            <CardDescription className="mt-1">Paste rows copied from Excel/CSV. Parents may be existing machine nodes or nodes in the same batch.</CardDescription>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onCancel}><X className="h-4 w-4" /></Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Columns</p>
          <p className="mt-1 break-words">componentCode, name, componentType, parentCode, criticality, manufacturer, modelNumber, description</p>
          <p className="mt-1">Types: assembly, subassembly, component, part, auxiliary, instrument. Criticality: low, medium, high, critical.</p>
        </div>

        <div className="space-y-2">
          <Label>Excel / CSV hierarchy</Label>
          <Textarea value={text} onChange={(event) => setText(event.target.value)} rows={10} className="font-mono text-xs" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{parsed.length} row{parsed.length === 1 ? '' : 's'}</Badge>
          <Badge variant="outline">{rootCount} root{rootCount === 1 ? '' : 's'}</Badge>
          {validation.length === 0 && parsed.length > 0 ? (
            <Badge className="gap-1 bg-emerald-600"><CheckCircle2 className="h-3 w-3" />Ready to import</Badge>
          ) : (
            <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700"><AlertTriangle className="h-3 w-3" />Review required</Badge>
          )}
        </div>

        {validation.length > 0 && (
          <div className="max-h-36 overflow-auto rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900">
            {validation.slice(0, 12).map((error) => <p key={error}>• {error}</p>)}
            {validation.length > 12 && <p>• …and {validation.length - 12} more issue(s)</p>}
          </div>
        )}

        <div className="rounded-lg border p-3 text-xs text-muted-foreground">
          This import is committed atomically on the server. Plant access, hierarchy ownership, uniqueness, permissions and audit logging are enforced inside one database transaction.
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={importing}>Cancel</Button>
          <Button onClick={handleImport} disabled={importing || parsed.length === 0 || validation.length > 0}>
            {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Import {parsed.length || ''} Node{parsed.length === 1 ? '' : 's'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
