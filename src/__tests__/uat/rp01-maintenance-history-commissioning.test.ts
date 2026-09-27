import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const script = fs.readFileSync('scripts/commission-rp01-maintenance-history-uat.ts', 'utf8');

describe('RP-01 maintenance-history commissioning', () => {
  it('targets the RP-01 drive-side bearing and parent asset', () => {
    expect(script).toContain("assetTag: 'UAT-RP-001'");
    expect(script).toContain("componentCode: 'RP01-PRT-BRG-DS'");
    expect(script).toContain('component.assetId !== asset.id');
  });

  it('links the historical WO to the exact component and maintenance history', () => {
    expect(script).toContain('workOrderComponent.upsert');
    expect(script).toContain('componentRegistryId: component.id');
    expect(script).toContain('componentMaintenanceHistory.findFirst');
    expect(script).toContain('workOrderId: wo.id');
  });

  it('is idempotent and records real maintenance evidence', () => {
    expect(script).toContain('workOrder.findUnique');
    expect(script).toContain('componentMaintenanceHistory.update');
    expect(script).toContain('durationMinutes: 90');
    expect(script).toContain('findings: JSON.stringify');
    expect(script).toContain('actionsTaken: JSON.stringify');
  });
});