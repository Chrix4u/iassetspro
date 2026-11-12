'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// ============================================================================
// STATUS DOT — Animated status indicator
// ============================================================================

export function StatusDot({ 
  status, 
  size = 'sm', 
  pulse = false,
  label 
}: { 
  status: 'online' | 'offline' | 'warning' | 'error' | 'maintenance' | 'idle';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  pulse?: boolean;
  label?: string;
}) {
  const colors = {
    online: 'bg-emerald-500',
    offline: 'bg-slate-400',
    warning: 'bg-amber-500',
    error: 'bg-red-500',
    maintenance: 'bg-violet-500',
    idle: 'bg-sky-400',
  };

  const sizes = { xs: 'w-1.5 h-1.5', sm: 'w-2 h-2', md: 'w-2.5 h-2.5', lg: 'w-3 h-3' };

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('rounded-full', colors[status], sizes[size], pulse && 'animate-pulse')} />
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
    </span>
  );
}

// ============================================================================
// STAT CARD — KPI metric display with trend
// ============================================================================

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendLabel,
  color = 'emerald',
  onClick,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ElementType;
  trend?: number;
  trendLabel?: string;
  color?: 'emerald' | 'amber' | 'red' | 'sky' | 'violet' | 'slate';
  onClick?: () => void;
}) {
  const colorMap = {
    emerald: { bg: 'bg-emerald-50 dark:bg-emerald-950/30', iconBg: 'bg-emerald-100 dark:bg-emerald-900/40', icon: 'text-emerald-600 dark:text-emerald-400' },
    amber: { bg: 'bg-amber-50 dark:bg-amber-950/30', iconBg: 'bg-amber-100 dark:bg-amber-900/40', icon: 'text-amber-600 dark:text-amber-400' },
    red: { bg: 'bg-red-50 dark:bg-red-950/30', iconBg: 'bg-red-100 dark:bg-red-900/40', icon: 'text-red-600 dark:text-red-400' },
    sky: { bg: 'bg-sky-50 dark:bg-sky-950/30', iconBg: 'bg-sky-100 dark:bg-sky-900/40', icon: 'text-sky-600 dark:text-sky-400' },
    violet: { bg: 'bg-violet-50 dark:bg-violet-950/30', iconBg: 'bg-violet-100 dark:bg-violet-900/40', icon: 'text-violet-600 dark:text-violet-400' },
    slate: { bg: 'bg-slate-50 dark:bg-slate-800/30', iconBg: 'bg-slate-100 dark:bg-slate-700/40', icon: 'text-slate-600 dark:text-slate-400' },
  };

  const c = colorMap[color];

  return (
    <div
      className={cn(
        'rounded-xl border border-border/60 p-4 transition-all',
        c.bg,
        onClick && 'cursor-pointer hover:shadow-md'
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <p className="text-xl font-bold mt-1 tracking-tight">{value}</p>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
        {Icon && (
          <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center shrink-0', c.iconBg)}>
            <Icon className={cn('h-5 w-5', c.icon)} />
          </div>
        )}
      </div>
      {trend !== undefined && (
        <div className="flex items-center gap-1 mt-2">
          <span className={cn(
            'text-xs font-semibold',
            trend >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
          )}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
          {trendLabel && (
            <span className="text-[10px] text-muted-foreground">{trendLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// EMPTY STATE — Consistent empty state component
// ============================================================================

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  actionLabel,
  onAction,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  action?: 'create' | 'refresh' | 'search';
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
        <Icon className="h-7 w-7 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-semibold mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground max-w-[320px] mb-4">{description}</p>
      {onAction && actionLabel && (
        <button
          onClick={onAction}
          className="text-xs font-medium text-primary hover:underline"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// ============================================================================
// SECTION HEADER — Consistent section header
// ============================================================================

export function SectionHeader({
  title,
  description,
  actions,
  badge,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  badge?: { label: string; variant?: 'default' | 'secondary' | 'outline' | 'destructive'; className?: string };
}) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {badge && (
            <Badge variant={badge.variant || 'secondary'} className={badge.className}>
              {badge.label}
            </Badge>
          )}
        </div>
        {description && (
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// ============================================================================
// DATA TABLE SHELL — Lightweight data display with custom scrollbar
// ============================================================================

export function DataTableShell({
  headers,
  rows,
  emptyMessage = 'No data available',
  maxHeight = 'max-h-96',
}: {
  headers: string[];
  rows: React.ReactNode[][];
  emptyMessage?: string;
  maxHeight?: string;
}) {
  return (
    <div className={cn('rounded-xl border border-border/60 overflow-hidden', maxHeight)}>
      <div className="overflow-x-auto overflow-y-auto max-h-full custom-scrollbar">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
            <tr className="border-b border-border/60">
              {headers.map((header, i) => (
                <th key={i} className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={headers.length} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className="border-b border-border/30 hover:bg-muted/30 transition-colors"
                >
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-3 py-2.5 text-xs whitespace-nowrap">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// PROGRESS INDICATOR — Horizontal progress bar with label
// ============================================================================

export function ProgressIndicator({
  value,
  max = 100,
  label,
  showPercent = true,
  color = 'emerald',
  size = 'md',
}: {
  value: number;
  max?: number;
  label?: string;
  showPercent?: boolean;
  color?: 'emerald' | 'amber' | 'red' | 'sky' | 'violet' | 'slate';
  size?: 'sm' | 'md' | 'lg';
}) {
  const percent = Math.min(100, Math.max(0, (value / max) * 100));
  const barColors = {
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
    sky: 'bg-sky-500',
    violet: 'bg-violet-500',
    slate: 'bg-slate-500',
  };
  const barHeights = { sm: 'h-1.5', md: 'h-2', lg: 'h-3' };

  return (
    <div className="w-full">
      {(label || showPercent) && (
        <div className="flex items-center justify-between mb-1">
          {label && <span className="text-xs text-muted-foreground">{label}</span>}
          {showPercent && <span className="text-xs font-medium">{Math.round(percent)}%</span>}
        </div>
      )}
      <div className={cn('w-full rounded-full bg-muted overflow-hidden', barHeights[size])}>
        <div
          className={cn('rounded-full transition-all duration-500', barColors[color])}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// TAB BAR — Simple tab component
// ============================================================================

export function TabBar({
  tabs,
  activeTab,
  onChange,
  className,
}: {
  tabs: Array<{ id: string; label: string; icon?: React.ElementType; count?: number }>;
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-1 border-b border-border/60', className)}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-all border-b-2 -mb-px',
              isActive
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            )}
          >
            {tab.icon && <tab.icon className="h-3.5 w-3.5" />}
            {tab.label}
            {tab.count !== undefined && (
              <Badge variant="secondary" className="text-[9px] h-4 px-1 min-w-[16px] flex items-center justify-center">
                {tab.count}
              </Badge>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// SKELETON GRID — Reusable skeleton loader
// ============================================================================

export function SkeletonGrid({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border/60 p-4 space-y-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-20 w-full rounded-lg" />
          <div className="flex justify-between">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// TIMESTAMP — Relative time display with tooltip
// ============================================================================

export function Timestamp({ date, format = 'relative' }: { date: string; format?: 'relative' | 'short' | 'full' }) {
  const d = new Date(date);
  
  if (format === 'short') {
    return <span className="text-xs text-muted-foreground">{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>;
  }

  if (format === 'full') {
    return <span className="text-xs text-muted-foreground">{d.toLocaleString()}</span>;
  }

  // Relative
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  let relative: string;
  if (diffMin < 1) relative = 'Just now';
  else if (diffMin < 60) relative = `${diffMin}m ago`;
  else if (diffHour < 24) relative = `${diffHour}h ago`;
  else if (diffDay < 7) relative = `${diffDay}d ago`;
  else relative = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <span className="text-xs text-muted-foreground" title={d.toLocaleString()}>
      {relative}
    </span>
  );
}
