import { describe, expect, it } from 'vitest';
import { buildSchematicLevels } from '@/lib/machine-schematic-levels';

describe('machine engineering schematic levels', () => {
  it('retains all nested part/sub-part levels beyond the old eight-level cutoff', () => {
    const hierarchy = Array.from({ length: 14 }, (_, index) => ({
      id: 'level-' + index,
      parentId: index ? 'level-' + (index - 1) : null,
    }));
    const levels = buildSchematicLevels(hierarchy);
    expect(levels).toHaveLength(14);
    expect(levels.map((level) => level.map((node) => node.id))).toEqual(
      hierarchy.map((node) => [node.id]),
    );
  });

  it('preserves stable sibling ordering and displays parts with missing parents', () => {
    const levels = buildSchematicLevels([
      { id: 'root', parentId: null },
      { id: 'orphan', parentId: 'unknown' },
      { id: 'right', parentId: 'root' },
      { id: 'left', parentId: 'root' },
      { id: 'leaf', parentId: 'right' },
    ]);
    expect(levels.map((level) => level.map((node) => node.id))).toEqual([
      ['root', 'orphan'], ['right', 'left'], ['leaf'],
    ]);
  });

  it('does not display duplicate component IDs twice at the same level', () => {
    const levels = buildSchematicLevels([
      { id: 'a', parentId: null },
      { id: 'a', parentId: null },
      { id: 'b', parentId: 'a' },
    ]);
    expect(levels.map((level) => level.map((node) => node.id))).toEqual([['a'], ['b']]);
  });

  it('does not loop or fabricate a hierarchy for disconnected parent cycles', () => {
    const levels = buildSchematicLevels([
      { id: 'root', parentId: null },
      { id: 'child', parentId: 'root' },
      { id: 'loop-a', parentId: 'loop-b' },
      { id: 'loop-b', parentId: 'loop-a' },
    ]);
    expect(levels.map((level) => level.map((node) => node.id))).toEqual([
      ['root'], ['child'],
    ]);
    expect(buildSchematicLevels([{ id: 'self', parentId: 'self' }])).toEqual([]);
    expect(buildSchematicLevels([])).toEqual([]);
  });
});
