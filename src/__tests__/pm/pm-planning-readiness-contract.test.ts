import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const routePath = path.resolve(process.cwd(), 'src/app/api/work-orders/[id]/pm-planning-readiness/route.ts');
const uiPath = path.resolve(process.cwd(), 'src/components/modules/MaintenancePages.tsx');

describe('PM planning readiness integration contract', () => {
  it('exposes an authenticated work-order planning readiness endpoint', () => {
    expect(fs.existsSync(routePath), 'planning readiness route should exist').toBe(true);
    const source = fs.readFileSync(routePath, 'utf8');
    expect(source).toContain("buildPmPlanningReadiness");
    expect(source).toContain('authorizeWorkOrderExecutionAccess');
    expect(source).toContain('pmScheduleId');
    expect(source).toContain('taskExecutions');
    expect(source).toContain('requiredSkills');
    expect(source).toContain('requiredTools');
    expect(source).toContain('repairMaterialRequests');
    expect(source).toContain('repairToolRequests');
  });

  it('surfaces PM planning readiness and Repairs request coverage in the work-order detail UI', () => {
    const source = fs.readFileSync(uiPath, 'utf8');
    expect(source).toContain('/pm-planning-readiness');
    expect(source).toContain('PM Planning Readiness');
    expect(source).toContain('unresolvedPartLabels');
    expect(source).toContain('unresolvedToolLabels');
    expect(source).toContain('readyForPlanning');
    expect(source).toContain('requestCoverage');
    expect(source).toContain('Outstanding recommendations');
  });
});
