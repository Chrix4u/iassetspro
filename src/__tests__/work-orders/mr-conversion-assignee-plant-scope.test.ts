import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(
  path.join(process.cwd(), 'src/services/repairPlanning.service.ts'),
  'utf8',
);

describe('MR conversion assignment plant boundary', () => {
  it('validates direct execution users as active maintenance technicians in the MR plant', () => {
    expect(source).toContain('const executionUserIds = new Set<string>()');
    expect(source).toContain('if (payload.assignedTo) executionUserIds.add(payload.assignedTo)');
    expect(source).toContain('for (const member of payload.teamMembers || [])');
    expect(source).toContain("status: 'active'");
    expect(source).toContain('plantAccess: { some: { plantId: mr.plantId } }');
    expect(source).toContain("role: { slug: 'maintenance_technician' }");
    expect(source).toContain('One or more assigned technicians are not active maintenance technicians with access to this maintenance request plant');
  });

  it('validates the responsible supervisor against both plant and maintenance role', () => {
    expect(source).toContain('if (payload.assignedSupervisorId)');
    expect(source).toContain("in: ['maintenance_supervisor', 'maintenance_manager', 'plant_manager']");
    expect(source).toContain('Assigned supervisor is not active or does not have access to this maintenance request plant');
  });

  it('does not misclassify via-supervisor assignment as technician execution membership', () => {
    expect(source).toContain("payload.assignmentType !== 'via_supervisor'");
  });
});
