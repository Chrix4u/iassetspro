import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const collection = fs.readFileSync('src/app/api/pm-triggers/route.ts', 'utf8');
const direct = fs.readFileSync('src/app/api/pm-triggers/[id]/route.ts', 'utf8');
const evaluate = fs.readFileSync('src/app/api/pm-triggers/evaluate/route.ts', 'utf8');
const engine = fs.readFileSync('src/services/pm/meterTriggerEngine.ts', 'utf8');

describe('PM trigger plant and execution security contract', () => {
  it('scopes trigger list and creation through the owning schedule asset plant', () => {
    expect(collection).toContain('if (!plantScope.isSystemWide)');
    expect(collection).toContain('{ in: plantScope.accessiblePlantIds }');
    expect(collection).toContain('if (!canAccessPlantStrict(plantScope, schedule.asset.plantId))');
  });

  it('plant-scopes direct trigger GET, PUT and DELETE', () => {
    expect(direct.match(/const plantScope = await getPlantScope\(request, session\);/g)?.length).toBe(3);
    expect(direct.match(/canAccessPlantStrict\(plantScope, .*schedule\.asset\.plantId\)/g)?.length).toBe(3);
  });

  it('requires PM run authority for manual evaluation but preserves the cron-secret path', () => {
    expect(evaluate).toContain('const cronAuthorized = Boolean(CRON_SECRET && supplied === CRON_SECRET)');
    expect(evaluate).toContain("hasPermission(session, 'pm_schedules.run')");
    expect(evaluate).toContain('session && !cronAuthorized');
    expect(evaluate).toContain('plantScope.accessiblePlantIds');
  });

  it('passes the manual plant boundary into the meter engine query', () => {
    expect(engine).toContain('evaluateMeterPmTriggers(options: { plantIds?: string[]; actorId: string })');
    expect(engine).toContain("asset: { plantId: { in: options.plantIds } }");
  });
});
