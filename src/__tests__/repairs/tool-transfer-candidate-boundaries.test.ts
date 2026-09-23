import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('tool-transfer candidate and custody boundaries', () => {
  const candidatesApi = read('src/app/api/repairs/tool-transfers/candidates/route.ts');
  const transfersApi = read('src/app/api/repairs/tool-transfers/route.ts');
  const transferService = read('src/services/toolTransfer.service.ts');
  const repairsUi = read('src/components/modules/RepairsPagesLegacy.tsx');
  const maintenanceUi = read('src/components/modules/MaintenancePages.tsx');
  const toolRequestsApi = read('src/app/api/repairs/tool-requests/route.ts');

  it('returns only active same-plant maintenance technicians for the current custodian', () => {
    expect(candidatesApi).toContain("hasPermission(session, 'repair_tool_transfers.create')");
    expect(candidatesApi).toContain('tool.assignedToId !== session.userId');
    expect(candidatesApi).toContain("status: 'active'");
    expect(candidatesApi).toContain('plantAccess: { some: { plantId: tool.plantId } }');
    expect(candidatesApi).toContain("role: { slug: 'maintenance_technician' }");
    expect(candidatesApi).toContain('id: { not: tool.assignedToId }');
  });

  it('derives the sender from live tool custody and validates the receiving technician', () => {
    expect(transfersApi).toContain('const effectiveFromUserId = tool.assignedToId');
    expect(transfersApi).toContain('proposedFromUserId && proposedFromUserId !== effectiveFromUserId');
    expect(transfersApi).toContain('effectiveFromUserId !== session.userId');
    expect(transfersApi).toContain("recipient.status !== 'active'");
    expect(transfersApi).toContain('recipient.plantAccess.length === 0');
    expect(transfersApi).toContain('recipient.userRoles.length === 0');
    expect(transfersApi).toContain("role: { slug: 'maintenance_technician' }");
  });

  it('rechecks recipient eligibility transactionally at request creation and handover completion', () => {
    expect(transferService).toContain('async function assertEligibleTransferRecipient');
    expect(transferService).toContain('await assertEligibleTransferRecipient(tx, input.toUserId, tool.plantId)');
    expect(transferService).toContain('await assertEligibleTransferRecipient(tx, transfer.toUserId, transfer.tool.plantId)');
    expect(transferService).toContain('Receiving technician does not have access to the tool plant');
    expect(transferService).toContain('Receiving user must be a maintenance technician');
  });

  it('notifies only store/tool attendants assigned to the tool plant', () => {
    expect(transfersApi).toContain('plantAccess: { some: { plantId: tool.plantId } }');
    expect(transfersApi).toContain("role: { slug: 'store_keeper' }");
    expect(transfersApi).toContain("role: { slug: 'tools_shop_attendant' }");
  });

  it('uses custody-scoped candidate lookup instead of the broad worker directory', () => {
    const maintenanceTransferStart = maintenanceUi.indexOf('title="Transfer Tool"');
    expect(maintenanceTransferStart).toBeGreaterThan(-1);
    const maintenanceTransferSurface = maintenanceUi.slice(
      maintenanceTransferStart,
      maintenanceTransferStart + 8_000,
    );

    const repairsTransferStart = repairsUi.indexOf('export function RepairToolTransfersPage');
    expect(repairsTransferStart).toBeGreaterThan(-1);
    const repairsTransferSurface = repairsUi.slice(
      repairsTransferStart,
      repairsTransferStart + 45_000,
    );

    expect(maintenanceTransferSurface).toContain('/api/repairs/tool-transfers/candidates?');
    expect(repairsTransferSurface).toContain('/api/repairs/tool-transfers/candidates?');
    expect(maintenanceTransferSurface).not.toContain("api.get('/api/workers?role=technician')");
    expect(repairsTransferSurface).not.toContain("api.get('/api/workers?role=technician')");
  });

  it('does not let the standalone transfer form select an arbitrary sender', () => {
    expect(repairsUi).toContain("useState({ toolId: '', toUserId: '', reason: '', notes: '' })");
    expect(repairsUi).toContain('Current custodian is determined from the selected tool');
    expect(repairsUi).not.toContain('<Label>From User *</Label>');
    expect(repairsUi).toContain('t.assignedToId === user?.id');
  });

  it('does not send a user-supplied sender from transfer dialogs', () => {
    const transferPostBlocks = [...repairsUi.matchAll(/api\.post\('\/api\/repairs\/tool-transfers',[\s\S]{0,350}?\}\);/g)]
      .map((match) => match[0]);
    expect(transferPostBlocks.length).toBeGreaterThan(0);
    expect(transferPostBlocks.every((block) => !block.includes('fromUserId'))).toBe(true);

    const maintenancePost = maintenanceUi.match(
      /api\.post\('\/api\/repairs\/tool-transfers',[\s\S]{0,350}?\}\);/
    )?.[0] || '';
    expect(maintenancePost).not.toContain('fromUserId');
  });

  it('captures return notes in both tool-return surfaces and sends them to the store-confirmed return API', () => {
    expect(repairsUi).toContain('<Label className="text-xs">Return Notes</Label>');
    expect(repairsUi).toContain("notes: f.notes?.trim() || undefined");
    expect(repairsUi).toContain("notes: item.notes?.trim() || undefined");
    expect(repairsUi).toContain("conditionAtReturn: r.condition, notes: r.notes");
    expect(repairsUi).toContain("pendingReturnNotes");
  });

  it('keeps generated/backfilled tool request numbers in TR-YYYYMM-NNNN format', () => {
    expect(toolRequestsApi).toContain('const prefix = `TR-${ym}-`;');
    expect(toolRequestsApi).toContain('const prefix = `${parts[0]}-${parts[1]}-`;');
    expect(toolRequestsApi).toContain('String(counter).padStart(4, \'0\')');
  });
});
