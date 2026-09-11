import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('technician work-order vertical slice contract', () => {
  it('separates assignment acknowledgement from execution start', () => {
    const schema = read('prisma/schema.prisma');
    const start = read('src/services/workOrderStartExecution.service.ts');
    const capability = read('src/app/api/work-orders/[id]/capabilities/route.ts');
    const assignment = read('src/app/api/work-orders/[id]/assignment-response/route.ts');
    expect(schema).toContain('assignmentResponseStatus String @default("pending")');
    expect(start).toContain("wo.assignmentResponseStatus !== 'accepted'");
    expect(capability).toContain('canAcceptAssignment');
    expect(capability).toContain('canDeclineAssignment');
    expect(assignment).toContain("response must be 'accepted' or 'declined'");
  });

  it('uses a dedicated full work-order workspace and canonical live-session endpoints', () => {
    const app = read('src/components/EAMApp.tsx');
    const page = read('src/components/modules/TechnicianWorkOrderPage.tsx');
    const maintenance = read('src/components/modules/MaintenancePages.tsx');
    expect(app).toContain("'wo-detail': () => import('./modules/TechnicianWorkOrderPage')");
    expect(maintenance).toContain('Open Work Order');
    expect(page).toContain('/assignment-response');
    expect(page).toContain('/pause-session');
    expect(page).toContain('/execution-state');
    expect(page).toContain('/execution-details');
    expect(page).toContain('failureDescription: failureDescription.trim()');
    expect(page).toContain('causeDescription: causeDescription.trim()');
    expect(page).toContain('actionDescription: actionDescription.trim()');
  });

  it('keeps assignment reset and schema migration explicit', () => {
    const assign = read('src/app/api/work-orders/[id]/assign/route.ts');
    const migration = read('prisma/migrations/20260911030000_technician_assignment_ack/migration.sql');
    expect(assign).toContain("assignmentResponseStatus: 'pending'");
    expect(assign).toContain('assignmentRespondedAt: null');
    expect(migration).toContain('ADD COLUMN `assignmentResponseStatus`');
    expect(migration).toContain("'in_progress', 'waiting_parts', 'waiting_tools'");
  });

  it('does not send live pause/resume through retrospective time-log creation', () => {
    const maintenance = read('src/components/modules/MaintenancePages.tsx');
    const quickStart = maintenance.indexOf('// Quick live-execution controls use canonical lifecycle/session endpoints.');
    const nextHandler = maintenance.indexOf('const handleAction = async', quickStart);
    const quickBlock = maintenance.slice(quickStart, nextHandler);
    expect(quickBlock).toContain('/pause-session');
    expect(quickBlock).toContain('/start');
    expect(quickBlock).not.toContain('/time-logs');
  });
});
