import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('planner technician competency evidence contract', () => {
  it('uses canonical trade matching and permission-gates competency evidence', () => {
    const workersRoute = read('src/app/api/workers/route.ts');
    expect(workersRoute).toContain("import { tradeValuesCompatible } from '@/services/technicianEligibility.service';");
    expect(workersRoute).toContain("const requiredTrade = searchParams.get('requiredTrade')?.trim() || null;");
    expect(workersRoute).toContain("'work_orders.assign_technician'");
    expect(workersRoute).toContain('if (requiredTrade && !canViewCompetency)');
    expect(workersRoute).toContain('tradeValuesCompatible(user.primaryTrade, requiredTrade)');
    expect(workersRoute).toContain("? 'certified'");
    expect(workersRoute).toContain(": 'not_certified'");
    expect(workersRoute).toContain("? 'not_recorded'");
  });

  it('shows advisory evidence without blocking worker selection', () => {
    const selector = read('src/components/shared/WorkerAssignmentSelector.tsx');
    expect(selector).toContain('requiredTrade?: string;');
    expect(selector).toContain("params.set('requiredTrade', requiredTrade.trim())");
    expect(selector).toContain('CompetencyEvidence worker={worker}');
    expect(selector).toContain('Trade mismatch: ${tradeLabel}');
    expect(selector).toContain('Certification not recorded');
    expect(selector).toContain('Competency indicators are advisory');
    expect(selector).not.toContain('disabled={!worker.competency?.tradeMatch}');
  });

  it('passes WO trade into create, conversion and edit assignment flows', () => {
    const maintenance = read('src/components/modules/MaintenancePages.tsx');
    expect(maintenance).toContain('requiredTrade={convertForm.tradeActivity}');
    expect(maintenance).toContain('requiredTrade={form.tradeActivity}');
    expect(maintenance).toContain('requiredTrade={editForm.tradeActivity}');
  });
});
