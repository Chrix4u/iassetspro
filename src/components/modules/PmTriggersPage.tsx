'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { SearchableSelect, AsyncSearchableSelect } from '@/components/ui/searchable-select';
import {
  ResponsiveDialog,
} from '@/components/shared/ResponsiveDialog';
import {
  ConfirmDialog,
} from '@/components/shared/ConfirmDialog';
import {
  EmptyState,
  LoadingSkeleton,
  formatDate,
  timeAgo,
} from '@/components/shared/helpers';
import {
  Plus,
  Search,
  Clock,
  Gauge,
  Activity,
  Factory,
  Trash2,
  Pencil,
  Power,
  Zap,
  RefreshCw,
  Filter,
  Timer,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  CalendarClock,
  Building2,
  User,
  Layers,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface PmScheduleRef {
  id: string;
  title: string;
  assetId: string;
  isActive: boolean;
  asset: {
    id: string;
    name: string;
    assetTag: string;
    status: string;
  };
  assignedTo: {
    id: string;
    fullName: string;
    username: string;
  } | null;
  department: {
    id: string;
    name: string;
    code: string;
  } | null;
}

interface PmTrigger {
  id: string;
  scheduleId: string;
  triggerType: string;
  triggerValue: number;
  triggerConfig: string | null;
  lastTriggeredAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  schedule: PmScheduleRef;
}

type TriggerType = 'time' | 'meter' | 'condition' | 'production_count';

interface TriggerConfig {
  cron?: string;
  meterName?: string;
  threshold?: number;
  metric?: string;
  operator?: string;
  value?: number;
  sourceType?: 'component_condition' | 'iot_device' | 'component_counter' | 'work_center_output';
  deviceId?: string;
  componentId?: string;
  counterId?: string;
  workCenterId?: string;
  sourceLabel?: string;
  unit?: string;
  baselineCount?: number;
  baselineHours?: number;
}

interface TriggerSourceOption {
  value: string;
  label: string;
  sourceType: NonNullable<TriggerConfig['sourceType']>;
  currentValue: number | null;
  unit: string | null;
}

const TRIGGER_TYPE_CONFIG: Record<
  TriggerType,
  { label: string; color: string; bg: string; border: string; icon: React.ElementType; description: string }
> = {
  time: {
    label: 'Time',
    color: 'text-sky-700',
    bg: 'bg-sky-50',
    border: 'border-sky-200',
    icon: Clock,
    description: 'Schedule-based trigger using cron expressions',
  },
  meter: {
    label: 'Meter',
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: Gauge,
    description: 'Meter reading threshold trigger',
  },
  condition: {
    label: 'Condition',
    color: 'text-violet-700',
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    icon: Activity,
    description: 'Condition-based trigger with metric evaluation',
  },
  production_count: {
    label: 'Production Count',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    icon: Factory,
    description: 'Production count threshold trigger',
  },
};

const TRIGGER_TYPES: TriggerType[] = ['time', 'meter', 'condition', 'production_count'];
const CONDITION_OPERATORS = ['>', '<', '>=', '<=', '=', '!='];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function parseTriggerConfig(configStr: string | null): TriggerConfig | null {
  if (!configStr) return null;
  try {
    return JSON.parse(configStr) as TriggerConfig;
  } catch {
    return null;
  }
}

function formatCronHint(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return cron;
  const mins = parts[0];
  const hrs = parts[1];
  const dom = parts[2];
  const mon = parts[3];
  const dow = parts[4];

  const hints: string[] = [];
  if (mins !== '*' && hrs !== '*' && dom === '*' && mon === '*' && dow === '*') {
    hints.push(`Every day at ${hrs.padStart(2, '0')}:${mins.padStart(2, '0')}`);
  } else if (mins !== '*' && hrs !== '*' && dow !== '*' && dom === '*' && mon === '*') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    hints.push(`Every ${days[parseInt(dow)] || dow} at ${hrs.padStart(2, '0')}:${mins.padStart(2, '0')}`);
  } else if (mins === '0' && hrs === '0' && dom === '*' && mon === '*' && dow === '*') {
    hints.push('Every day at midnight');
  } else if (mins === '0' && hrs === '0' && dom === '1' && mon === '*' && dow === '*') {
    hints.push('1st of every month at midnight');
  } else {
    hints.push('Custom schedule');
  }
  return hints[0];
}

function formatTriggerValue(type: TriggerType, value: number): string {
  switch (type) {
    case 'time':
      return `${value}h`;
    case 'meter':
      return `${value.toLocaleString()} units`;
    case 'condition':
      return `${value}`;
    case 'production_count':
      return `${value.toLocaleString()} items`;
    default:
      return String(value);
  }
}

function renderConfigDetails(type: TriggerType, config: TriggerConfig | null): React.ReactNode {
  if (!config) return <span className="text-muted-foreground text-xs">No configuration</span>;

  switch (type) {
    case 'time':
      return (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Timer className="h-3.5 w-3.5 text-sky-500" />
            <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded font-mono">{config.cron}</code>
          </div>
          {config.cron && (
            <p className="text-xs text-muted-foreground pl-5">{formatCronHint(config.cron)}</p>
          )}
        </div>
      );
    case 'meter':
      return (
        <div className="flex items-center gap-1.5 flex-wrap">
          <Gauge className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-xs font-medium">{config.meterName}</span>
          <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
            ≥ {config.threshold?.toLocaleString()}
          </Badge>
        </div>
      );
    case 'condition':
      return (
        <div className="flex items-center gap-1.5 flex-wrap">
          <Activity className="h-3.5 w-3.5 text-violet-500" />
          <span className="text-xs font-medium">{config.sourceLabel || config.metric}</span>
          <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-200 font-mono px-1.5">
            {config.operator} {config.value}
          </Badge>
        </div>
      );
    case 'production_count':
      return (
        <div className="flex items-center gap-1.5 flex-wrap">
          <Factory className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-xs font-medium">{config.sourceLabel || 'Production source'}</span>
          <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
            ≥ {config.threshold?.toLocaleString()} items
          </Badge>
        </div>
      );
    default:
      return null;
  }
}

// ============================================================================
// TRIGGER CARD COMPONENT
// ============================================================================

function TriggerCard({
  trigger,
  onEdit,
  onToggle,
  onDelete,
  canEdit,
  canDelete,
}: {
  trigger: PmTrigger;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const typeConf = TRIGGER_TYPE_CONFIG[trigger.triggerType as TriggerType] || TRIGGER_TYPE_CONFIG.time;
  const TypeIcon = typeConf.icon;
  const config = parseTriggerConfig(trigger.triggerConfig);
  const schedule = trigger.schedule;

  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4 space-y-3">
        {/* Top row: Type badge + Status */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-[11px] font-semibold border ${typeConf.border} ${typeConf.bg} ${typeConf.color}`}>
              <TypeIcon className="h-3 w-3 mr-1" />
              {typeConf.label}
            </Badge>
            {trigger.isActive ? (
              <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                <CheckCircle2 className="h-3 w-3 mr-1" />Active
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-500 border-slate-200">
                <XCircle className="h-3 w-3 mr-1" />Inactive
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {canEdit && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={onToggle}
                  title={trigger.isActive ? 'Deactivate' : 'Activate'}
                >
                  <Power className={`h-4 w-4 ${trigger.isActive ? 'text-amber-500' : 'text-emerald-500'}`} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={onEdit}
                  title="Edit"
                >
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </Button>
              </>
            )}
            {canDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onDelete}
                title="Delete"
              >
                <Trash2 className="h-4 w-4 text-red-400" />
              </Button>
            )}
          </div>
        </div>

        {/* Schedule info */}
        <div>
          <p className="text-sm font-semibold truncate">{schedule.title}</p>
          <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
            <Layers className="h-3 w-3" />
            <span className="truncate">{schedule.asset.name}</span>
            <Badge variant="outline" className="text-[9px] font-mono shrink-0">
              {schedule.asset.assetTag}
            </Badge>
          </div>
        </div>

        {/* Trigger value + config details */}
        <div className="space-y-1.5 bg-muted/40 rounded-lg p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Trigger Value</span>
            <span className="text-xs font-semibold">{formatTriggerValue(trigger.triggerType as TriggerType, trigger.triggerValue)}</span>
          </div>
          <div className="border-t border-border/50 pt-1.5">
            {renderConfigDetails(trigger.triggerType as TriggerType, config)}
          </div>
        </div>

        {/* Bottom row: Department + Assigned + Last triggered */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          {schedule.department && (
            <div className="flex items-center gap-1">
              <Building2 className="h-3 w-3" />
              <span className="truncate max-w-[120px]">{schedule.department.name}</span>
            </div>
          )}
          {schedule.assignedTo && (
            <div className="flex items-center gap-1">
              <User className="h-3 w-3" />
              <span className="truncate max-w-[120px]">{schedule.assignedTo.fullName}</span>
            </div>
          )}
          {trigger.lastTriggeredAt && (
            <div className="flex items-center gap-1 ml-auto">
              <CalendarClock className="h-3 w-3" />
              <span className="text-[10px]">{timeAgo(trigger.lastTriggeredAt)}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// CREATE/EDIT TRIGGER DIALOG FORM
// ============================================================================

interface TriggerFormData {
  scheduleId: string;
  triggerType: TriggerType;
  triggerValue: string;
  triggerConfig: TriggerConfig;
  isActive: boolean;
}

function sourceValueFromConfig(type: TriggerType, config: TriggerConfig): string {
  if (type === 'condition') {
    if (config.sourceType === 'component_condition' && config.metric) {
      return `component_condition|${encodeURIComponent(config.metric)}`;
    }
    if (config.sourceType === 'iot_device' && config.deviceId) {
      return `iot_device|${config.deviceId}`;
    }
  }
  if (type === 'production_count') {
    if (config.sourceType === 'component_counter' && config.counterId) {
      return `component_counter|${config.counterId}`;
    }
    if (config.sourceType === 'work_center_output' && config.workCenterId) {
      return `work_center_output|${config.workCenterId}`;
    }
  }
  return '';
}

function TriggerForm({
  initialData,
  schedules,
  loading,
  onSubmit,
  onCancel,
}: {
  initialData?: PmTrigger | null;
  schedules: PmScheduleRef[];
  loading: boolean;
  onSubmit: (data: TriggerFormData) => void;
  onCancel: () => void;
}) {
  const initialConfig = initialData ? parseTriggerConfig(initialData.triggerConfig) || {} : {};
  const initialType = initialData?.triggerType as TriggerType | undefined;
  const safeInitialType: TriggerType = initialType && initialType !== 'time' ? initialType : 'meter';

  const [scheduleId, setScheduleId] = useState(initialData?.scheduleId || '');
  const [triggerType, setTriggerType] = useState<TriggerType>(safeInitialType);
  const [triggerValue, setTriggerValue] = useState(initialData ? String(initialData.triggerValue) : '');
  const [isActive, setIsActive] = useState(initialData ? initialData.isActive : true);
  const [conditionOperator, setConditionOperator] = useState(initialConfig.operator || '>');
  const [conditionValue, setConditionValue] = useState(initialConfig.value != null ? String(initialConfig.value) : '');
  const [sourceValue, setSourceValue] = useState(sourceValueFromConfig(safeInitialType, initialConfig));
  const [sources, setSources] = useState<TriggerSourceOption[]>([]);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [legacyTypeConverted, setLegacyTypeConverted] = useState(initialType !== 'time');

  const availableSchedules = useMemo(() => schedules.filter((s) => {
    if (initialData && s.id === initialData.scheduleId) return true;
    return s.isActive;
  }), [schedules, initialData]);

  useEffect(() => {
    if (!scheduleId || (triggerType !== 'condition' && triggerType !== 'production_count')) {
      setSources([]);
      setSourceError(null);
      return;
    }

    let cancelled = false;
    const loadSources = async () => {
      setSourceLoading(true);
      setSourceError(null);
      const params = new URLSearchParams({ scheduleId, triggerType });
      const res = await api.get<TriggerSourceOption[]>(`/api/pm-triggers/sources?${params}`);
      if (cancelled) return;
      if (res.success && Array.isArray(res.data)) {
        setSources(res.data);
        setSourceError(res.data.length === 0 ? 'No authoritative source is available for this schedule yet.' : null);
      } else {
        setSources([]);
        setSourceError(res.error || 'Failed to load authoritative trigger sources');
      }
      setSourceLoading(false);
    };
    void loadSources();
    return () => { cancelled = true; };
  }, [scheduleId, triggerType]);

  const selectedSource = useMemo(
    () => sources.find((source) => source.value === sourceValue) || null,
    [sources, sourceValue],
  );

  const changeSchedule = (value: string) => {
    setScheduleId(value);
    if (value !== initialData?.scheduleId) setSourceValue('');
  };

  const changeTriggerType = (value: TriggerType) => {
    setTriggerType(value);
    setLegacyTypeConverted(true);
    setSourceValue('');
    if (value === 'condition' && !conditionValue && initialConfig.value != null) {
      setConditionValue(String(initialConfig.value));
    }
  };

  const buildConfig = (): TriggerConfig => {
    if (triggerType === 'meter') return {};
    if (!sourceValue) return {};
    const separator = sourceValue.indexOf('|');
    if (separator < 1) return {};
    const sourceType = sourceValue.slice(0, separator) as NonNullable<TriggerConfig['sourceType']>;
    const sourceId = sourceValue.slice(separator + 1);

    if (triggerType === 'condition') {
      const base = {
        sourceType,
        operator: conditionOperator,
        value: Number(conditionValue),
      } as TriggerConfig;
      if (sourceType === 'component_condition') {
        return { ...base, metric: decodeURIComponent(sourceId) };
      }
      return { ...base, deviceId: sourceId };
    }

    if (sourceType === 'component_counter') {
      return { sourceType, counterId: sourceId };
    }
    return { sourceType, workCenterId: sourceId };
  };

  const effectiveTriggerValue = (): string => {
    if (triggerType !== 'condition') return triggerValue;
    const threshold = Number(conditionValue);
    if (!Number.isFinite(threshold)) return '';
    return String(Math.max(Math.abs(threshold), 1));
  };

  const isFormValid = (): boolean => {
    if (!scheduleId) return false;
    if (initialType === 'time' && !legacyTypeConverted) return false;
    if (triggerType === 'meter' || triggerType === 'production_count') {
      if (!triggerValue || Number(triggerValue) <= 0) return false;
    }
    if (triggerType === 'condition') {
      return Boolean(sourceValue) && conditionValue !== '' && Number.isFinite(Number(conditionValue));
    }
    if (triggerType === 'production_count') return Boolean(sourceValue);
    return triggerType === 'meter';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid()) return;
    onSubmit({
      scheduleId,
      triggerType,
      triggerValue: effectiveTriggerValue(),
      triggerConfig: buildConfig(),
      isActive,
    });
  };

  const sourceLabel = triggerType === 'condition' ? 'Authoritative condition source' : 'Authoritative production source';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {initialType === 'time' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          This legacy time trigger is no longer a second PM clock. Time-based maintenance is controlled by the PM schedule cadence. Choose a runtime trigger below only if this schedule also needs meter, condition, or production-count activation. You must explicitly select a runtime trigger before this record can be updated.
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-sm font-medium">PM Schedule *</Label>
        <AsyncSearchableSelect
          value={scheduleId}
          onValueChange={changeSchedule}
          fetchOptions={async () => availableSchedules.map((s) => ({
            value: s.id,
            label: `${s.title} — ${s.asset.name} [${s.asset.assetTag}]`,
          }))}
          placeholder="Select PM schedule..."
          searchPlaceholder="Search by schedule title or asset..."
          disabled={Boolean(initialData)}
        />
        {initialData && (
          <p className="text-[11px] text-muted-foreground">The owning schedule is fixed when editing an existing trigger.</p>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Runtime Trigger *</Label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {(['meter', 'condition', 'production_count'] as TriggerType[]).map((t) => {
            const conf = TRIGGER_TYPE_CONFIG[t];
            const TypeIcon = conf.icon;
            return (
              <button
                key={t}
                type="button"
                onClick={() => changeTriggerType(t)}
                className={`px-3 py-2.5 rounded-lg border-2 text-sm font-medium transition-all flex items-center gap-1.5 ${
                  triggerType === t
                    ? `${conf.border} ${conf.bg} ${conf.color}`
                    : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
                }`}
              >
                <TypeIcon className="h-4 w-4" />
                <span className="text-xs">{conf.label}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">{TRIGGER_TYPE_CONFIG[triggerType].description}</p>
        <p className="text-[11px] text-slate-500">Time cadence remains configured on the PM schedule so two competing clocks cannot generate duplicate work orders.</p>
      </div>

      {triggerType === 'meter' && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Operating-hours interval *</Label>
          <Input
            type="number"
            min="0.000001"
            step="any"
            value={triggerValue}
            onChange={(e) => setTriggerValue(e.target.value)}
            placeholder="e.g. 500"
          />
          <div className="rounded-lg border bg-slate-50 p-3 text-[11px] text-slate-600">
            The runtime uses the selected schedule component&apos;s authoritative operating-hours counter. The current reading becomes the baseline when the trigger is first configured, preventing retroactive work orders.
          </div>
        </div>
      )}

      {(triggerType === 'condition' || triggerType === 'production_count') && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">{sourceLabel} *</Label>
          <Select value={sourceValue} onValueChange={setSourceValue} disabled={!scheduleId || sourceLoading}>
            <SelectTrigger>
              <SelectValue placeholder={sourceLoading ? 'Loading authoritative sources...' : `Select ${triggerType === 'condition' ? 'condition' : 'production'} source...`} />
            </SelectTrigger>
            <SelectContent>
              {sources.map((source) => (
                <SelectItem key={source.value} value={source.value}>{source.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {sourceLoading && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading plant-scoped sources…
            </div>
          )}
          {sourceError && !sourceLoading && (
            <div className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {sourceError}
            </div>
          )}
          {selectedSource && (
            <div className="rounded-lg border bg-slate-50 p-2.5 text-[11px] text-slate-600 flex items-center justify-between gap-3">
              <span>{selectedSource.sourceType.replace(/_/g, ' ')}</span>
              <span className="font-semibold text-slate-800">
                Current: {selectedSource.currentValue == null ? 'No reading yet' : `${selectedSource.currentValue.toLocaleString()}${selectedSource.unit ? ` ${selectedSource.unit}` : ''}`}
              </span>
            </div>
          )}
        </div>
      )}

      {triggerType === 'condition' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Operator *</Label>
            <Select value={conditionOperator} onValueChange={setConditionOperator}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONDITION_OPERATORS.map((op) => (
                  <SelectItem key={op} value={op} className="font-mono">{op}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Condition threshold *</Label>
            <Input
              type="number"
              step="any"
              value={conditionValue}
              onChange={(e) => setConditionValue(e.target.value)}
              placeholder="e.g. 85"
            />
          </div>
          <p className="sm:col-span-2 text-[11px] text-muted-foreground">
            A condition work order is generated only when the rule changes from not-matched to matched. A persistent alarm will not keep creating duplicate work orders; it must recover before it can trigger again.
          </p>
        </div>
      )}

      {triggerType === 'production_count' && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Production interval *</Label>
          <Input
            type="number"
            min="0.000001"
            step="any"
            value={triggerValue}
            onChange={(e) => setTriggerValue(e.target.value)}
            placeholder="e.g. 5000"
          />
          <p className="text-[11px] text-muted-foreground">
            The current authoritative count becomes the baseline. A work order is generated each time the selected source advances by this interval.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">Active</Label>
          <p className="text-[11px] text-muted-foreground">Enable this trigger to automatically generate preventive work orders.</p>
        </div>
        <Switch checked={isActive} onCheckedChange={setIsActive} />
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
        <Button
          type="submit"
          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
          disabled={loading || sourceLoading || !isFormValid()}
        >
          {loading ? (
            <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{initialData ? 'Updating...' : 'Creating...'}</span>
          ) : initialData ? 'Update Trigger' : 'Create Trigger'}
        </Button>
      </div>
    </form>
  );
}

// ============================================================================
// SKELETON LOADING
// ============================================================================

function TriggersLoadingSkeleton() {
  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      {/* Header skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>
      {/* Stats skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      {/* Filter skeleton */}
      <div className="flex gap-2">
        <Skeleton className="h-10 flex-1 max-w-xs" />
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-10 w-10" />
      </div>
      {/* Cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-52 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export default function PmTriggersPage() {
  const [triggers, setTriggers] = useState<PmTrigger[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchText, setSearchText] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterActive, setFilterActive] = useState<boolean | null>(null);

  // Dialog states
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingTrigger, setEditingTrigger] = useState<PmTrigger | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PmTrigger | null>(null);
  const [toggleLoading, setToggleLoading] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<PmScheduleRef[]>([]);
  const [formLoading, setFormLoading] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  const { hasPermission, isAdmin } = useAuthStore();
  const canCreate = hasPermission('pm_triggers.create');
  const canEdit = hasPermission('pm_triggers.update');
  const canDelete = isAdmin();

  // ─── Fetch triggers ───────────────────────────────────────────────────
  const fetchTriggers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterType !== 'all') params.set('triggerType', filterType);
    if (filterActive !== null) params.set('active', String(filterActive));

    const res = await api.get<PmTrigger[]>(`/api/pm-triggers?${params}`);
    if (res.success && res.data) {
      setTriggers(Array.isArray(res.data) ? res.data : []);
    } else {
      toast.error(res.error || 'Failed to load triggers');
    }
    setLoading(false);
  }, [filterType, filterActive]);

  useEffect(() => {
    fetchTriggers();
  }, [fetchTriggers, refreshKey]);

  // ─── Filtered triggers ────────────────────────────────────────────────
  const filteredTriggers = useMemo(() => {
    if (!searchText.trim()) return triggers;
    const q = searchText.toLowerCase();
    return triggers.filter(
      (t) =>
        t.schedule.title.toLowerCase().includes(q) ||
        t.schedule.asset.name.toLowerCase().includes(q) ||
        t.schedule.asset.assetTag.toLowerCase().includes(q) ||
        (t.schedule.department?.name || '').toLowerCase().includes(q) ||
        (t.schedule.assignedTo?.fullName || '').toLowerCase().includes(q),
    );
  }, [triggers, searchText]);

  // ─── Stats ────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = triggers.length;
    const active = triggers.filter((t) => t.isActive).length;
    const byType = TRIGGER_TYPES.reduce<Record<string, number>>((acc, t) => {
      acc[t] = triggers.filter((tr) => tr.triggerType === t).length;
      return acc;
    }, {});
    return { total, active, byType };
  }, [triggers]);

  // ─── Load schedules for create/edit ───────────────────────────────────
  const fetchSchedules = useCallback(async (): Promise<boolean> => {
    if (scheduleLoading) return false;
    setScheduleLoading(true);
    try {
      const res = await api.get<PmScheduleRef[]>('/api/pm-schedules');
      if (res.success && res.data) {
        setSchedules(Array.isArray(res.data) ? res.data : []);
        return true;
      }
      toast.error(res.error || 'Failed to load PM schedules');
      return false;
    } finally {
      setScheduleLoading(false);
    }
  }, [scheduleLoading]);

  // ─── Handle create ────────────────────────────────────────────────────
  const handleCreate = async () => {
    const ready = await fetchSchedules();
    if (!ready) return;
    setEditingTrigger(null);
    setFormDialogOpen(true);
  };

  // ─── Handle edit ──────────────────────────────────────────────────────
  const handleEdit = async (trigger: PmTrigger) => {
    const ready = await fetchSchedules();
    if (!ready) return;
    setEditingTrigger(trigger);
    setFormDialogOpen(true);
  };

  // ─── Handle form submit (create or update) ────────────────────────────
  const handleFormSubmit = async (data: TriggerFormData) => {
    if (formLoading) return;
    setFormLoading(true);
    try {
      if (editingTrigger) {
        const res = await api.put(`/api/pm-triggers/${editingTrigger.id}`, {
          triggerType: data.triggerType,
          triggerValue: parseFloat(data.triggerValue),
          triggerConfig: data.triggerConfig,
          isActive: data.isActive,
        });
        if (res.success) {
          toast.success('Trigger updated successfully');
          setFormDialogOpen(false);
          setRefreshKey((k) => k + 1);
        } else {
          toast.error(res.error || 'Failed to update trigger');
        }
      } else {
        const res = await api.post('/api/pm-triggers', {
          scheduleId: data.scheduleId,
          triggerType: data.triggerType,
          triggerValue: parseFloat(data.triggerValue),
          triggerConfig: data.triggerConfig,
          isActive: data.isActive,
        });
        if (res.success) {
          toast.success('Trigger created successfully');
          setFormDialogOpen(false);
          setRefreshKey((k) => k + 1);
        } else {
          toast.error(res.error || 'Failed to create trigger');
        }
      }
    } finally {
      setFormLoading(false);
    }
  };

  // ─── Handle toggle active ─────────────────────────────────────────────
  const handleToggle = async (trigger: PmTrigger) => {
    setToggleLoading(trigger.id);
    const res = await api.put(`/api/pm-triggers/${trigger.id}`, {
      isActive: !trigger.isActive,
    });
    if (res.success) {
      toast.success(trigger.isActive ? 'Trigger deactivated' : 'Trigger activated');
      setRefreshKey((k) => k + 1);
    } else {
      toast.error(res.error || 'Failed to toggle trigger');
    }
    setToggleLoading(null);
  };

  // ─── Handle delete (soft-delete via API) ──────────────────────────────
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const res = await api.delete(`/api/pm-triggers/${deleteTarget.id}`);
    if (res.success) {
      toast.success('Trigger deactivated successfully');
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      setRefreshKey((k) => k + 1);
    } else {
      toast.error(res.error || 'Failed to deactivate trigger');
    }
  };

  // ─── Handle refresh ───────────────────────────────────────────────────
  const handleRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // ─── Has active filters ───────────────────────────────────────────────
  const hasActiveFilters = filterType !== 'all' || filterActive !== null || searchText.trim().length > 0;

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <div className="page-content">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Zap className="h-6 w-6 text-emerald-600" />
            PM Triggers
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage automatic trigger rules for preventive maintenance schedules
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handleRefresh} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          {canCreate && (
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
              onClick={handleCreate}
              disabled={scheduleLoading}
            >
              {scheduleLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
              New Trigger
            </Button>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-slate-700">{stats.total}</p>
            <p className="text-[11px] text-muted-foreground font-medium">Total Triggers</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-emerald-600">{stats.active}</p>
            <p className="text-[11px] text-muted-foreground font-medium">Active</p>
          </CardContent>
        </Card>
        {TRIGGER_TYPES.map((t) => {
          const conf = TRIGGER_TYPE_CONFIG[t];
          const TypeIcon = conf.icon;
          return (
            <Card key={t} className="border-0 shadow-sm">
              <CardContent className="p-3 text-center">
                <div className="flex items-center justify-center gap-1.5">
                  <TypeIcon className={`h-4 w-4 ${conf.color}`} />
                  <p className="text-2xl font-bold">{stats.byType[t] || 0}</p>
                </div>
                <p className="text-[11px] text-muted-foreground font-medium">{conf.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by schedule, asset, department..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Trigger Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {TRIGGER_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {TRIGGER_TYPE_CONFIG[t].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <Label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Active Only</Label>
          <Switch
            checked={filterActive === true}
            onCheckedChange={(checked) => setFilterActive(checked ? true : null)}
          />
        </div>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-8"
            onClick={() => {
              setSearchText('');
              setFilterType('all');
              setFilterActive(null);
            }}
          >
            <Filter className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <TriggersLoadingSkeleton />
      ) : filteredTriggers.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={Zap}
            title={
              triggers.length === 0
                ? 'No PM triggers configured'
                : 'No triggers match your filters'
            }
            description={
              triggers.length === 0
                ? 'Create a runtime trigger for meter readings, equipment conditions, or production counts. Time cadence is configured on the PM schedule itself.'
                : 'Try adjusting your search or filter criteria to find what you are looking for.'
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTriggers.map((trigger) => (
            <TriggerCard
              key={trigger.id}
              trigger={trigger}
              onEdit={() => handleEdit(trigger)}
              onToggle={() => handleToggle(trigger)}
              onDelete={() => {
                setDeleteTarget(trigger);
                setDeleteDialogOpen(true);
              }}
              canEdit={canEdit}
              canDelete={canDelete}
            />
          ))}
        </div>
      )}

      {/* Trigger count summary */}
      {!loading && filteredTriggers.length > 0 && (
        <p className="text-xs text-muted-foreground text-center mt-4">
          Showing {filteredTriggers.length} of {triggers.length} trigger{triggers.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* Create/Edit Dialog */}
      <ResponsiveDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        title={editingTrigger ? 'Edit PM Trigger' : 'Create PM Trigger'}
        description={
          editingTrigger
            ? 'Update the trigger configuration for automatic work order generation.'
            : 'Configure a new trigger rule to automatically generate preventive maintenance work orders.'
        }
        large
      >
        <TriggerForm
          initialData={editingTrigger}
          schedules={editingTrigger ? schedules : schedules.filter((schedule) => !triggers.some((trigger) => trigger.scheduleId === schedule.id))}
          loading={formLoading}
          onSubmit={handleFormSubmit}
          onCancel={() => setFormDialogOpen(false)}
        />
      </ResponsiveDialog>

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Deactivate PM Trigger"
        description={
          deleteTarget
            ? `Are you sure you want to deactivate the trigger for "${deleteTarget.schedule.title}"? This will stop automatic work order generation for this schedule. The trigger can be reactivated later.`
            : 'Are you sure you want to deactivate this trigger?'
        }
        confirmLabel="Deactivate"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
