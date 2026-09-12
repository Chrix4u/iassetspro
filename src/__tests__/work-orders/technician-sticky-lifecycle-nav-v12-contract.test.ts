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

  it('right-aligns the sticky navigation instead of centering it over the left-side content', () => {
    const panel = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');

    expect(panel).toContain('absolute right-3 top-1/2');
    expect(panel).toContain('-translate-y-1/2');
    expect(panel).toContain('justify-end xl:flex');
    expect(panel).toContain('ml-auto flex max-w-full items-center justify-end');
    expect(panel).not.toContain('left-1/2');
    expect(panel).not.toContain('-translate-x-1/2');
    expect(panel).not.toContain('max-w-[48vw]');
  });

  it('keeps one six-destination navigation and removes the old duplicate lifecycle row', () => {
    const panel = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');

    for (const label of ['Assignment', 'Preparation', 'Execution', 'Resources', 'Evidence', 'Completion']) {
      expect(panel).toContain(`label: '${label}'`);
    }
    expect(panel).toContain('scrollToStage(stage.anchor)');
    expect(panel).toContain('<span className="hidden xl:inline">{stage.label}</span>');
    expect(panel).not.toContain('aria-label="Work order lifecycle"');
    expect(panel).not.toContain('grid-cols-2 sm:grid-cols-3 xl:grid-cols-6');
    expect((panel.match(/stages\.map/g) || []).length).toBe(1);
  });
});
