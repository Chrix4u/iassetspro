import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const route = readFileSync(join(process.cwd(), 'src/app/api/connectivity/sources/route.ts'), 'utf8');
const getSection = route.slice(route.indexOf('export async function GET'), route.indexOf('// POST /api/connectivity/sources'));
const postSection = route.slice(route.indexOf('export async function POST'));

describe('connectivity sources API security contract', () => {
  it('requires authentication and applies canonical plant scoping to GET', () => {
    expect(getSection).toContain('const session = getSession(request);');
    expect(getSection).toContain('const plantScope = await getPlantScope(request, session);');
    expect(getSection).toContain('...getPlantFilterWhere(plantScope)');
    expect(getSection).toContain("return NextResponse.json({ error: 'Plant access denied' }, { status: 403 });");
  });

  it('does not expose connectionConfig or metadata from list results', () => {
    expect(getSection).toContain('select: {');
    expect(getSection).not.toContain('connectionConfig');
    expect(getSection).not.toContain('metadata: true');
  });

  it('uses valid Prisma boolean selects and the current mapping activity field', () => {
    expect(getSection).toContain('protocol: true');
    expect(getSection).toContain('connectedAt: true');
    expect(getSection).toContain('messagesIn: true');
    expect(getSection).toContain('messagesOut: true');
    expect(getSection).toContain('where: { isActve: true }');
    expect(getSection).toContain('parameterName: true');
    expect(getSection).toContain('externalId: true');
    expect(getSection).toContain('dataType: true');
  });

  it('attributes newly created sources to the authenticated admin, not body.userId', () => {
    expect(postSection).toContain('createdById: session.userId');
    expect(postSection).not.toContain("createdById: body.userId || 'system'");
  });
});
