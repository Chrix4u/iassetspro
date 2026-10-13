import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const servicePath = resolve(process.cwd(), 'src/lib/functional-location/service.ts');
const source = existsSync(servicePath) ? readFileSync(servicePath, 'utf8') : '';

describe('functional location service contract', () => {
  it('provides transactional primary-system switching', () => {
    expect(existsSync(servicePath), 'functional-location service must exist').toBe(true);
    expect(source).toContain('export async function setPrimaryHierarchySystem');
    expect(source).toContain('db.$transaction');
    expect(source).toContain('hierarchySystem.updateMany');
  });

  it('creates locations through the shared code and hierarchy policies', () => {
    expect(source).toContain('export async function createFunctionalLocation');
    expect(source).toContain('buildLocationCode');
    expect(source).toContain('validateLevelTransition');
    expect(source).toContain("error.code === 'P2002'");
  });

  it('guards moves against cycles and updates subtree depths transactionally', () => {
    expect(source).toContain('export async function moveFunctionalLocation');
    expect(source).toContain('assertNoHierarchyCycle');
    expect(source).toContain('functionalLocation.updateMany');
    expect(source).toContain('increment: depthDelta');
  });

  it('rejects global-to-plant moves that would silently change scope semantics', () => {
    expect(source).toContain('Global functional locations cannot be moved under plant-scoped parents');
  });

  it('revalidates immediate children when a moved node changes hierarchy level', () => {
    expect(source).toContain('const immediateChildren = systemNodes.filter');
    expect(source).toMatch(/immediateChildren[\s\S]*validateLevelTransition/);
  });

  it('does not silently rewrite Location Codes during a move', () => {
    const moveStart = source.indexOf('export async function moveFunctionalLocation');
    const pathStart = source.indexOf('export async function getFunctionalLocationPath');
    const moveSource = moveStart >= 0 ? source.slice(moveStart, pathStart > moveStart ? pathStart : undefined) : '';
    expect(moveSource).not.toMatch(/locationCode\s*:/);
  });

  it('provides bounded breadcrumb assembly with a cycle guard', () => {
    expect(source).toContain('export async function getFunctionalLocationPath');
    expect(source).toMatch(/visited/);
    expect(source).toMatch(/cycle/i);
  });
});
