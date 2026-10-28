'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Gauge, Loader2, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type AssetMeterRecord = {
  id: string;
  assetId: string;
  name: string;
  unit: string;
  meterType: string;
  currentValue: number | string;
  lastReadingAt?: string | null;
  isActive: boolean;
};

interface Props {
  assetId: string;
  onChanged?: () => void;
  compact?: boolean;
  canCreate?: boolean;
  canRecordReading?: boolean;
}

export function AssetMetersPanel({
  assetId,
  onChanged,
  compact = false,
  canCreate = false,
  canRecordReading = false,
}: Props) {
  const [meters, setMeters] = useState<AssetMeterRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [initialReading, setInitialReading] = useState('0');
  const [readingMeterId, setReadingMeterId] = useState<string | null>(null);
  const [readingValue, setReadingValue] = useState('');
  const [readingDate, setReadingDate] = useState('');

  const loadMeters = useCallback(async () => {
    if (!assetId) { setMeters([]); return; }
    setLoading(true);
    try {
      const response = await api.get<AssetMeterRecord[]>(`/api/assets/${encodeURIComponent(assetId)}/meters`);
      if (!response.success) throw new Error(response.error || 'Failed to load asset meters');
      setMeters(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load asset meters');
      setMeters([]);
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => { void loadMeters(); }, [loadMeters]);

  const addMeter = async () => {
    if (!name.trim() || !unit.trim()) { toast.error('Meter name and unit are required'); return; }
    const initialValue = Number(initialReading || 0);
    if (!Number.isFinite(initialValue)) { toast.error('Initial reading must be numeric'); return; }
    setSaving(true);
    try {
      const response = await api.post(`/api/assets/${encodeURIComponent(assetId)}/meters`, {
        name: name.trim(),
        unit: unit.trim(),
        initialValue,
      });
      if (!response.success) throw new Error(response.error || 'Failed to add meter');
      toast.success('Asset meter added');
      setName(''); setUnit(''); setInitialReading('0');
      await loadMeters();
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add meter');
    } finally {
      setSaving(false);
    }
  };

  const recordReading = async (meter: AssetMeterRecord) => {
    const value = Number(readingValue);
    if (!Number.isFinite(value)) { toast.error('Reading must be numeric'); return; }
    setSaving(true);
    try {
      const response = await api.patch(`/api/assets/${encodeURIComponent(assetId)}/meters/${encodeURIComponent(meter.id)}`, {
        value,
        readingDate: readingDate || undefined,
      });
      if (!response.success) throw new Error(response.error || 'Failed to record meter reading');
      toast.success('Meter reading recorded');
      setReadingMeterId(null); setReadingValue(''); setReadingDate('');
      await loadMeters();
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to record meter reading');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`rounded-lg border bg-card ${compact ? 'p-2.5' : 'p-4'}`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold"><Gauge className="h-4 w-4" />Asset Meters</p>
          <p className="text-[10px] text-muted-foreground">Meter definitions live on the machine; PM inherits their unit automatically.</p>
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => void loadMeters()} disabled={loading} aria-label="Refresh asset meters">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {canCreate && (
        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_auto]">
          <div className="space-y-1"><Label className="text-[10px] uppercase text-muted-foreground">Meter name</Label><Input className="h-8 text-xs" value={name} onChange={(event) => setName(event.target.value)} placeholder="Operating Hours" /></div>
          <div className="space-y-1"><Label className="text-[10px] uppercase text-muted-foreground">Unit</Label><Input className="h-8 text-xs" value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="hours" /></div>
          <div className="space-y-1"><Label className="text-[10px] uppercase text-muted-foreground">Initial reading</Label><Input className="h-8 text-xs" type="number" step="any" value={initialReading} onChange={(event) => setInitialReading(event.target.value)} /></div>
          <div className="flex items-end"><Button type="button" size="sm" className="h-8 w-full" onClick={addMeter} disabled={saving || !assetId}><Plus className="mr-1 h-3.5 w-3.5" />Add Meter</Button></div>
        </div>
      )}

      <div className="mt-3 space-y-2">
        {loading ? <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading meters…</div> : meters.length === 0 ? (
          <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">No first-class meter is assigned to this asset yet.</div>
        ) : meters.map((meter) => (
          <div key={meter.id} className="rounded-md border p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0"><p className="truncate text-xs font-semibold">{meter.name}</p><p className="text-[10px] text-muted-foreground">Current Reading: <strong>{Number(meter.currentValue)} {meter.unit}</strong>{meter.lastReadingAt ? ` · ${new Date(meter.lastReadingAt).toLocaleString()}` : ''}</p></div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">{meter.unit}</Badge>
                {canRecordReading && (
                  <Button type="button" variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => { setReadingMeterId(readingMeterId === meter.id ? null : meter.id); setReadingValue(String(meter.currentValue)); }}>Record Reading</Button>
                )}
              </div>
            </div>
            {canRecordReading && readingMeterId === meter.id && (
              <div className="mt-2 grid gap-2 border-t pt-2 sm:grid-cols-[minmax(0,1fr)_11rem_auto]">
                <div className="space-y-1"><Label className="text-[10px] uppercase text-muted-foreground">New reading</Label><Input className="h-8 text-xs" type="number" step="any" value={readingValue} onChange={(event) => setReadingValue(event.target.value)} /></div>
                <div className="space-y-1"><Label className="text-[10px] uppercase text-muted-foreground">Reading date</Label><Input className="h-8 text-xs" type="datetime-local" value={readingDate} onChange={(event) => setReadingDate(event.target.value)} /></div>
                <div className="flex items-end"><Button type="button" size="sm" className="h-8" onClick={() => void recordReading(meter)} disabled={saving}>Save Reading</Button></div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
