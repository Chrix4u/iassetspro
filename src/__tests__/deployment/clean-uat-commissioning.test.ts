import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const deploy = fs.readFileSync('scripts/deploy-production-artifact-core.sh', 'utf8');
const commission = fs.readFileSync('scripts/commission-clean-uat.ts', 'utf8');

describe('one-time clean UAT commissioning', () => {
  it('runs only when users exist and there are no plants yet', () => {
    expect(deploy).toContain('PLANT_COUNT=');
    expect(deploy).toContain('if [[ "$USER_COUNT" != "0" && "$PLANT_COUNT" == "0" ]]');
    expect(deploy).toContain('scripts/commission-clean-uat.ts');
  });

  it('creates only organizational baseline data', () => {
    expect(commission).toContain("code: PLANT_CODE");
    expect(commission).toContain("db.department.create");
    expect(commission).toContain("db.userPlant.upsert");
    expect(commission).not.toContain("db.asset.create");
    expect(commission).not.toContain("db.inventoryItem.create");
    expect(commission).not.toContain("db.workOrder.create");
  });

  it('keeps the commissioning script idempotent after the first plant exists', () => {
    expect(commission).toContain('if (plantCount > 0)');
    expect(commission).toContain('Commissioning skipped');
  });
});
