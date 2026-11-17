'use client';

import { useEffect, useState } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CommissioningParameterFields, type ParameterDraft } from '@/components/assets/MachineCommissioningFields';
import { parameterRevisionSnapshot } from '@/lib/component-parameter-revision';

type PointRow = {
  id: string; name: string; parameterKey: string | null;
  inspectionType: string; description: string | null; normalRange: string | null;
  latestRecord?: unknown;
};

export function ComponentParameterEditor({
  componentId, componentCode, onClose,
}: {
  componentId: string; componentCode: string; onClose: () => void;
}) {
  const [parameters, setParameters] = useState<ParameterDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [expectedSnapshot, setExpectedSnapshot] = useState('');
  const [unsupportedMethods, setUnsupportedMethods] = useState<string[]>([]);

  const reload = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get<PointRow[]>(`/api/component-registry/${componentId}/inspections`);
      if (!response.success || !response.data) throw Error(response.error || 'Unable to load inspection parameters');
      const unsupported = [...new Set(response.data.filter(point =>
        !['visual', 'measurement'].includes(point.inspectionType)).map(point => point.inspectionType))];
      setUnsupportedMethods(unsupported);
      setExpectedSnapshot(parameterRevisionSnapshot(response.data));
      const drafts = response.data.map(point => {
        let min: string = '', max: string = '', unit = '';
        if (point.normalRange) {
          const range = JSON.parse(point.normalRange) as { min?: unknown; max?: unknown; unit?: unknown };
          min = range.min == null ? '' : String(range.min);
          max = range.max == null ? '' : String(range.max);
          unit = typeof range.unit === 'string' ? range.unit : '';
        }
        return {
          id: point.id, key: point.parameterKey || '', name: point.name,
          inspectionType: point.inspectionType === 'visual' ? 'visual' as const : 'measurement' as const,
          unit, min, max, reference: point.description || '',
        };
      });
      setParameters(drafts);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to load part parameters');
    } finally { setLoading(false); }
  };

  useEffect(() => { void reload(); }, [componentId]);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      if (unsupportedMethods.length) throw Error('This part has specialized inspection methods. Edit those checkpoints in the engineering inspection workflow.');
      const result = await api.patch(`/api/component-registry/${componentId}/inspections`, {
        expectedSnapshot,
        parameters: parameters.map(p => ({
          id: p.id, key: p.key, name: p.name, inspectionType: p.inspectionType,
          unit: p.unit, min: p.min.trim() === '' ? null : Number(p.min),
          max: p.max.trim() === '' ? null : Number(p.max), reference: p.reference,
        })),
      });
      if (!result.success) throw Error(result.error || 'Unable to save part parameters');
      toast.success('Part inspection parameters saved');
      await reload();
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'Unable to save parameters';
      setError(message);
      toast.error(message);
    } finally { setSaving(false); }
  };

  return <Card className="border-l-4 border-l-emerald-600" data-testid="part-parameter-editor">
    <CardHeader className="pb-2">
      <CardTitle className="text-base">Edit inspection parameters · {componentCode}</CardTitle>
      <CardDescription>
        Update manufacturer ranges, add new checkpoints, or retire unused ones.
        Existing readings and PM-linked checkpoints are protected against silent changes.
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-3">
      {loading ? <div className="flex gap-2 items-center py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin"/>Loading recorded part standards...
      </div> : <>
        {unsupportedMethods.length > 0 ? <p role="alert" className="text-sm text-amber-700">This part contains specialized inspection methods ({unsupportedMethods.join(", ")}). Its checkpoints are read-only here to protect their method and history; use the dedicated inspection workflow.</p> :
          <CommissioningParameterFields subject="part" items={parameters} onChange={setParameters}/> }
        {error && <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
          <ShieldAlert className="h-4 w-4 shrink-0"/>{error}
        </p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Close</Button>
          <Button type="button" onClick={() => void save()} disabled={saving || unsupportedMethods.length > 0 || !expectedSnapshot}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin"/>}Save parameters
          </Button>
        </div>
      </>}
      {loading && <Button variant="outline" onClick={onClose}>Close</Button>}
    </CardContent>
  </Card>;
}
