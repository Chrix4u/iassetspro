import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('resource action visibility and custody contract', () => {
  it('shows supervisor approval only to accountable maintenance leadership', () => {
    const ui = read('src/components/modules/RepairsPagesLegacy.tsx');
    const start = ui.indexOf('function canApproveAsSupervisor');
    const end = ui.indexOf('function canOperateToolCustody', start);
    const helper = ui.slice(start, end);

    expect(helper).toContain("maintenance_manager");
    expect(helper).toContain("plant_manager");
    expect(helper).toContain("maintenance_supervisor");
    expect(helper).toContain('assignedSupervisorId === currentUserId');
    expect(helper).not.toContain('maintenance_planner');
    expect(helper).not.toContain("hasPermission('repair_material_requests.update')");
    expect(ui).toContain('canApproveAsSupervisor(r, user)');
    expect(ui).toContain('canApproveAsSupervisor(detailItem, user)');
  });

  it('returns assigned supervisor identity with material and tool lists', () => {
    expect(read('src/app/api/repairs/material-requests/route.ts')).toContain('assignedSupervisorId: true');
    expect(read('src/app/api/repairs/tool-requests/route.ts')).toContain('assignedSupervisorId: true');
  });

  it('restricts tool return and transfer to the actual custodian', () => {
    const toolRoute = read('src/app/api/repairs/tool-requests/[id]/route.ts');
    const transferRoute = read('src/app/api/repairs/tool-transfers/route.ts');
    const ui = read('src/components/modules/RepairsPagesLegacy.tsx');

    expect(toolRoute).toContain("action === 'return'");
    expect(toolRoute).toContain('toolReq.requestedById !== session.userId');
    expect(transferRoute).toContain('fromUserId !== session.userId');
    expect(transferRoute).toContain('Only the current custodian can initiate a tool transfer');
    expect(ui).toContain('canOperateToolCustody(r, user)');
    expect(ui).toContain('canOperateToolCustody(detailItem, user)');
    expect(ui).toContain("hasPermission('repair_tool_transfers.create')");
  });
});
