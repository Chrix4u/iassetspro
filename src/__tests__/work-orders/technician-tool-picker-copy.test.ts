import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('technician tool picker copy', () => {
  it('does not show the stale availability-pending label for planner tools', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/components/modules/TechnicianWorkOrderV11Panels.tsx'),
      'utf8',
    );
    expect(source).not.toContain('Availability pending');
    expect(source).toContain('Planner-recommended tools are shown first. Search or select any other available tool for this work order.');
  });
});
