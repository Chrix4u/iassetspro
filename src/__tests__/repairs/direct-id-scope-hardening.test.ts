import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('RWOP direct-id scope hardening', () => {
  const transferDetail = read('src/app/api/repairs/tool-transfers/[id]/route.ts');
  const transferList = read('src/app/api/repairs/tool-transfers/route.ts');
  const damagedDetail = read('src/app/api/repairs/damaged-tools/[id]/route.ts');
  const damagedList = read('src/app/api/repairs/damaged-tools/route.ts');
  const spareDetail = read('src/app/api/repairs/spare-part-returns/[id]/route.ts');
  const spareList = read('src/app/api/repairs/spare-part-returns/route.ts');

  it('keeps tool-transfer detail reads aligned with list permissions and custody ownership', () => {
    expect(transferList).toContain("'repair_tool_transfers.view_own'");
    expect(transferDetail).toContain("'repair_tool_transfers.view'");
    expect(transferDetail).toContain("'repair_tool_transfers.view_all'");
    expect(transferDetail).toContain("'repair_tool_transfers.view_own'");
    expect(transferDetail).toContain("hasPermission(session, 'repair_tool_transfers.view_own')");
    expect(transferDetail).toContain('transfer.fromUserId === session.userId');
    expect(transferDetail).toContain('transfer.toUserId === session.userId');
    expect(transferDetail).toContain('transfer.requestedById === session.userId');
    expect(transferDetail).toContain('this transfer is outside your custody scope');
  });

  it('keeps damaged-tool detail reads inside the same role/owner boundary as the list', () => {
    expect(damagedList).toContain('where.reportedById = session.userId');
    expect(damagedDetail).toContain('canViewAllDamageReports');
    expect(damagedDetail).toContain('report.reportedById !== session.userId');
    expect(damagedDetail).toContain('this damaged tool report is outside your scope');
  });

  it('protects damaged-tool writes by actor and plant scope', () => {
    expect(damagedDetail).toContain('canEditDamageReport');
    expect(damagedDetail).toContain('existing.reportedById !== session.userId');
    expect(damagedDetail).toContain('You can only update your own damaged tool reports');
    expect(damagedDetail).toContain('const actionPlantScope = await getPlantScope(request, session)');
    expect(damagedDetail).toContain('canAccessPlantStrict(actionPlantScope, existing.workOrder?.plantId)');
    expect(damagedDetail).toContain('plantId: true');
  });

  it('keeps spare-part detail and edits within list ownership and plant boundaries', () => {
    expect(spareList).toContain('where.requestedById = session.userId');
    expect(spareDetail).toContain('canViewAllReturns');
    expect(spareDetail).toContain('sparePartReturn.requestedById !== session.userId');
    expect(spareDetail).toContain('this spare part return is outside your scope');
    expect(spareDetail).toContain('const recordPlantId = existing.plantId || existing.workOrder?.plantId');
    expect(spareDetail).toContain('canAccessPlantStrict(plantScope, recordPlantId)');
  });
});
