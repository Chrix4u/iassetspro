import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('technician sticky lifecycle navigation V1.2', () => {
  it('portals lifecycle quick navigation into the existing sticky work-order header', () => {
    const panel = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');

    expect(panel).toContain("import { createPortal } from 'react-dom';");
    expect(panel).toContain("document.querySelector('div.sticky.top-0.z-20')");
    expect(panel).toContain('Sticky work order lifecycle navigation');
    expect(panel).toContain('createPortal(');
    expect(panel).toContain('stickyHeaderTarget');
  });

  it('keeps the sticky navigation compact instead of creating a second sticky row', () => {
    const panel = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');

    expect(panel).toContain('absolute left-1/2 top-1/2');
    expect(panel).toContain('-translate-x-1/2 -translate-y-1/2');
    expect(panel).toContain('max-w-[48vw]');
    expect(panel).not.toContain('sticky top-');
  });

  it('retains all six lifecycle destinations and the original detailed progress overview', () => {
    const panel = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');

    for (const label of ['Assignment', 'Preparation', 'Execution', 'Resources', 'Evidence', 'Completion']) {
      expect(panel).toContain(`label: '${label}'`);
    }
    expect(panel).toContain('aria-label="Work order lifecycle"');
    expect(panel).toContain('scrollToStage(stage.anchor)');
    expect(panel).toContain('<span className="hidden xl:inline">{stage.label}</span>');
  });
});
