'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { format, startOfWeek, endOfWeek, addDays, addWeeks, subWeeks, isSameDay, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { api, useAbortRef } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { EmptyState, LoadingSkeleton, formatDuration } from '@/components/shared/helpers';
import {
  ChevronLeft, ChevronRight, CalendarDays, Download, Clock,
  Users, User, Timer, FileSpreadsheet, TrendingUp, AlertTriangle,
  BarChart3, Activity, HardHat, Layers, ArrowUpRight,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface TimeLogEntry {
  id: string;
  workOrderId: string;
  userId: string;
  action: string;
  duration: number | null;
  activityType: string;
  notes?: string;
  timestamp: string;
  breakMinutes: number;
  startTime?: string;
  endTime?: string;
  user: { id: string; fullName: string; username: string; department: string };
  workOrder: { id: string; woNumber: string; title: string; status: string; type: string };
}

interface TeamMember {
  id: string;
  fullName: string;
  department?: string;
  primaryTrade?: string;
  status: string;
}

interface GridRow {
  workOrderId: string;
  woNumber: string;
  title: string;
  status: string;
  type: string;
  dailyHours: number[];
  totalHours: number;
  dailyBreakdown: Record<number, { activity: string; hours: number }[]>;
}

type ViewMode = 'mine' | 'team';

// ============================================================================
// HELPERS
// ============================================================================

const WEEK_OVERHOUR_THRESHOLD = 40;
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getWeekDates(referenceDate: Date): Date[] {
  const monday = startOfWeek(referenceDate, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

function cellColorClass(hours: number): string {
  if (hours === 0) return 'bg-gray-50 text-gray-300';
  if (hours <= 4) return 'bg-emerald-50 text-emerald-700';
  if (hours <= 8) return 'bg-green-100 text-green-800';
  if (hours <= 12) return 'bg-amber-100 text-amber-800';
  return 'bg-red-100 text-red-800';
}

function cellBgClass(hours: number): string {
  if (hours === 0) return '';
  if (hours <= 4) return 'bg-emerald-50/50';
  if (hours <= 8) return 'bg-green-50/50';
  if (hours <= 12) return 'bg-amber-50/50';
  return 'bg-red-50/50';
}

const WO_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  requested: 'bg-sky-50 text-sky-700',
  approved: 'bg-emerald-50 text-emerald-700',
  planned: 'bg-violet-50 text-violet-700',
  assigned: 'bg-cyan-50 text-cyan-700',
  in_progress: 'bg-amber-50 text-amber-700',
  waiting_parts: 'bg-orange-50 text-orange-700',
  on_hold: 'bg-purple-50 text-purple-700',
  completed: 'bg-emerald-50 text-emerald-700',
  verified: 'bg-teal-50 text-teal-700',
  closed: 'bg-slate-100 text-slate-500',
  cancelled: 'bg-red-50 text-red-600',
};

function WoStatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${WO_STATUS_COLORS[status] || 'bg-gray-100 text-gray-700'}`}>
      {label}
    </Badge>
  );
}

function isSupervisorOrAbove(): boolean {
  const slugs = JSON.parse(
    typeof window !== 'undefined'
      ? localStorage.getItem('user_roles') || '[]'
      : '[]'
  ) as string[];
  return slugs.some((r: string) =>
    ['admin', 'maintenance_supervisor', 'maintenance_manager', 'plant_manager', 'hr_manager', 'maintenance_planner'].includes(r)
  );
}

function canViewAllTimeLogs(): boolean {
  const perms = JSON.parse(
    typeof window !== 'undefined'
      ? localStorage.getItem('user_permissions') || '[]'
      : '[]'
  ) as string[];
  return perms.some((p: string) =>
    ['time_logs.view', 'time_logs.manage', 'time_logs.create', 'work_orders.view_all'].includes(p)
  ) || isSupervisorOrAbove();
}

// ============================================================================
// WEEK NAVIGATION BAR
// ============================================================================

function WeekNavBar({
  weekStart,
  onPrev,
  onNext,
  onCurrent,
}: {
  weekStart: Date;
  onPrev: () => void;
  onNext: () => void;
  onCurrent: () => void;
}) {
  const weekEnd = addDays(weekStart, 6);
  const isCurrentWeek = startOfWeek(new Date(), { weekStartsOn: 1 }).getTime() === weekStart.getTime();

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" className="h-9 w-9" onClick={onPrev}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="icon" className="h-9 w-9" onClick={onNext}>
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button variant={isCurrentWeek ? 'default' : 'outline'} size="sm" onClick={onCurrent} className="h-9 gap-1.5">
        <CalendarDays className="h-3.5 w-3.5" />
        Current Week
      </Button>
      <div className="ml-2 flex items-center gap-2">
        <span className="text-sm font-semibold text-foreground">
          {format(weekStart, 'MMM d')} — {format(weekEnd, 'MMM d, yyyy')}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// SUMMARY STAT CARD
// ============================================================================

function SummaryCard({
  icon: Icon,
  label,
  value,
  color,
  bgColor,
  subtext,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
  bgColor: string;
  subtext?: string;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`${bgColor} p-2.5 rounded-lg`}>
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            <p className="text-xs text-muted-foreground truncate">{label}</p>
          </div>
          {subtext && (
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{subtext}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// GRID CELL WITH TOOLTIP
// ============================================================================

function GridCell({
  hours,
  breakdown,
  isTotal,
}: {
  hours: number;
  breakdown?: { activity: string; hours: number }[];
  isTotal?: boolean;
}) {
  const hasData = hours > 0;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <td
            className={`text-center px-2 py-2 text-xs font-medium border-r border-b border-gray-100 transition-colors cursor-default
              ${hasData ? cellBgClass(hours) + ' hover:opacity-80' : 'hover:bg-gray-50'}
              ${isTotal ? 'font-bold text-foreground border-t-2 border-gray-300' : ''}
            `}
          >
            {formatDuration(hours)}
          </td>
        </TooltipTrigger>
        {hasData && breakdown && breakdown.length > 0 && (
          <TooltipContent side="top" className="max-w-[220px]">
            <div className="space-y-1">
              <p className="text-xs font-semibold mb-1">Activity Breakdown</p>
              {breakdown.map((b) => (
                <div key={b.activity} className="flex items-center justify-between gap-4">
                  <span className="text-[11px] text-muted-foreground capitalize">{b.activity.replace(/_/g, ' ')}</span>
                  <span className="text-[11px] font-medium">{formatDuration(b.hours)}</span>
                </div>
              ))}
            </div>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

// ============================================================================
// LOADING SKELETON FOR THE GRID
// ============================================================================

function GridLoadingSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="p-6 space-y-4">
          <div className="flex justify-between">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-9 w-32" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-2">
                <Skeleton className="h-10 w-56 flex-shrink-0 rounded" />
                {Array.from({ length: 7 }).map((_, j) => (
                  <Skeleton key={j} className="h-10 flex-1 rounded" />
                ))}
                <Skeleton className="h-10 w-16 flex-shrink-0 rounded" />
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function TimesheetPage() {
  const { user, hasPermission, isAdmin } = useAuthStore();
  const abortRef = useAbortRef();

  // ── State ──
  const [referenceDate, setReferenceDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('mine');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterActivity, setFilterActivity] = useState<string>('all');

  const [timeLogs, setTimeLogs] = useState<TimeLogEntry[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // ── Derived: can see team view? ──
  const canViewTeam = useMemo(() => {
    return canViewAllTimeLogs() || (user?.roles || []).some(
      (r: any) => ['maintenance_supervisor', 'maintenance_manager', 'plant_manager', 'hr_manager', 'maintenance_planner', 'admin'].includes(r.slug)
    );
  }, [user]);

  // ── Week dates ──
  const weekDates = useMemo(() => getWeekDates(referenceDate), [referenceDate]);
  const weekStartStr = format(weekDates[0], 'yyyy-MM-dd');
  const weekEndStr = format(weekDates[6], 'yyyy-MM-dd');

  // ── Fetch team members ──
  useEffect(() => {
    if (!canViewTeam) return;
    api
      .get<TeamMember[]>('/api/users?status=active&role=maintenance_technician', {
        signal: abortRef.current.signal,
      })
      .then((res) => {
        if (res.success && res.data) {
          const members: TeamMember[] = Array.isArray(res.data)
            ? res.data.map((u: any) => ({
                id: u.id,
                fullName: u.fullName || u.username,
                department: u.department || '',
                status: u.status || 'active',
              }))
            : [];
          setTeamMembers(members);
        }
      })
      .catch(() => {});
  }, [canViewTeam, abortRef]);

  // ── Fetch time logs ──
  const fetchTimeLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('from', weekStartStr);
      params.set('to', weekEndStr);
      params.set('limit', '1000');

      // For mine view or when a user is selected
      if (viewMode === 'mine' || selectedUserId) {
        params.set('userId', selectedUserId || user?.id || '');
      }

      const res = await api.get<TimeLogEntry[]>(`/api/time-logs?${params}`, {
        signal: abortRef.current.signal,
      });

      if (res.success && res.data) {
        const logs: TimeLogEntry[] = Array.isArray(res.data) ? res.data : [];
        setTimeLogs(logs);
      } else {
        setTimeLogs([]);
        if (res.error) toast.error(res.error);
      }
    } catch {
      setTimeLogs([]);
    } finally {
      setLoading(false);
    }
  }, [weekStartStr, weekEndStr, viewMode, selectedUserId, user, abortRef]);

  useEffect(() => {
    fetchTimeLogs();
  }, [fetchTimeLogs]);

  // ── Build grid data ──
  const gridData = useMemo(() => {
    // Apply client-side filters
    let filtered = timeLogs;

    if (filterStatus !== 'all') {
      filtered = filtered.filter((log) => log.workOrder?.status === filterStatus);
    }
    if (filterActivity !== 'all') {
      filtered = filtered.filter((log) => log.activityType === filterActivity);
    }

    // Group by work order
    const woMap = new Map<string, GridRow>();

    for (const log of filtered) {
      if (!log.workOrderId || !log.duration) continue;

      const wo = log.workOrder;
      if (!wo) continue;

      let row = woMap.get(log.workOrderId);
      if (!row) {
        row = {
          workOrderId: log.workOrderId,
          woNumber: wo.woNumber || '—',
          title: wo.title || 'Untitled',
          status: wo.status || 'unknown',
          type: wo.type || 'corrective',
          dailyHours: [0, 0, 0, 0, 0, 0, 0],
          totalHours: 0,
          dailyBreakdown: {},
        };
        woMap.set(log.workOrderId, row);
      }

      // Determine which day of the week
      const logDate = parseISO(log.timestamp);
      let dayIndex = -1;
      for (let d = 0; d < 7; d++) {
        if (isSameDay(logDate, weekDates[d])) {
          dayIndex = d;
          break;
        }
      }
      if (dayIndex < 0) continue;

      const dur = log.duration || 0;
      row.dailyHours[dayIndex] += dur;
      row.totalHours += dur;

      // Track breakdown per day
      if (!row.dailyBreakdown[dayIndex]) {
        row.dailyBreakdown[dayIndex] = [];
      }

      const act = log.activityType || 'maintenance';
      const existing = row.dailyBreakdown[dayIndex].find((b) => b.activity === act);
      if (existing) {
        existing.hours += dur;
      } else {
        row.dailyBreakdown[dayIndex].push({ activity: act, hours: dur });
      }
    }

    // Round all hours to 1 decimal
    const rows = Array.from(woMap.values()).map((row) => ({
      ...row,
      dailyHours: row.dailyHours.map((h) => Math.round(h * 10) / 10),
      totalHours: Math.round(row.totalHours * 10) / 10,
      dailyBreakdown: Object.fromEntries(
        Object.entries(row.dailyBreakdown).map(([day, breakdown]) => [
          day,
          breakdown.map((b) => ({ ...b, hours: Math.round(b.hours * 10) / 10 })),
        ])
      ),
    }));

    return rows;
  }, [timeLogs, filterStatus, filterActivity, weekDates]);

  // ── Compute summary ──
  const summary = useMemo(() => {
    const dailyTotals = [0, 0, 0, 0, 0, 0, 0];
    let grandTotal = 0;
    let uniqueWOs = new Set<string>();
    let uniqueDays = new Set<number>();

    for (const row of gridData) {
      uniqueWOs.add(row.workOrderId);
      for (let d = 0; d < 7; d++) {
        dailyTotals[d] += row.dailyHours[d];
        grandTotal += row.dailyHours[d];
        if (row.dailyHours[d] > 0) uniqueDays.add(d);
      }
    }

    // Round
    const roundedDaily = dailyTotals.map((h) => Math.round(h * 10) / 10);
    grandTotal = Math.round(grandTotal * 10) / 10;
    const overtime = Math.max(0, grandTotal - WEEK_OVERHOUR_THRESHOLD);
    const avgPerWO = gridData.length > 0 ? Math.round((grandTotal / gridData.length) * 10) / 10 : 0;

    return {
      dailyTotals: roundedDaily,
      grandTotal,
      overtime: Math.round(overtime * 10) / 10,
      woCount: uniqueWOs.size,
      daysWorked: uniqueDays.size,
      avgPerWO,
    };
  }, [gridData]);

  // ── Handlers ──
  const handlePrevWeek = () => setReferenceDate((d) => subWeeks(d, 1));
  const handleNextWeek = () => setReferenceDate((d) => addWeeks(d, 1));
  const handleCurrentWeek = () => setReferenceDate(new Date());

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      params.set('from', weekStartStr);
      params.set('to', weekEndStr);
      params.set('export', 'csv');
      if (viewMode === 'mine' || selectedUserId) {
        params.set('userId', selectedUserId || user?.id || '');
      }

      const response = await api.getRaw(`/api/time-logs?${params}`);

      if (!response.ok) {
        toast.error('Export failed');
        setExporting(false);
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `timesheet-${weekStartStr}-to-${weekEndStr}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('CSV exported successfully');
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  // ── Active filters count ──
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterStatus !== 'all') count++;
    if (filterActivity !== 'all') count++;
    return count;
  }, [filterStatus, filterActivity]);

  const clearFilters = () => {
    setFilterStatus('all');
    setFilterActivity('all');
  };

  // ── Render ──
  return (
    <div className="page-content">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-teal-100 rounded-xl">
            <Timer className="h-6 w-6 text-teal-700" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold tracking-tight">Timesheet</h2>
              <Badge variant="secondary" className="font-mono">
                {summary.woCount} WO{summary.woCount !== 1 ? 's' : ''}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Weekly time tracking across work orders for payroll
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleExportCSV}
            disabled={exporting || loading}
          >
            <Download className="h-3.5 w-3.5" />
            {exporting ? 'Exporting...' : 'Export CSV'}
          </Button>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <SummaryCard
          icon={Clock}
          label="Total Hours"
          value={formatDuration(summary.grandTotal)}
          color="text-teal-600"
          bgColor="bg-teal-50"
        />
        <SummaryCard
          icon={AlertTriangle}
          label="Overtime Hours"
          value={formatDuration(summary.overtime)}
          color={summary.overtime > 0 ? 'text-red-600' : 'text-gray-500'}
          bgColor={summary.overtime > 0 ? 'bg-red-50' : 'bg-gray-50'}
          subtext={`> ${WEEK_OVERHOUR_THRESHOLD}h`}
        />
        <SummaryCard
          icon={Layers}
          label="Work Orders"
          value={summary.woCount}
          color="text-emerald-600"
          bgColor="bg-emerald-50"
        />
        <SummaryCard
          icon={TrendingUp}
          label="Avg Hours/WO"
          value={formatDuration(summary.avgPerWO)}
          color="text-amber-600"
          bgColor="bg-amber-50"
        />
        <SummaryCard
          icon={CalendarDays}
          label="Days Worked"
          value={`${summary.daysWorked}/7`}
          color="text-slate-600"
          bgColor="bg-slate-50"
        />
      </div>

      {/* ── Week Navigation + View Mode + Filters ── */}
      <div className="space-y-4">
        {/* Week nav + View mode toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <WeekNavBar
            weekStart={weekDates[0]}
            onPrev={handlePrevWeek}
            onNext={handleNextWeek}
            onCurrent={handleCurrentWeek}
          />

          {/* View mode toggle (only for supervisors) */}
          {canViewTeam && (
            <div className="flex items-center gap-2 bg-muted rounded-lg p-1">
              <Button
                size="sm"
                variant={viewMode === 'mine' ? 'default' : 'ghost'}
                className={`gap-1.5 h-8 ${viewMode === 'mine' ? 'bg-background shadow-sm' : ''}`}
                onClick={() => { setViewMode('mine'); setSelectedUserId(''); }}
              >
                <User className="h-3.5 w-3.5" />
                My Timesheet
              </Button>
              <Button
                size="sm"
                variant={viewMode === 'team' ? 'default' : 'ghost'}
                className={`gap-1.5 h-8 ${viewMode === 'team' ? 'bg-background shadow-sm' : ''}`}
                onClick={() => { setViewMode('team'); }}
              >
                <Users className="h-3.5 w-3.5" />
                Team Timesheet
              </Button>
            </div>
          )}
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Technician selector (team view) */}
          {viewMode === 'team' && canViewTeam && (
            <Select
              value={selectedUserId || '__all__'}
              onValueChange={(v) => setSelectedUserId(v === '__all__' ? '' : v)}
            >
              <SelectTrigger className="w-52">
                <Users className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="All Technicians" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Technicians</SelectItem>
                {teamMembers.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    <div className="flex items-center gap-2">
                      <span>{member.fullName}</span>
                      {member.department && (
                        <span className="text-xs text-muted-foreground">({member.department})</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Status filter */}
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="WO Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="assigned">Assigned</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="waiting_parts">Waiting Parts</SelectItem>
              <SelectItem value="on_hold">On Hold</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>

          {/* Activity type filter */}
          <Select value={filterActivity} onValueChange={setFilterActivity}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Activity Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Activities</SelectItem>
              <SelectItem value="maintenance">Maintenance</SelectItem>
              <SelectItem value="travel">Travel</SelectItem>
              <SelectItem value="inspection">Inspection</SelectItem>
              <SelectItem value="testing">Testing</SelectItem>
              <SelectItem value="standby">Standby</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>

          {/* Clear filters */}
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-muted-foreground hover:text-foreground gap-1.5">
              Clear
              <Badge variant="secondary" className="h-5 min-w-5 px-1 text-[10px]">{activeFilterCount}</Badge>
            </Button>
          )}
        </div>
      </div>

      {/* ── Timesheet Grid ── */}
      {loading ? (
        <GridLoadingSkeleton />
      ) : gridData.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={FileSpreadsheet}
              title="No time entries this week"
              description="No time logs were recorded for the selected period. Try a different week or adjust filters."
            />
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="sticky left-0 z-10 bg-muted/50 min-w-[220px] w-[220px]">
                      <div className="flex items-center gap-1.5">
                        <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                        Work Order
                      </div>
                    </TableHead>
                    {weekDates.map((date, i) => (
                      <TableHead key={i} className="min-w-[100px] text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-xs font-medium">{DAY_NAMES[i]}</span>
                          <span className="text-[10px] text-muted-foreground">{format(date, 'MMM d')}</span>
                        </div>
                      </TableHead>
                    ))}
                    <TableHead className="min-w-[80px] text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-xs font-medium">Total</span>
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Data rows */}
                  {gridData.map((row) => (
                    <TableRow
                      key={row.workOrderId}
                      className={`hover:bg-muted/20 transition-colors ${gridData.indexOf(row) % 2 === 0 ? '' : 'bg-muted/10'}`}
                    >
                      {/* WO info */}
                      <TableCell className="sticky left-0 z-10 bg-background">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="text-xs font-mono font-semibold text-foreground">
                                {row.woNumber}
                              </span>
                              <WoStatusBadge status={row.status} />
                            </div>
                            <p className="text-xs text-muted-foreground truncate max-w-[180px]" title={row.title}>
                              {row.title}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      {/* Daily hours cells */}
                      {row.dailyHours.map((hours, dayIdx) => (
                        <GridCell
                          key={dayIdx}
                          hours={hours}
                          breakdown={row.dailyBreakdown[dayIdx]}
                        />
                      ))}
                      {/* Row total */}
                      <TableCell
                        className={`text-center px-2 py-2 font-bold text-sm
                          ${row.totalHours > 0 ? cellColorClass(row.totalHours) : 'text-gray-300'}
                        `}
                      >
                        {formatDuration(row.totalHours)}
                      </TableCell>
                    </TableRow>
                  ))}

                  {/* Summary row */}
                  <TableRow className="bg-muted/40 font-semibold">
                    <TableCell className="sticky left-0 z-10 bg-muted/40">
                      <div className="flex items-center gap-1.5">
                        <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-semibold">Daily Totals</span>
                      </div>
                    </TableCell>
                    {summary.dailyTotals.map((hours, i) => (
                      <GridCell key={i} hours={hours} isTotal />
                    ))}
                    <TableCell
                      className={`text-center px-2 py-2 text-sm font-bold
                        ${summary.grandTotal > WEEK_OVERHOUR_THRESHOLD ? 'bg-red-100 text-red-800' : summary.grandTotal > 0 ? 'bg-emerald-100 text-emerald-800' : 'text-gray-300'}
                      `}
                    >
                      <div className="flex flex-col items-center">
                        <span>{formatDuration(summary.grandTotal)}</span>
                        {summary.overtime > 0 && (
                          <span className="text-[9px] text-red-600 font-medium mt-0.5">
                            +{formatDuration(summary.overtime)} OT
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Legend ── */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Hours Legend:</span>
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-gray-200" />
          <span>No entries</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-emerald-200" />
          <span>1–4h</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-green-200" />
          <span>5–8h</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-amber-200" />
          <span>9–12h</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-red-200" />
          <span>&gt;12h</span>
        </div>
      </div>

      {/* ── Weekly Breakdown Sidebar (shown below on smaller screens) ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-teal-600" />
            Weekly Activity Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="space-y-3">
            {weekDates.map((date, i) => {
              const total = summary.dailyTotals[i];
              const maxDaily = Math.max(...summary.dailyTotals, 1);
              const pct = (total / maxDaily) * 100;

              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-16 text-xs text-muted-foreground flex-shrink-0">
                    {DAY_NAMES[i]} {format(date, 'd')}
                  </div>
                  <div className="flex-1 h-6 bg-muted/50 rounded-full overflow-hidden relative">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        total === 0
                          ? ''
                          : total <= 8
                          ? 'bg-emerald-500'
                          : total <= 12
                          ? 'bg-amber-500'
                          : 'bg-red-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-[11px] font-medium">
                      {formatDuration(total)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <Separator className="my-4" />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-lg font-bold text-teal-600">{formatDuration(summary.grandTotal)}</p>
              <p className="text-[10px] text-muted-foreground">Total Hours</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className={`text-lg font-bold ${summary.overtime > 0 ? 'text-red-600' : 'text-gray-500'}`}>
                {formatDuration(summary.overtime)}
              </p>
              <p className="text-[10px] text-muted-foreground">Overtime</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-lg font-bold text-emerald-600">{summary.woCount}</p>
              <p className="text-[10px] text-muted-foreground">Work Orders</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-lg font-bold text-amber-600">{formatDuration(summary.avgPerWO)}</p>
              <p className="text-[10px] text-muted-foreground">Avg Hrs/WO</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default TimesheetPage;
