import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const technician = readFileSync(join(process.cwd(), 'src/components/repairs/execution/TechnicianWorkspace.tsx'), 'utf8');
const readiness = readFileSync(join(process.cwd(), 'src/components/repairs/shared/ReadinessDisplay.tsx'), 'utf8');

describe('Repairs Lucide icon contracts', () => {
  it('types TechnicianWorkspace icon props as LucideIcon', () => {
    expect(technician).toContain('type LucideIcon');
    expect(technician).toContain('icon?: LucideIcon;');
    expect(technician).toContain('icon: LucideIcon; label: string');
    expect(technician).toContain('title: string; icon: LucideIcon; warning?: boolean;');
    expect(technician).toContain('{ icon: LucideIcon; title: string; description: string }');
  });

  it('types readiness category icons as LucideIcon', () => {
    expect(readiness).toContain('type LucideIcon');
    expect(readiness).toContain('Record<string, LucideIcon>');
    expect(readiness).toContain('getCategoryIcon(category: string): LucideIcon');
  });

  it('does not keep generic React.ElementType icon contracts in these helpers', () => {
    expect(technician).not.toMatch(/icon\??: React\.ElementType/);
    expect(readiness).not.toContain('React.ElementType');
  });
});
