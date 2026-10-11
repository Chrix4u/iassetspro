import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Repairs UAT tool registration RBAC contract', () => {
  const baseSeed = fs.readFileSync(path.join(process.cwd(), 'scripts/seed-repairs-uat.ts'), 'utf8');
  const rbacSeed = fs.readFileSync(path.join(process.cwd(), 'scripts/seed-repairs-uat-rbac.ts'), 'utf8');
  const apiHelper = fs.readFileSync(path.join(process.cwd(), 'e2e/repairs/helpers/api.ts'), 'utf8');
  const scenario = fs.readFileSync(path.join(process.cwd(), 'e2e/repairs/scenario-ab-damaged-tool-repair-custody.spec.ts'), 'utf8');

  it('seeds a real tools shop attendant with plant-scoped registration custody', () => {
    expect(baseSeed).toContain("username: 'uat_tools_shop_attendant'");
    expect(baseSeed).toContain("roleSlugs: ['tools_shop_attendant']");
    expect(rbacSeed).toContain('tools_shop_attendant: [');
    expect(rbacSeed).toContain("'tools.view', 'tools.create', 'tools.update', 'tools.delete'");
    expect(rbacSeed).toContain("['tools_shop_attendant', 'tools.create']");
  });

  it('uses the tool-custody actor for UAT-27 registration instead of inventory manager', () => {
    expect(apiHelper).toContain("tools_shop_attendant: 'uat_tools_shop_attendant'");
    expect(scenario).toContain("const toolsToken = await getToken('tools_shop_attendant');");
    expect(scenario).toContain("apiCall(toolsToken, 'POST', '/api/tools'");
  });


  it('releases the UAT-27 technician execution session during teardown', () => {
    expect(scenario).toContain("`/api/work-orders/${woId}/pause-session`");
    expect(scenario).toContain("reason: 'UAT-27 test cleanup'");
  });
});
