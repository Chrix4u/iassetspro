import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(process.cwd(), 'src/components/modules/MaintenancePages.tsx'), 'utf8');
const technicianSource = fs.readFileSync(path.join(process.cwd(), 'src/components/modules/TechnicianWorkOrderPage.tsx'), 'utf8');

describe('PM checklist action accessibility', () => {
  it('keeps compact checklist actions accessible when visible text is hidden', () => {
    expect(source).toContain('aria-label="Start task"');
    expect(source).toContain('aria-label="Task notes"');
    expect(source).toContain('aria-label="Done"');
    expect(source).toContain('aria-label="Skip task"');
    expect(source).toContain('aria-label="Undo task"');
  });

  it('gives the dedicated technician checklist an accessible done/undo control', () => {
    expect(technicianSource).toContain("aria-label={task.status === 'completed' ? 'Undo task' : 'Done'}");
  });
});
