import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Visual Explorer diagram pan/zoom contract', () => {
  it('makes the diagram viewport draggable, keyboard pannable, and connected to zoom controls', () => {
    const source = fs.readFileSync('src/components/digital-twin/MachineVisualExplorer.tsx', 'utf8');

    expect(source).toContain('aria-label="Interactive machine component engineering schematic"');
    expect(source).toContain("cursor-grabbing");
    expect(source).toContain("setPointerCapture");
    expect(source).toContain("viewport.scrollLeft");
    expect(source).toContain("viewport.scrollTop");
    expect(source).toContain("ArrowRight");
    expect(source).toContain("Ctrl/⌘ + wheel to zoom");
    expect(source).toContain("zoom={zoom} onZoomChange={setZoom}");
    expect(source).toContain("transform: 'scale(' + zoom + ')'");
  });
});
