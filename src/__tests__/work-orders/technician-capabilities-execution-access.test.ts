import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) =>
  fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('technician capabilities exact-WO access', () => {
  it('uses the execution-aware WO authorization boundary', () => {
    const route = read('src/app/api/work-orders/[id]/capabilities/route.ts');

    expect(route).toContain('authorizeWorkOrderExecutionAccess(request, session, id)');
    expect(route).toContain('if (!access.ok) return access.response');
    expect(route).not.toContain('getPlantScope(request, session)');
    expect(route).not.toContain('canAccessPlantStrict(plantScope, wo.plantId)');
  });

  it('keeps read-only team rows out of execution membership', () => {
    const access = read('src/services/workOrderAccess.service.ts');

    expect(access).toContain("member.role !== 'handover_receiver'");
    expect(access).toContain("member.accessLevel !== 'read_only'");
  });
});
