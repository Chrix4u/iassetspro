import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const explorer=readFileSync('src/components/digital-twin/MachineVisualExplorer.tsx','utf8');
const route=readFileSync('src/app/api/smart-anatomy/models/[id]/maintenance-trace/route.ts','utf8');

describe('existing digital twin to PM/work order trace review',()=>{
  it('exposes a working, controlled report download in the asset 3D explorer',()=>{
    expect(explorer).toContain('data-testid="smart-anatomy-maintenance-trace-export"');
    expect(explorer).toContain('onClick={() => void exportCadMaintenanceTrace()}');
    expect(explorer).toContain("'/maintenance-trace'");
    expect(explorer).toContain("JSON.stringify(result.data,null,2)");
    expect(explorer).toContain('disabled={exportingCadMaintenanceTrace}');
  });
  it('does not use client text matches to claim the source model or work orders are verified',()=>{
    expect(route).toContain('auditedGlbMeshPaths(bytes)');
    expect(route).toContain("timingSafeEqual(createHash('sha256')");
    expect(route).toContain("assetId:model.assetId");
    expect(route).toContain('component.assetId!==model.assetId');
    expect(route).toContain('sourcePaths.has(binding.meshPath)');
    expect(route).toContain("physicalMaintenanceProcedureApproved:false");
    expect(route).not.toContain('db.workOrder.create(');
    expect(route).not.toContain('db.pmSchedule.create(');
  });
});
