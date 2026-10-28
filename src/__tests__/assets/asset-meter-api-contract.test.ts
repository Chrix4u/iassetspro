import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');
function modelSource(name: string) {
  const start = schema.indexOf(`model ${name} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = schema.indexOf('\nmodel ', start + 1);
  return schema.slice(start, next === -1 ? undefined : next);
}

describe('asset meter API contract', () => {
  it('persists first-class meters owned by an asset and links readings/PM assignments by stable id', () => {
    const meter = modelSource('AssetMeter');
    expect(meter).toMatch(/\bassetId\s+String\b/);
    expect(meter).toMatch(/\bname\s+String\b/);
    expect(meter).toMatch(/\bunit\s+String\b/);
    expect(meter).toMatch(/\bcurrentValue\s+Float\b/);
    expect(meter).toContain('@@unique([assetId, name, unit])');
    expect(modelSource('MeterReading')).toMatch(/\bassetMeterId\s+String\?/);
    expect(modelSource('PmScheduleTask')).toMatch(/\bassetMeter\s+AssetMeter\?/);
  });

  it('exposes asset-scoped meter collection and item routes', () => {
    const collection = resolve(process.cwd(), 'src/app/api/assets/[id]/meters/route.ts');
    const item = resolve(process.cwd(), 'src/app/api/assets/[id]/meters/[meterId]/route.ts');
    expect(existsSync(collection)).toBe(true);
    expect(existsSync(item)).toBe(true);
    if (existsSync(collection)) {
      const source = readFileSync(collection, 'utf8');
      expect(source).toContain('export async function GET');
      expect(source).toContain('export async function POST');
      expect(source).toContain('canAccessPlantStrict');
    }
  });
});
