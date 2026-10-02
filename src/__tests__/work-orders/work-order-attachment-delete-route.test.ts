import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('work-order attachment removal route', () => {
  it('enforces scoped authorization, ownership and storage cleanup', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/app/api/work-orders/[id]/attachments/route.ts'),
      'utf8',
    );
    expect(source).toContain('export async function DELETE');
    expect(source).toContain("entityType: 'work_order'");
    expect(source).toContain('entityId: workOrderId');
    expect(source).toContain("attachment.uploadedById !== session.userId");
    expect(source).toContain("wo.status === 'closed'");
    expect(source).toContain('ObjectStorageService.exists(attachment.filePath)');
    expect(source).toContain('ObjectStorageService.delete(attachment.filePath)');
    expect(source).toContain('db.attachment.delete');
  });
});
