import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const route = fs.readFileSync('src/app/api/repairs/spare-part-returns/route.ts', 'utf8');
const custody = fs.readFileSync('src/services/materialCustody.service.ts', 'utf8');

describe('spare-part return data integrity', () => {
  it('inherits and validates component identity from the linked material request', () => {
    expect(custody).toContain('let authoritativeComponentId = input.componentId || null');
    expect(custody).toContain('material.componentRegistryId');
    expect(custody).toContain("throw new MaterialCustodyValidationError('Linked material request references a different component')");
    expect(custody).toContain('componentId: authoritativeComponentId');
  });

  it('persists refurbishment notes and estimated cost supplied when the return is created', () => {
    expect(route).toContain('refurbishmentNotes');
    expect(route).toContain('estimatedRefurbCost');
    expect(custody).toContain('refurbishmentNotes?: string | null');
    expect(custody).toContain('estimatedRefurbCost?: number | null');
    expect(custody).toContain('refurbishmentNotes: input.refurbishmentNotes || null');
    expect(custody).toContain('estimatedRefurbCost: input.estimatedRefurbCost ?? null');
  });
});
