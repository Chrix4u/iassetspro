import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const modulePath = resolve(process.cwd(), 'src/lib/functional-location/hierarchy-policy.ts');

async function loadPolicyModule() {
  expect(existsSync(modulePath), 'Hierarchy policy domain module must exist').toBe(true);
  if (!existsSync(modulePath)) return null;
  return import(pathToFileURL(modulePath).href);
}

const levels = [
  { hierarchySystemId: 'sys-a', order: 1, isRequired: true, isActive: true },
  { hierarchySystemId: 'sys-a', order: 2, isRequired: false, isActive: true },
  { hierarchySystemId: 'sys-a', order: 3, isRequired: true, isActive: true },
];

describe('functional location hierarchy policy', () => {
  it('allows a direct child level in the same hierarchy system', async () => {
    const mod = await loadPolicyModule();
    if (!mod) return;

    expect(() => mod.validateLevelTransition({
      hierarchySystemId: 'sys-a',
      parent: { hierarchySystemId: 'sys-a', order: 1 },
      target: { hierarchySystemId: 'sys-a', order: 2 },
      levels,
    })).not.toThrow();
  });

  it('allows skipping only optional active intermediate levels', async () => {
    const mod = await loadPolicyModule();
    if (!mod) return;

    expect(() => mod.validateLevelTransition({
      hierarchySystemId: 'sys-a',
      parent: { hierarchySystemId: 'sys-a', order: 1 },
      target: { hierarchySystemId: 'sys-a', order: 3 },
      levels,
    })).not.toThrow();
  });

  it('rejects skipping a required active intermediate level', async () => {
    const mod = await loadPolicyModule();
    if (!mod) return;

    const requiredLevels = levels.map((level) => level.order === 2 ? { ...level, isRequired: true } : level);
    expect(() => mod.validateLevelTransition({
      hierarchySystemId: 'sys-a',
      parent: { hierarchySystemId: 'sys-a', order: 1 },
      target: { hierarchySystemId: 'sys-a', order: 3 },
      levels: requiredLevels,
    })).toThrow(/required|level/i);
  });

  it('rejects roots that skip an earlier required level', async () => {
    const mod = await loadPolicyModule();
    if (!mod) return;

    expect(() => mod.validateLevelTransition({
      hierarchySystemId: 'sys-a',
      parent: null,
      target: { hierarchySystemId: 'sys-a', order: 3 },
      levels,
    })).toThrow(/required|level/i);
  });

  it('rejects cross-system parents', async () => {
    const mod = await loadPolicyModule();
    if (!mod) return;

    expect(() => mod.validateLevelTransition({
      hierarchySystemId: 'sys-a',
      parent: { hierarchySystemId: 'sys-b', order: 1 },
      target: { hierarchySystemId: 'sys-a', order: 2 },
      levels,
    })).toThrow(/system/i);
  });

  it('rejects self-parent and descendant-parent moves', async () => {
    const mod = await loadPolicyModule();
    if (!mod) return;

    expect(() => mod.assertNoHierarchyCycle({
      movingId: 'node-a',
      newParentId: 'node-a',
      descendantIds: [],
    })).toThrow(/cycle|itself|parent/i);

    expect(() => mod.assertNoHierarchyCycle({
      movingId: 'node-a',
      newParentId: 'node-c',
      descendantIds: ['node-b', 'node-c'],
    })).toThrow(/cycle|descendant/i);

    expect(() => mod.assertNoHierarchyCycle({
      movingId: 'node-a',
      newParentId: null,
      descendantIds: ['node-b'],
    })).not.toThrow();
  });
});
