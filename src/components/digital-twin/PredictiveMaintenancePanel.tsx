'use client';

import { formatUiDate } from '@/lib/date-display';
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Brain,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Check,
  Loader2,
  XCircle,
  Clock,
  RefreshCw,
  Filter,
  Eye,
  EyeOff,
  Database,
  GraduationCap,
  Cpu,
  Zap,
  Calendar,
  Target,
  TrendingUp,
  ShieldAlert,
  AlertOctagon,
  Info,
  ChevronDown,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDigitalTwinStore } from '@/stores/digitalTwinStore';
import type { PredictionAlertData, PredictiveModelData } from '@/types';

// ============================================================================
// Types
// ============================================================================

export interface PredictiveMaintenancePanelProps {
  /** Asset ID to filter data */
  assetId?: string;
  /** Compact mode for embedding */
  compact?: boolean;
}

// ============================================================================
// Severity Badge
// ============================================================================

function SeverityBadge({ severity }: { severity: string }) {
  const s = (severity || '').toLowerCase();
  const config: Record<string, string> = {
    critical: 'bg-red-600/20 text-red-400 border-red-600/30',
    high: 'bg-orange-600/20 text-orange-400 border-orange-600/30',
    medium: 'bg-amber-600/20 text-amber-400 border-amber-600/30',
    low: 'bg-slate-600/20 text-slate-400 border-slate-600/30',
  };
  return (
    <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${config[s] ?? 'bg-slate-600/20 text-slate-400 border-slate-600/30'}`}>
      {severity || '—'}
    </Badge>
  );
}

// ============================================================================
// Training Status Badge
// ============================================================================

function TrainingStatusBadge({ status }: { status: string }) {
  const s = (status || '').toLowerCase();
  const config: Record<string, { color: string; icon: React.ReactNode }> = {
    trained: { color: 'bg-emerald-600/20 text-emerald-400 border-emerald-600/30', icon: <CheckCircle2 className="h-3 w-3" /> },
    training: { color: 'bg-blue-600/20 text-blue-400 border-blue-600/30', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    pending: { color: 'bg-amber-600/20 text-amber-400 border-amber-600/30', icon: <Clock className="h-3 w-3" /> },
    failed: { color: 'bg-red-600/20 text-red-400 border-red-600/30', icon: <XCircle className="h-3 w-3" /> },
  };
  const cfg = config[s] ?? { color: 'bg-slate-600/20 text-slate-400 border-slate-600/30', icon: <Info className="h-3 w-3" /> };

  return (
    <Badge variant="outline" className={`text-[9px] px-1.5 py-0 gap-1 ${cfg.color}`}>
      {cfg.icon}
      {status}
    </Badge>
  );
}

// ============================================================================
// Confidence Bar
// ============================================================================

function ConfidenceBar({ value }: { value: number | null }) {
  if (value === null) return <span className="text-[10px] text-slate-500">N/A</span>;

  const color = value > 80 ? 'bg-emerald-500' : value > 50 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[10px] font-semibold text-slate-300 w-8 text-right">{value}%</span>
    </div>
  );
}

// ============================================================================
// Model Status Cards
// ============================================================================

function ModelStatusCards({ models }: { models: PredictiveModelData[] }) {
  const counts = useMemo(() => {
    const c = { trained: 0, training: 0, pending: 0, failed: 0 };
    models.forEach((m) => {
      const s = m.trainingStatus.toLowerCase();
      if (c[s as keyof typeof c] !== undefined) c[s as keyof typeof c]++;
    });
    return c;
  }, [models]);

  const cards: { key: keyof typeof counts; label: string; icon: React.ReactNode; color: string; bg: string }[] = [
    { key: 'trained', label: 'Trained', icon: <CheckCircle2 className="h-4 w-4" />, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    { key: 'training', label: 'Training', icon: <Loader2 className="h-4 w-4 animate-spin" />, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
    { key: 'pending', label: 'Pending', icon: <Clock className="h-4 w-4" />, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
    { key: 'failed', label: 'Failed', icon: <XCircle className="h-4 w-4" />, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((c) => (
        <Card key={c.key} className={`${c.bg} border`}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">{c.label}</div>
                <div className={`text-xl font-bold mt-1 ${c.color}`}>{counts[c.key]}</div>
              </div>
              <div className={`${c.color} opacity-60`}>{c.icon}</div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================================================
// Active Alerts Section
// ============================================================================

function ActiveAlertsSection({
  alerts,
  onAcknowledge,
}: {
  alerts: PredictionAlertData[];
  onAcknowledge: (id: string) => void;
}) {
  const [acknowledging, setAcknowledging] = useState<Set<string>>(new Set());

  const handleAck = useCallback(async (id: string) => {
    setAcknowledging((prev) => new Set(prev).add(id));
    await onAcknowledge(id);
    setAcknowledging((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, [onAcknowledge]);

  return (
    <Card className="bg-white/[0.03] border-white/[0.06]">
      <CardHeader className="py-2.5 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
            Active Alerts ({alerts.length})
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-slate-500">
            <CheckCircle2 className="h-8 w-8 mb-2 opacity-40" />
            <span className="text-xs">No active prediction alerts</span>
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
            {alerts.map((alert) => {
              const sev = alert.severity.toLowerCase();
              const borderColor = sev === 'critical' ? 'border-l-red-500' : sev === 'high' ? 'border-l-orange-500' : 'border-l-amber-500';

              return (
                <div key={alert.id} className={`p-3 rounded-md bg-white/[0.02] border border-white/[0.04] border-l-2 ${borderColor}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <SeverityBadge severity={alert.severity} />
                      {alert.predictiveModel && (
                        <span className="text-[9px] text-slate-500 font-mono">{alert.predictiveModel.name}</span>
                      )}
                    </div>
                    {alert.confidence !== null && (
                      <div className="w-20">
                        <ConfidenceBar value={alert.confidence} />
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed mb-1.5">{alert.message}</p>

                  {alert.recommendations && (
                    <p className="text-[10px] text-slate-500 italic mb-2">💡 {alert.recommendations}</p>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {alert.predictedFailureAt && (
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-slate-600" />
                          <span className="text-[9px] text-slate-500">
                            Pred: {formatUiDate(alert.predictedFailureAt)}
                          </span>
                        </div>
                      )}
                      {alert.component && (
                        <div className="flex items-center gap-1">
                          <Target className="h-3 w-3 text-slate-600" />
                          <span className="text-[9px] text-slate-500">{alert.component.name}</span>
                        </div>
                      )}
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[9px] gap-1 border-white/10 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/30 px-2"
                      onClick={() => handleAck(alert.id)}
                      disabled={acknowledging.has(alert.id)}
                    >
                      {acknowledging.has(alert.id) ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                      Acknowledge
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Model Registry Table
// ============================================================================

function ModelRegistryTable({ models }: { models: PredictiveModelData[] }) {
  return (
    <Card className="bg-white/[0.03] border-white/[0.06]">
      <CardHeader className="py-2.5 px-4">
        <CardTitle className="flex items-center gap-2 text-xs font-semibold text-slate-300">
          <Database className="h-3.5 w-3.5 text-slate-400" />
          Model Registry ({models.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {models.length === 0 ? (
          <div className="text-xs text-slate-500 py-6 text-center">No models registered</div>
        ) : (
          <ScrollArea className="max-h-64">
            <Table>
              <TableHeader>
                <TableRow className="border-white/[0.06] hover:bg-transparent">
                  <TableHead className="text-[10px] text-slate-500 font-medium h-8">Name</TableHead>
                  <TableHead className="text-[10px] text-slate-500 font-medium h-8">Type</TableHead>
                  <TableHead className="text-[10px] text-slate-500 font-medium h-8">Algorithm</TableHead>
                  <TableHead className="text-[10px] text-slate-500 font-medium h-8">Accuracy</TableHead>
                  <TableHead className="text-[10px] text-slate-500 font-medium h-8">Status</TableHead>
                  <TableHead className="text-[10px] text-slate-500 font-medium h-8">Data Points</TableHead>
                  <TableHead className="text-[10px] text-slate-500 font-medium h-8">Last Trained</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {models.map((model) => (
                  <TableRow key={model.id} className="border-white/[0.04] hover:bg-white/[0.02]">
                    <TableCell className="text-xs text-slate-200 py-2 font-medium">{model.modelName}</TableCell>
                    <TableCell className="text-xs text-slate-400 py-2">{model.modelType}</TableCell>
                    <TableCell className="text-[10px] text-slate-500 py-2 font-mono">{model.algorithm ?? '—'}</TableCell>
                    <TableCell className="py-2">
                      {model.accuracy !== null ? (
                        <div className="flex items-center gap-2 w-20">
                          <Progress value={model.accuracy} className="h-1.5 bg-white/5 flex-1" />
                          <span className="text-[10px] text-slate-400 w-8 text-right">{model.accuracy}%</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-500">N/A</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2">
                      <TrainingStatusBadge status={model.trainingStatus} />
                    </TableCell>
                    <TableCell className="text-[10px] text-slate-400 py-2">
                      {model.dataPoints.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-[10px] text-slate-500 py-2">
                      {model.lastTrainedAt ? formatUiDate(model.lastTrainedAt) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Alert History Table
// ============================================================================

function AlertHistoryTable({ alerts }: { alerts: PredictionAlertData[] }) {
  return (
    <Card className="bg-white/[0.03] border-white/[0.06]">
      <CardHeader className="py-2.5 px-4">
        <CardTitle className="flex items-center gap-2 text-xs font-semibold text-slate-300">
          <History className="h-3.5 w-3.5 text-slate-400" />
          Alert History ({alerts.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {alerts.length === 0 ? (
          <div className="text-xs text-slate-500 py-6 text-center">No alert history</div>
        ) : (
          <ScrollArea className="max-h-64">
            <Table>
              <TableHeader>
                <TableRow className="border-white/[0.06] hover:bg-transparent">
                  <TableHead className="text-[10px] text-slate-500 font-medium h-8">Date</TableHead>
                  <TableHead className="text-[10px] text-slate-500 font-medium h-8">Model</TableHead>
                  <TableHead className="text-[10px] text-slate-500 font-medium h-8">Severity</TableHead>
                  <TableHead className="text-[10px] text-slate-500 font-medium h-8">Message</TableHead>
                  <TableHead className="text-[10px] text-slate-500 font-medium h-8">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((alert) => (
                  <TableRow key={alert.id} className="border-white/[0.04] hover:bg-white/[0.02]">
                    <TableCell className="text-[10px] text-slate-500 py-2 whitespace-nowrap">
                      {formatUiDate(alert.createdAt)}
                    </TableCell>
                    <TableCell className="text-xs text-slate-300 py-2">
                      {alert.predictiveModel?.name ?? 'Unknown'}
                    </TableCell>
                    <TableCell className="py-2">
                      <SeverityBadge severity={alert.severity} />
                    </TableCell>
                    <TableCell className="text-xs text-slate-400 py-2 max-w-[200px] truncate">
                      {alert.message}
                    </TableCell>
                    <TableCell className="py-2">
                      {alert.resolvedAt ? (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-emerald-500/30 text-emerald-400">
                          Resolved
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-slate-500/30 text-slate-400">
                          Acknowledged
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// History icon (alias)
// ============================================================================

function History({ className }: { className?: string }) {
  return <Clock className={className} />;
}

// ============================================================================
// Main PredictiveMaintenancePanel
// ============================================================================

export function PredictiveMaintenancePanel({
  assetId,
  compact = false,
}: PredictiveMaintenancePanelProps) {
  const predictionAlerts = useDigitalTwinStore((s) => s.predictionAlerts);
  const predictiveModels = useDigitalTwinStore((s) => s.predictiveModels);
  const isLoading = useDigitalTwinStore((s) => s.isLoadingPredictionData);
  const loadPredictionAlerts = useDigitalTwinStore((s) => s.loadPredictionAlerts);
  const loadPredictiveModels = useDigitalTwinStore((s) => s.loadPredictiveModels);
  const acknowledgePredictionAlert = useDigitalTwinStore((s) => s.acknowledgePredictionAlert);

  const [tabView, setTabView] = useState<'alerts' | 'models' | 'history'>('alerts');

  // Load data
  useEffect(() => {
    loadPredictiveModels();
    loadPredictionAlerts(assetId ? { assetId } : {});
  }, [assetId, loadPredictionAlerts, loadPredictiveModels]);

  const refresh = useCallback(() => {
    loadPredictiveModels();
    loadPredictionAlerts(assetId ? { assetId } : {});
  }, [assetId, loadPredictionAlerts, loadPredictiveModels]);

  // Derived data
  const activeAlerts = useMemo(() => predictionAlerts.filter((a) => !a.isAcknowledged), [predictionAlerts]);
  const acknowledgedAlerts = useMemo(() => predictionAlerts.filter((a) => a.isAcknowledged), [predictionAlerts]);

  if (isLoading && predictiveModels.length === 0 && predictionAlerts.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-xs">Loading predictive maintenance data...</span>
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="space-y-3">
        {/* Compact model status */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-2 text-center">
            <div className="text-[9px] text-slate-500 uppercase">Active Alerts</div>
            <div className="text-sm font-bold text-red-400">{activeAlerts.length}</div>
          </div>
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-2 text-center">
            <div className="text-[9px] text-slate-500 uppercase">Active Models</div>
            <div className="text-sm font-bold text-emerald-400">
              {predictiveModels.filter((m) => m.isActive).length}
            </div>
          </div>
        </div>

        {/* Compact active alerts */}
        {activeAlerts.slice(0, 3).map((alert) => (
          <div key={alert.id} className="p-2 rounded-md bg-white/[0.02] border border-white/[0.04]">
            <div className="flex items-center gap-1.5 mb-1">
              <SeverityBadge severity={alert.severity} />
              {alert.confidence !== null && (
                <span className="text-[9px] text-slate-500">{alert.confidence}%</span>
              )}
            </div>
            <div className="text-[10px] text-slate-300 truncate">{alert.message}</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <Brain className="h-4 w-4 text-purple-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-200">Predictive Maintenance</h2>
            <p className="text-[10px] text-slate-500">AI-driven failure prediction and model management</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={refresh}
          className="h-8 w-8 text-slate-400 hover:text-slate-200"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Model Status Cards */}
      <ModelStatusCards models={predictiveModels} />

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 bg-white/[0.03] p-1 rounded-lg border border-white/[0.06]">
        <button
          onClick={() => setTabView('alerts')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-[10px] font-medium transition-colors ${
            tabView === 'alerts'
              ? 'bg-amber-500/15 text-amber-300'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <AlertTriangle className="h-3 w-3" />
          Active Alerts
          {activeAlerts.length > 0 && (
            <span className="bg-red-500/20 text-red-400 text-[8px] px-1.5 py-0 rounded-full">
              {activeAlerts.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTabView('models')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-[10px] font-medium transition-colors ${
            tabView === 'models'
              ? 'bg-cyan-500/15 text-cyan-300'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <Database className="h-3 w-3" />
          Model Registry
        </button>
        <button
          onClick={() => setTabView('history')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-[10px] font-medium transition-colors ${
            tabView === 'history'
              ? 'bg-slate-500/15 text-slate-300'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <Clock className="h-3 w-3" />
          Alert History
        </button>
      </div>

      {/* Tab Content */}
      {tabView === 'alerts' && (
        <ActiveAlertsSection alerts={activeAlerts} onAcknowledge={acknowledgePredictionAlert} />
      )}

      {tabView === 'models' && (
        <ModelRegistryTable models={predictiveModels} />
      )}

      {tabView === 'history' && (
        <AlertHistoryTable alerts={acknowledgedAlerts} />
      )}
    </div>
  );
}

export default PredictiveMaintenancePanel;
