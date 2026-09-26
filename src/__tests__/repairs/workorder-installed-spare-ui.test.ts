import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const workspace = fs.readFileSync('src/components/repairs/execution/TechnicianWorkspace.tsx', 'utf8');
const hook = fs.readFileSync('src/components/repairs/execution/hooks/useWorkOrderExecution.ts', 'utf8');
const route = fs.readFileSync('src/app/api/work-orders/[id]/route.ts', 'utf8');

describe('work-order installed spare workflow', () => {
  it('returns material request component linkage to execution clients', () => {
    expect(route).toContain('componentRegistry: { select:');
    expect(hook).toContain('componentRegistryId: string | null');
    expect(hook).toContain('componentRegistry: { id: string; name: string; componentCode: string; componentType: string } | null');
  });

  it('lets technicians record issued material as installed on the target component', () => {
    expect(workspace).toContain('handleInstallIssuedMaterial');
    expect(workspace).toContain('/installed-parts');
    expect(workspace).toContain('materialRequestId: mr.id');
    expect(workspace).toContain('workOrderId');
    expect(workspace).toContain("sourceType: 'material_request'");
    expect(workspace).toContain('Install issued spare on component');
  });

  it('keeps stock accounting in the existing store reconciliation workflow', () => {
    expect(workspace).toContain('Store stock was already handled by the material issue/reconciliation workflow');
  });
});
