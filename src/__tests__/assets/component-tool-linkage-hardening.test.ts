import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const route = fs.readFileSync('src/app/api/component-registry/[id]/tools/route.ts', 'utf8');
const detail = fs.readFileSync('src/components/modules/AssetDetailPage.tsx', 'utf8');

describe('component tool registry linkage hardening', () => {
  it('enforces selected-plant access for component tool reads and writes', () => {
    expect(route).toContain("import { getComponentPlantAccess } from '@/lib/component-plant-access'");
    expect(route).toContain('const componentAccess = await getComponentPlantAccess(request, session, id);');
    expect(route).toContain("error: 'Plant access denied'");
    expect(route).toContain("error: 'Tool belongs to a different plant'");
  });

  it('rejects duplicate registry links and supports unlinking', () => {
    expect(route).toContain('db.componentToolRequirement.findFirst');
    expect(route).toContain("error: 'This tool is already required by the component'");
    expect(route).toContain('export async function DELETE');
    expect(route).toContain("searchParams.get('toolRequirementId')");
  });

  it('exposes live tool-registry linkage in the asset component workflow', () => {
    expect(detail).toContain("api.get('/api/tools?mode=lookup&limit=100')");
    expect(detail).toContain('Required Tools & Tool Registry Linkage');
    expect(detail).toContain('handleLinkToolRequirement');
    expect(detail).toContain('handleUnlinkToolRequirement');
    expect(detail).toContain('componentTools.map');
  });
});
