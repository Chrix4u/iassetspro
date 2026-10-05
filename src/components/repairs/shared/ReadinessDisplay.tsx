'use client';

import React from 'react';
import { AlertTriangle, AlertCircle, Users, Wrench, Package, Timer, ShieldCheck, Camera, type LucideIcon } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReadinessItem {
  code: string;
  category: string;
  message: string;
  severity: 'blocker' | 'warning';
}

interface ReadinessDisplayProps {
  blockers: ReadinessItem[];
  warnings: ReadinessItem[];
  hideWarnings?: boolean;
}

// ---------------------------------------------------------------------------
// Category → icon mapping
// ---------------------------------------------------------------------------

const CATEGORY_ICON: Record<string, LucideIcon> = {
  team: Users,
  tool: Wrench,
  material: Package,
  timer: Timer,
  safety: ShieldCheck,
  evidence: Camera,
};

function getCategoryIcon(category: string): LucideIcon {
  return CATEGORY_ICON[category] || AlertCircle;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReadinessDisplay({ blockers, warnings, hideWarnings = false }: ReadinessDisplayProps) {
  if (blockers.length === 0 && (hideWarnings || warnings.length === 0)) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Blockers */}
      {blockers.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <h3 className="text-sm font-semibold text-red-800">
              Blockers ({blockers.length})
            </h3>
            <span className="text-xs text-red-600 bg-red-100 px-2 py-0.5 rounded-full font-medium">
              Must resolve before proceeding
            </span>
          </div>
          <ul className="space-y-2">
            {blockers.map((b, i) => {
              const CatIcon = getCategoryIcon(b.category);
              return (
                <li key={`${b.code}-${i}`} className="flex items-start gap-2.5">
                  <CatIcon className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-red-800">{b.message}</p>
                    <p className="text-[11px] text-red-500 mt-0.5">{b.code} · {b.category}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Warnings */}
      {!hideWarnings && warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-amber-800">
              Warnings ({warnings.length})
            </h3>
            <span className="text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full font-medium">
              Informational — does not block
            </span>
          </div>
          <ul className="space-y-2">
            {warnings.map((w, i) => {
              const CatIcon = getCategoryIcon(w.category);
              return (
                <li key={`${w.code}-${i}`} className="flex items-start gap-2.5">
                  <CatIcon className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-amber-800">{w.message}</p>
                    <p className="text-[11px] text-amber-500 mt-0.5">{w.code} · {w.category}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
