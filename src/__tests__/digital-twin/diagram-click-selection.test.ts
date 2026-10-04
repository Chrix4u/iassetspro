import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const explorer = fs.readFileSync('src/components/digital-twin/MachineVisualExplorer.tsx', 'utf8');
const instrumentation = fs.readFileSync('src/instrumentation-client.ts', 'utf8');

describe('visual explorer diagram click selection', () => {
  it('keeps selectable SVG nodes on the existing component selection path', () => {
    expect(explorer).toContain('aria-label="Machine component engineering schematic"');
    expect(explorer).toContain('onClick={() => onSelect(component.id)}');
    expect(explorer).toContain('onClick={() => onSelect(null)}');
  });

  it('prevents diagram node pointerdown from being captured by drag-to-pan', () => {
    expect(instrumentation).toContain('Machine component engineering schematic');
    expect(instrumentation).toContain('g.cursor-pointer');
    expect(instrumentation).toContain("document.addEventListener(\n  'pointerdown'");
    expect(instrumentation).toContain('event.stopPropagation()');
    expect(instrumentation).toContain('true,');
  });

  it('leaves the background pan implementation intact', () => {
    expect(explorer).toContain('setPointerCapture');
    expect(explorer).toContain('cursor-grab active:cursor-grabbing touch-none');
    expect(explorer).toContain('translate(${pan.x}px, ${pan.y}px) scale(${zoom})');
  });
});
