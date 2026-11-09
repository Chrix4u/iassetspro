import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const read=(value:string)=>fs.readFileSync(path.resolve(process.cwd(),value),'utf8');
describe('enterprise PM resource evidence and direct work order detail parity',()=>{
  it('loads PM readiness for direct task-linked WOs even without a legacy schedule container',()=>{
    const ui=read('src/components/modules/MaintenancePages.tsx');
    expect(ui).toContain("if (!wo?.id)");
    expect(ui).toContain("Boolean(pmPlanningReadiness)");
    expect(ui).not.toContain("if (!wo?.pmScheduleId) {");
    expect(ui).toContain('PmResourceLifecycleCard');
  });
  it('queries canonical Repairs quantities, not only approval labels',()=>{
    const route=read('src/app/api/work-orders/[id]/pm-planning-readiness/route.ts');
    expect(route).toContain('authorizeWorkOrderExecutionAccess');
    expect(route).toContain('quantityIssued: true');
    expect(route).toContain('stockReserved: true');
    expect(route).toContain('quantityIssued: item.quantityIssued');
    expect(route).toContain('identifyPmWorkOrderSource');
  });
  it('preserves no-auto-approval and distinguishing an issued stage from job-site readiness',()=>{
    const service=read('src/services/pm/planningReadiness.service.ts');
    const ui=read('src/components/modules/pm/PmResourceLifecycleCard.tsx');
    expect(service).toContain('summarizePmResourceLifecycle');
    expect(service).toContain('requestCoverage');
    expect(ui).toContain('not permission to execute');
    expect(ui).toContain('tool calibration');
    expect(ui).toContain('quantity-verified issued');
  });
});
