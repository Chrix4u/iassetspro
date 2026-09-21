import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) =>
  fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('technician resource cancellation confirmation', () => {
  it('requires a destructive confirmation before pending material/tool cancellation', () => {
    const panel = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');

    expect(panel).toContain("import { ConfirmDialog } from '@/components/shared/ConfirmDialog'");
    expect(panel).toContain('cancelRequestTarget');
    expect(panel).toContain('requestMaterialCancellation(request)');
    expect(panel).toContain('requestToolCancellation(request)');
    expect(panel).toContain('confirmRequestCancellation');
    expect(panel).toContain('title={cancelRequestTarget?.kind');
    expect(panel).toContain('confirmLabel="Cancel Request"');
    expect(panel).toContain('variant="destructive"');
    expect(panel).toContain("busy?.startsWith('cancel-')");
  });

  it('keeps the actual DELETE calls behind the confirmation handler', () => {
    const panel = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');

    expect(panel).toContain("kind === 'material'");
    expect(panel).toContain('/api/repairs/material-requests/${id}');
    expect(panel).toContain('/api/repairs/tool-requests/${id}');
    expect(panel).not.toContain('cancelMaterialRequest(request.id)');
    expect(panel).not.toContain('cancelToolRequest(request.id)');
  });
});
