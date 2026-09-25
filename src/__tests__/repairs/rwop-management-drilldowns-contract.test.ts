import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const page = fs.readFileSync('src/components/repairs/reporting/RWOPReportingPage.tsx', 'utf8');

describe('RWOP management reporting drill-down contract', () => {
  it('persists and reapplies saved report views', () => {
    expect(page).toContain('iassetspro:rwop-report-saved-views');
    expect(page).toContain('saveCurrentView');
    expect(page).toContain('applySavedView');
    expect(page).toContain('Remove Saved View');
  });

  it('provides management attention filters backed by exception data', () => {
    expect(page).toContain("type AttentionFilter = 'all' | 'critical' | 'overdue'");
    expect(page).toContain("item.reasons.includes('Overdue')");
    expect(page).toContain('item.pendingMaterials > 0');
    expect(page).toContain('item.outstandingTools > 0');
    expect(page).toContain('item.pendingAssistance > 0');
    expect(page).toContain('item.pendingHandovers > 0');
    expect(page).toContain('item.downtimeMinutes >= 240');
  });

  it('lets managers jump from overdue KPI pressure to the exception watchlist', () => {
    expect(page).toContain("openAttentionView('overdue')");
    expect(page).toContain('attentionRef.current?.scrollIntoView');
    expect(page).toContain('Management Exception Watchlist');
  });

  it('provides closure and RCA exception drill-downs', () => {
    expect(page).toContain('closureExceptionWatchlist');
    expect(page).toContain("type ClosureFilter = 'all' | 'missing-rca' | 'supervisor' | 'planner' | 'rework'");
    expect(page).toContain('Closure / RCA Exception Queue');
    expect(page).toContain("setClosureFilter('missing-rca')");
    expect(page).toContain("setClosureFilter('rework')");
  });

  it('keeps direct work-order drill-down actions in exception and detail tables', () => {
    expect(page).toContain('href={`/work-orders/${item.id}`}');
    expect(page).toContain('href={`/work-orders/${wo.id}`}');
  });
});
