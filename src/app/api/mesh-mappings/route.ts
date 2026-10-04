import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getSession, hasPermission, isAdmin } from '@/lib/auth';
import { componentMappingService } from '@/services/componentMapping.service';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const modelId = searchParams.get('modelId')!;
    if (!modelId) return NextResponse.json({ error: 'modelId required' }, { status: 400 });

    const mappingType = searchParams.get('mappingType') || undefined;
    const search = searchParams.get('search') || undefined;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50));

    const result = await componentMappingService.listMappings({
      modelId,
      mappingType,
      search,
      page,
      limit,
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list mappings';
    console.error('[GET /api/mesh-mappings]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const session = getSession(req)!;
    if (!hasPermission(session, 'digital_twin.manage') && !isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();

    if (body.mappings && Array.isArray(body.mappings)) {
      const result = await componentMappingService.bulkCreateMappings(body.mappings, user.id);
      return NextResponse.json(result, { status: 201 });
    }

    const mapping = await componentMappingService.createMapping({
      ...body,
      createdById: user.id,
    });
    return NextResponse.json(mapping, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create mapping';
    console.error('[POST /api/mesh-mappings]', error);
    const status = message.includes('Conflict')
      ? 409
      : message.includes('Invalid:')
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
