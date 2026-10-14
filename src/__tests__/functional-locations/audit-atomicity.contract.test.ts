import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const service = read('src/lib/functional-location/service.ts');
const locationsRoute = read('src/app/api/functional-locations/route.ts');
const moveRoute = read('src/app/api/functional-locations/[id]/move/route.ts');
const systemsRoute = read('src/app/api/hierarchy-systems/route.ts');

describe('functional-location audit atomicity', () => {
  it('creates a functional location and its audit record in the same transaction', () => {
    const createStart = service.indexOf('export async function createFunctionalLocation');
    const createEnd = service.indexOf('function descendantIdsFor');
    const createSource = service.slice(createStart, createEnd);

    expect(createSource).toContain('db.$transaction');
    expect(createSource).toContain('tx.functionalLocation.create');
    expect(createSource).toContain('tx.auditLog.create');
    expect(locationsRoute).not.toContain('await db.auditLog.create');
  });

  it('moves a functional location and writes its audit record inside the existing move transaction', () => {
    const moveStart = service.indexOf('export async function moveFunctionalLocation');
    const moveEnd = service.indexOf('export async function getFunctionalLocationPath');
    const moveSource = service.slice(moveStart, moveEnd);

    expect(moveSource).toContain('db.$transaction');
    expect(moveSource).toContain('tx.functionalLocation.update');
    expect(moveSource).toContain('tx.auditLog.create');
    expect(moveRoute).not.toContain('await db.auditLog.create');
  });

  it('creates hierarchy systems, switches primary state, and audits configuration atomically', () => {
    const postStart = systemsRoute.indexOf('export async function POST');
    const postSource = systemsRoute.slice(postStart);

    expect(postSource).toContain('db.$transaction');
    expect(postSource).toContain('tx.hierarchySystem.create');
    expect(postSource).toContain('tx.hierarchySystem.updateMany');
    expect(postSource).toContain('tx.auditLog.create');
    expect(postSource).not.toContain('setPrimaryHierarchySystem(');
  });
});
