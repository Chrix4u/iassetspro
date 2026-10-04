import fs from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import '@/instrumentation-client';

const explorer = fs.readFileSync('src/components/digital-twin/MachineVisualExplorer.tsx', 'utf8');
const instrumentation = fs.readFileSync('src/instrumentation-client.ts', 'utf8');

afterEach(() => {
  document.body.innerHTML = '';
});

describe('visual explorer diagram click selection', () => {
  it('keeps selectable SVG nodes on the existing component selection path', () => {
    expect(explorer).toContain('aria-label="Machine component engineering schematic"');
    expect(explorer).toContain('onClick={() => onSelect(component.id)}');
    expect(explorer).toContain('onClick={() => onSelect(null)}');
  });

  it('prevents node pointerdown from reaching the pan container while preserving its click', () => {
    document.body.innerHTML = `
      <div id="pan-container">
        <svg aria-label="Machine component engineering schematic">
          <g id="component-node" class="cursor-pointer">
            <rect id="component-hit-area" width="100" height="40"></rect>
          </g>
        </svg>
      </div>
    `;

    const panContainer = document.getElementById('pan-container')!;
    const componentNode = document.getElementById('component-node')!;
    const hitArea = document.getElementById('component-hit-area')!;
    let panStarts = 0;
    let selections = 0;

    panContainer.addEventListener('pointerdown', () => { panStarts += 1; });
    componentNode.addEventListener('click', () => { selections += 1; });

    hitArea.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    hitArea.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));

    expect(panStarts).toBe(0);
    expect(selections).toBe(1);
  });

  it('still lets background pointerdown reach the drag-to-pan container', () => {
    document.body.innerHTML = `
      <div id="pan-container">
        <svg id="diagram-background" aria-label="Machine component engineering schematic"></svg>
      </div>
    `;

    const panContainer = document.getElementById('pan-container')!;
    const background = document.getElementById('diagram-background')!;
    let panStarts = 0;
    panContainer.addEventListener('pointerdown', () => { panStarts += 1; });

    background.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));

    expect(panStarts).toBe(1);
  });

  it('leaves the background pan implementation intact', () => {
    expect(instrumentation).toContain('Machine component engineering schematic');
    expect(instrumentation).toContain('g.cursor-pointer');
    expect(explorer).toContain('setPointerCapture');
    expect(explorer).toContain('cursor-grab active:cursor-grabbing touch-none');
    expect(explorer).toContain('translate(${pan.x}px, ${pan.y}px) scale(${zoom})');
  });
});
