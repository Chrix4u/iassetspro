import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('technician evidence removal contract', () => {
  it('shows a remove action only when the API grants delete capability', () => {
    const page = read('src/components/modules/TechnicianWorkOrderPage.tsx');

    expect(page).toContain('attachment.canDelete');
    expect(page).toContain("api.delete(`/api/work-orders/${id}/attachments/${attachment.id}`)");
    expect(page).toContain('<Trash2');
    expect(page).toContain('Evidence removed');
    expect(page).toContain('This cannot be undone.');
  });

  it('computes attachment delete capability from ownership and work-order authority', () => {
    const route = read('src/app/api/work-orders/[id]/attachments/route.ts');

    expect(route).toContain('attachment.uploadedById === session.userId && isWritableExecutionActor');
    expect(route).toContain("wo.status !== 'closed'");
    expect(route).toContain('canManageWorkOrder(session, wo)');
    expect(route).toContain('canDelete:');
  });

  it('deletes authorized evidence from the database and object storage with an audit trail', () => {
    const route = read('src/app/api/work-orders/[id]/attachments/[attachmentId]/route.ts');

    expect(route).toContain('export async function DELETE(');
    expect(route).toContain("attachment.uploadedById === session.userId");
    expect(route).toContain("work_orders.update");
    expect(route).toContain("await db.attachment.delete({ where: { id: attachment.id } })");
    expect(route).toContain('await ObjectStorageService.delete(attachment.filePath)');
    expect(route).toContain("createAuditLog(session.userId, 'WorkOrderAttachment', 'delete'");
    expect(route).toContain("wo.isLocked || wo.status === 'closed'");
  });
});
