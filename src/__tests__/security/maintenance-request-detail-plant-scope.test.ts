import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const route = readFileSync(
  join(process.cwd(), 'src/app/api/maintenance-requests/[id]/route.ts'),
  'utf8',
);

describe('maintenance request detail plant scope', () => {
  it('fails closed on the canonical strict plant-scope decision', () => {
    expect(route).toContain('plantScope.denyAccess || !canAccessPlantStrict(plantScope, mr.plantId)');
    expect(route).toContain("return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });");
  });

  it('does not bypass denyAccess with a second UserPlant lookup', () => {
    const detailGetSection = route.slice(route.indexOf('export async function GET'), route.indexOf('export async function PUT'));
    expect(detailGetSection).not.toContain('db.userPlant.findFirst');
    expect(detailGetSection).not.toContain('hasPlantAccess');
  });
});
