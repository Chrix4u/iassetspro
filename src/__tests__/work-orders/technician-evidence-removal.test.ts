import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('technician evidence removal UI contract', () => {
  it('wires the secure attachment remove hook into each evidence row', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/components/repairs/execution/TechnicianWorkspace.tsx'),
      'utf8',
    );

    expect(source).toContain('remove: removeAttachment');
    expect(source).toContain('aria-label={\`Remove attachment \${att.fileName}\`}');
    expect(source).toContain('onClick={() => void removeAttachment(att.id)}');

    const hook = fs.readFileSync(
      path.join(process.cwd(), 'src/components/repairs/execution/hooks/useWOAttachments.ts'),
      'utf8',
    );
    expect(hook).toContain('attachments/${attachmentId}`');
    expect(hook).not.toContain('attachments?id=${attachmentId}`');
  });
});
