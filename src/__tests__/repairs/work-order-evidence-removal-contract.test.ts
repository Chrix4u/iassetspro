import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('work-order evidence removal contract', () => {
  it('uses the nested attachment delete route and exposes a technician remove control', () => {
    const hook = fs.readFileSync(
      path.join(process.cwd(), 'src/components/repairs/execution/hooks/useWOAttachments.ts'),
      'utf8',
    );
    const workspace = fs.readFileSync(
      path.join(process.cwd(), 'src/components/repairs/execution/TechnicianWorkspace.tsx'),
      'utf8',
    );

    expect(hook).toContain('/attachments/${attachmentId}');
    expect(hook).not.toContain('attachments?id=');
    expect(workspace).toContain('remove: removeAttachment');
    expect(workspace).toContain('title="Remove attachment"');
    expect(workspace).toContain('removeAttachment(att.id)');
  });
});
