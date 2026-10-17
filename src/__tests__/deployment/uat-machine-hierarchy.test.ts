import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const commission = fs.readFileSync('scripts/commission-uat-machine.ts', 'utf8');

describe('clean UAT machine hierarchy commissioning', () => {
  it('requires the commissioned Tema plant and skips if assets already exist', () => {
    expect(commission).toContain("PLANT_CODE = 'TEMA-UAT-01'");
    expect(commission).toContain('if (existingAssets > 0)');
    expect(commission).toContain('Machine commissioning skipped');
  });

  it('creates a real machine with the full required hierarchy depth', () => {
    expect(commission).toContain("type: 'assembly'");
    expect(commission).toContain("type: 'subassembly'");
    expect(commission).toContain("type: 'component'");
    expect(commission).toContain("type: 'part'");
    expect(commission).toContain("name: 'Plant Air Compressor 01'");
  });

  it('does not pre-seed inventory, work orders, tools or PM schedules', () => {
    expect(commission).not.toContain('db.inventoryItem.create');
    expect(commission).not.toContain('db.tool.create');
    expect(commission).not.toContain('db.workOrder.create');
    expect(commission).not.toContain('db.pmSchedule.create');
  });
});
