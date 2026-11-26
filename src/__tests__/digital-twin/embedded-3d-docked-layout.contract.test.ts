import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (file: string) => readFileSync('src/components/digital-twin/' + file + '.tsx', 'utf8');

describe('embedded asset 3D preview non-overlapping layout', () => {
  it('docks all three asset explorer model sources', () => {
    expect(read('MachineVisualExplorer').match(/showSceneTree\s+dockSceneTree/g)).toHaveLength(3);
  });
  it('places tree and canvas in independent responsive flex regions', () => {
    const viewer = read('DigitalTwinViewer');
    expect(viewer).toContain('flex-col-reverse @min-[640px]:flex-row');
    expect(viewer).toContain('data-testid="embedded-3d-tree-region"');
    expect(viewer).toContain('data-testid={dockSceneTree ? "embedded-3d-canvas-region" : undefined}');
    expect(viewer).toContain('h-[220px] min-h-0 w-full shrink-0');
    expect(viewer).toContain('@min-[640px]:w-[240px]');
    expect(viewer).toContain('@min-[640px]:w-11');
    expect(viewer).toContain('{!dockSceneTree && sceneTree}');
  });
  it('preserves expandable anatomy and keeps embedded toolbar within its pane', () => {
    const tree = read('SceneTreePanel');
    expect(tree).toContain('docked ? "relative h-full min-h-0 min-w-0 flex flex-col overflow-hidden"');
    expect(tree).toContain('aria-label="Expand CAD anatomy tree"');
    expect(tree).toContain('aria-label="Collapse CAD anatomy tree"');
    expect(tree).toContain('<ScrollArea className="min-h-0 flex-1">');
    expect(read('TwinToolbar')).toContain('inlineLayout ? "flex min-w-0 flex-wrap');
    expect(read('DigitalTwinViewer')).toContain('inlineLayout={dockSceneTree}');
  });
});
