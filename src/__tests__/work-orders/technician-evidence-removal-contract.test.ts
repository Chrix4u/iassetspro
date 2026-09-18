import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('technician evidence removal contract', () => {
  it('shows a technician-facing remove action for removable evidence', () => {
    const page = read('src/components/modules/TechnicianWorkOrderPage.tsx');

    expect(page).toContain('removeAttachment');
    expect(page).toContain('Remove evidence');
    expect(page).toContain('attachment.uploadedById === user?.id');
    expect(page).toContain("api.delete(\`/api/work-orders/\${id}/attachments/\${attachmentId}\`)");
  });

  it('protects evidence deletion with ownership, management, lock, and audit rules', () => {
    const route = read('src/app/api/work-orders/[id]/attachments/[attachmentId]/route.ts');

    expect(route).toContain('export async function DELETE');
    expect(route).toContain('attachment.uploadedById === session.userId');
    expect(route).toContain("hasPermission(session, 'work_orders.update')");
    expect(route).toContain("wo.isLocked || wo.status === 'closed'");
    expect(route).toContain("createAuditLog(session.userId, 'Attachment', 'delete'");
    expect(route).toContain('ObjectStorageService.delete(attachment.filePath)');
  });
});
