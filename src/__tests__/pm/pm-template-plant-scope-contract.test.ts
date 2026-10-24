import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const collection = readFileSync('src/app/api/pm-templates/route.ts', 'utf8');
const direct = readFileSync('src/app/api/pm-templates/[id]/route.ts', 'utf8');
const snapshot = readFileSync('src/services/pm/scheduleTaskSnapshot.service.ts', 'utf8');
const scheduleCreate = readFileSync('src/app/api/pm-schedules/route.ts', 'utf8');
const scheduleDirect = readFileSync('src/app/api/pm-schedules/[id]/route.ts', 'utf8');
const aiGenerate = readFileSync('src/app/api/assets/ai-generate/route.ts', 'utf8');
const adoptionPath = 'src/app/api/pm-templates/[id]/assign-plant/route.ts';

describe('PM template plant scope contract', () => {
  it('scopes template listing to plant access while keeping schedule snapshots hidden', () => {
    expect(collection).toContain("from '@/lib/plant-scope'");
    expect(collection).toContain('getPlantScope(request, session)');
    expect(collection).toContain('getPlantFilterWhere(plantScope)');
    expect(collection).toContain('PM_SCHEDULE_SNAPSHOT_CATEGORY');
    expect(collection).toContain('includeUnassigned');
    expect(collection).toContain('isAdmin(session)');
  });

  it('requires an explicitly selected authorized plant for new templates and ignores body plant ownership', () => {
    expect(collection).toContain('if (plantScope.denyAccess)');
    expect(collection).toContain('if (!plantScope.plantId)');
    expect(collection).toContain("Select a plant before creating PM templates");
    expect(collection).toContain('plantId: plantScope.plantId');
    expect(collection).not.toMatch(/plantId:\s*body(?:\?|\.)/);
  });

  it('guards direct template reads and writes against cross-plant IDs', () => {
    expect(direct).toContain("from '@/lib/plant-scope'");
    expect(direct.match(/getPlantScope\(request, session\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(direct.match(/canAccessPlantStrict\(plantScope, (?:template|existing)\.plantId\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(direct).toContain("{ success: false, error: 'Access denied' }");
  });

  it('adds an admin-only audited adoption route for unowned legacy templates', () => {
    expect(existsSync(adoptionPath)).toBe(true);
    const adoption = readFileSync(adoptionPath, 'utf8');
    expect(adoption).toContain('if (!isAdmin(session))');
    expect(adoption).toContain('await db.$transaction(async (tx) =>');
    expect(adoption).toContain('lockPmTemplateLifecycle(tx, id)');
    expect(adoption).toContain('plantId: null');
    expect(adoption).toContain('asset: { select: { plantId: true } }');
    expect(adoption).toContain('schedulePlantIds');
    expect(adoption).toContain('conflicting plant ownership');
    expect(adoption).toContain("entityType: 'pm_template'");
    expect(adoption).toContain("action: 'update'");
  });

  it('assigns schedule-owned snapshot templates to the validated asset plant', () => {
    expect(snapshot).toContain('plantId: string;');
    expect(snapshot).toContain('plantId: input.plantId');
    expect(scheduleCreate).toContain('plantId: assetExists.plantId');
    expect(scheduleDirect).toContain('plantId: lockedSchedule.asset.plantId');
  });

  it('assigns AI-generated templates to the request plant', () => {
    const createStart = aiGenerate.indexOf('const pmTemplate = await db.pmTemplate.create');
    expect(createStart).toBeGreaterThanOrEqual(0);
    const createBlock = aiGenerate.slice(createStart, createStart + 900);
    expect(createBlock).toContain('plantId,');
  });
});
