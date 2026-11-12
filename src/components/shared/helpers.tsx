import React from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  AlertCircle,
  Users,
  Play,
  Check,
  Lock,
  Factory,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

// ============================================================================
// CURRENCY & NUMBER FORMATTING (Ghana Cedis)
// ============================================================================

/** Format a number as Ghana Cedis (₵) */
export function formatCurrency(amount: number | undefined | null): string {
  if (amount == null || isNaN(amount)) return '-';
  const formatted = Math.abs(amount).toLocaleString(undefined, {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${amount < 0 ? '-' : ''}₵${formatted}`;
}

/** Format a number with commas (e.g. 1,234,567) */
export function formatNumber(num: number | undefined | null, decimals?: number): string {
  if (num == null || isNaN(num)) return '-';
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Format percentage */
export function formatPercent(value: number | undefined | null, decimals = 1): string {
  if (value == null || isNaN(value)) return '-';
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
}

// ============================================================================
// DURATION FORMATTING
// ============================================================================

/**
 * Convert decimal hours to DD:HH:MM:SS or HH:MM:SS format.
 * - Input: 2.06 → "02:03:36"
 * - Input: 25.5 → "1:01:30:00" (1 day, 1hr, 30min)
 * - Input: 0.5 → "00:30:00"
 * - Input: null/NaN → "—"
 */
export function formatDuration(decimalHours: number | null | undefined): string {
  if (decimalHours == null || isNaN(decimalHours) || !isFinite(decimalHours)) return '—';
  const totalSeconds = Math.round(decimalHours * 3600);
  const dd = Math.floor(totalSeconds / 86400);
  const hh = Math.floor((totalSeconds % 86400) / 3600);
  const mm = Math.floor((totalSeconds % 3600) / 60);
  const ss = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (dd > 0) return `${dd}:${pad(hh)}:${pad(mm)}:${pad(ss)}`;
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

/**
 * Convert minutes to DD:HH:MM:SS or HH:MM:SS format.
 * - Input: 90 → "01:30:00"
 * - Input: 1500 → "00:25:00:00" → "1:01:00:00"
 */
export function formatDurationFromMinutes(minutes: number | null | undefined): string {
  if (minutes == null || isNaN(minutes)) return '—';
  return formatDuration(minutes / 60);
}

/** Ghana-aware date format from company settings */
export function getDateFormat(): string {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('company_date_format') || 'dd/MM/yyyy';
  }
  return 'dd/MM/yyyy';
}

/** Map stored date format to date-fns pattern */
function mapDateFormat(stored: string): string {
  const map: Record<string, string> = {
    'DD/MM/YYYY': 'dd/MM/yyyy',
    'MM/DD/YYYY': 'MM/dd/yyyy',
    'YYYY-MM-DD': 'yyyy-MM-dd',
    'dd/MM/yyyy': 'dd/MM/yyyy',
    'MM/dd/yyyy': 'MM/dd/yyyy',
  };
  return map[stored] || 'dd/MM/yyyy';
}

/** Format date using company date format */
export function formatDateLocal(d?: string | Date): string {
  if (!d) return '-';
  const fmt = mapDateFormat(getDateFormat());
  try {
    return format(new Date(d), fmt);
  } catch {
    return '-';
  }
}

/** Get Ghana regions list */
export const GHANA_REGIONS = [
  'Greater Accra', 'Ashanti', 'Western', 'Eastern', 'Central',
  'Northern', 'Volta', 'Upper East', 'Upper West', 'Bono',
  'Bono East', 'Ahafo', 'Savannah', 'North East', 'Oti', 'Western North',
] as const;

// ============================================================================
// HELPERS
// ============================================================================

const priorityColors: Record<string, string> = {
  low: 'bg-slate-100 text-slate-700 border-slate-200',
  medium: 'bg-sky-50 text-sky-700 border-sky-200',
  high: 'bg-amber-50 text-amber-700 border-amber-200',
  urgent: 'bg-red-50 text-red-700 border-red-200',
  critical: 'bg-red-50 text-red-700 border-red-200',
  emergency: 'bg-red-100 text-red-800 border-red-300',
};

const mrStatusColors: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  converted: 'bg-teal-50 text-teal-700 border-teal-200',
};

const woStatusColors: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600 border-slate-200',
  requested: 'bg-sky-50 text-sky-700 border-sky-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  planned: 'bg-violet-50 text-violet-700 border-violet-200',
  assigned: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  in_progress: 'bg-amber-50 text-amber-700 border-amber-200',
  waiting_parts: 'bg-orange-50 text-orange-700 border-orange-200',
  on_hold: 'bg-purple-50 text-purple-700 border-purple-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  verified: 'bg-teal-50 text-teal-700 border-teal-200',
  closed: 'bg-slate-100 text-slate-500 border-slate-200',
  cancelled: 'bg-red-50 text-red-600 border-red-200',
};

export function StatusIcon({ status }: { status: string }) {
  const iconMap: Record<string, React.ReactNode> = {
    pending: <Clock className="h-3.5 w-3.5" />,
    approved: <CheckCircle2 className="h-3.5 w-3.5" />,
    rejected: <XCircle className="h-3.5 w-3.5" />,
    converted: <RefreshCw className="h-3.5 w-3.5" />,
    draft: <AlertCircle className="h-3.5 w-3.5" />,
    assigned: <Users className="h-3.5 w-3.5" />,
    in_progress: <Play className="h-3.5 w-3.5" />,
    completed: <Check className="h-3.5 w-3.5" />,
    verified: <CheckCircle2 className="h-3.5 w-3.5" />,
    closed: <Lock className="h-3.5 w-3.5" />,
  };
  return <>{iconMap[status]}</>;
}

export function getInitials(name: string) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export function formatDate(d?: string) {
  if (!d) return '-';
  return format(new Date(d), 'MMM d, yyyy');
}

export function formatDateTime(d?: string) {
  if (!d) return '-';
  return format(new Date(d), 'MMM d, yyyy HH:mm');
}

export function timeAgo(d?: string) {
  if (!d) return '';
  return formatDistanceToNow(new Date(d), { addSuffix: true });
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={mrStatusColors[status] || woStatusColors[status] || 'bg-gray-50 text-gray-700'}>
      <span className="flex items-center gap-1">
        <StatusIcon status={status} />
        {status.replace(/_/g, ' ').toUpperCase()}
      </span>
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <Badge variant="outline" className={priorityColors[priority] || ''}>
      {priority.toUpperCase()}
    </Badge>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mb-3">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="font-medium text-sm">{title}</h3>
      {description && (
        <p className="text-xs text-muted-foreground mt-1 max-w-[280px]">{description}</p>
      )}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

// ============================================================================
// LOADING SCREEN
// ============================================================================

export function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <div className="h-12 w-12 mx-auto rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center animate-pulse shadow-lg">
          <Factory className="h-6 w-6 text-white" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">iAssetsPro</h2>
          <p className="text-sm text-muted-foreground">Loading your workspace...</p>
        </div>
        <div className="flex gap-1 justify-center">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:0ms]" />
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:150ms]" />
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

export function LoadingSkeleton() {
  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-[1600px] mx-auto">
      <div className="space-y-2">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}

export function MiniBarChart({ data, color, maxVal }: { data: number[]; color: string; maxVal: number }) {
  const bars = 7;
  return (
    <div className="flex items-end gap-[3px] h-8">
      {Array.from({ length: bars }).map((_, i) => {
        const val = data[i] ?? 0;
        const h = maxVal > 0 ? Math.max(2, (val / maxVal) * 100) : 2;
        const isLast = i === bars - 1;
        return (
          <div
            key={i}
            className="w-[5px] rounded-sm"
            style={{ height: `${h}%`, backgroundColor: color, opacity: isLast ? 1 : 0.4 }}
          />
        );
      })}
    </div>
  );
}

export function ProgressRing({ value, size = 44, strokeWidth = 4, color = '#10b981' }: { value: number; size?: number; strokeWidth?: number; color?: string }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-muted/50" />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-700" />
    </svg>
  );
}
