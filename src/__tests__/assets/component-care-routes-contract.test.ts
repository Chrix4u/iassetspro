import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const condition = fs.readFileSync('src/app/api/component-registry/[id]/condition/route.ts', 'utf8');
const inspections = fs.readFileSync('src/app/api/component-registry/[id]/inspections/route.ts', 'utf8');
const lubrication = fs.readFileSync('src/app/api/component-registry/[id]/lubrication/route.ts', 'utf8');
const runtime = fs.readFileSync('src/app/api/component-registry/[id]/runtime/route.ts', 'utf8');

describe('component care route contracts', () => {
  it('enforces plant access before component care reads and writes', () => {
    for (const route of [condition, inspections, lubrication, runtime]) {
      expect(route).toContain("getComponentPlantAccess");
      expect(route).toContain("error: 'Plant access denied'");
    }
  });

  it('uses current inspection and lubrication Prisma relation/field names', () => {
    expect(inspections).toContain('records: {');
    expect(inspections).toContain('inspectorId: session.userId');
    expect(inspections).not.toContain('inspectionRecords: {');
    expect(inspections).not.toContain('inspectedBy:');
    expect(inspections).not.toContain('inspectionIntervalDays');

    expect(lubrication).toContain('records: {');
    expect(lubrication).toContain('performedById: session.userId');
    expect(lubrication).toContain('performedAt');
    expect(lubrication).not.toContain('lubricationRecords: {');
    expect(lubrication).not.toContain('lubricatedBy:');
    expect(lubrication).not.toContain('scheduleType');
    expect(lubrication).not.toContain('intervalDays');
  });

  it('derives condition alarms from current normal ranges with numeric quality', () => {
    expect(condition).toContain('parseNormalRange');
    expect(condition).toContain('minThreshold');
    expect(condition).toContain('maxThreshold');
    expect(condition).toContain('quality = Number.isFinite');
    expect(condition).toContain('recordedById: session.userId');
    expect(condition).not.toContain('alarmThreshold');
    expect(condition).not.toContain("quality || 'good'");
  });

  it('never writes nullable runtime units into a required schema field', () => {
    expect(runtime).toContain(": 'hours'");
    expect(runtime).toContain('value must be a finite number');
    expect(lubrication).toContain('operatingHoursAt must be a non-negative number');
    expect(runtime).not.toContain('unit: body.unit || null');
  });
});
