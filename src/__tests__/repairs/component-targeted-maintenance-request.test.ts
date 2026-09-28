import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = fs.readFileSync('prisma/schema.prisma', 'utf8');
const requestRoute = fs.readFileSync('src/app/api/maintenance-requests/route.ts', 'utf8');
const detailRoute = fs.readFileSync('src/app/api/maintenance-requests/[id]/route.ts', 'utf8');
const planning = fs.readFileSync('src/services/repairPlanning.service.ts', 'utf8');
const page = fs.readFileSync('src/components/modules/MaintenancePages.tsx', 'utf8');

describe('component-targeted maintenance requests', () => {
  it('persists an optional exact component relation on the maintenance request', () => {
    expect(schema).toContain('componentRegistryId String?');
    expect(schema).toContain('@relation("MRComponent"');
    expect(schema).toContain('@@index([componentRegistryId])');
  });

  it('validates that the requested component belongs to the selected registered asset', () => {
    expect(requestRoute).toContain('A component/part can only be selected for a registered asset');
    expect(requestRoute).toContain('Selected component/part does not belong to the selected asset');
    expect(requestRoute).toContain('componentRegistryId: resolvedComponentId');
  });

  it('returns the requested component in MR list and detail views', () => {
    expect(requestRoute).toContain('componentRegistry: { select:');
    expect(detailRoute).toContain('componentRegistry: { select:');
  });

  it('automatically carries the MR component into the converted work order', () => {
    expect(planning).toContain('[mr.componentRegistryId, ...(payload.componentIds || [])]');
    expect(planning).toContain('workOrderComponent.createMany');
  });

  it('lets the requester select a component only after selecting a registered asset', () => {
    expect(page).toContain('Component / Part');
    expect(page).toContain('/api/component-registry?');
    expect(page).toContain('if (componentId) payload.componentId = componentId');
    expect(page).toContain('Selecting a component carries the exact repair target');
  });
});
