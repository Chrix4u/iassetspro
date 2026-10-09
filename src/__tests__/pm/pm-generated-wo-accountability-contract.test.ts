import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('PM generated work-order accountability', () => {
  it('keeps generated WOs draft but assigns the schedule creator as accountable planner', () => {
    const route = read('src/app/api/pm-schedules/check-due/route.ts');

    expect(route).toContain("status: 'draft'");
    expect(route).toContain('assignedTo: schedule.assignedToId');
    expect(route).toContain('plannerId: schedule.createdById');
    expect(route).not.toContain('assignedBy: schedule.createdById');
  });

  it('uses the planner relationship as an allowed work-order assignment boundary', () => {
    const access = read('src/services/workOrderAccess.service.ts');
    expect(access).toContain('workOrder.plannerId === session.userId');
  });
});
