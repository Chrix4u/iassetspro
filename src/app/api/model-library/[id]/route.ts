import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';
import { modelPipelineService } from '@/services/modelPipeline.service';

function modelPlantId(model: { plantId?: string | null; asset?: { plantId?: string | null } | null }): string | null {
  return model.plantId || model.asset?.plantId || null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const session = getSession(req)!;
    if (!hasPermission(session, 'digital_twin.view') && !isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const plantScope = await getPlantScope(req, session);
    if (plantScope.denyAccess) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    const { id } = await params;
    const model = await modelPipelineService.getModelById(id);
    if (!canAccessPlantStrict(plantScope, modelPlantId(model))) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    return NextResponse.json(model);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to get model';
    console.error('[GET /api/model-library/:id]', error);
    if (message.includes('not found')) return NextResponse.json({ error: message }, { status: 404 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const session = getSession(req)!;
    if (!hasPermission(session, 'digital_twin.manage') && !isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const plantScope = await getPlantScope(req, session);
    if (plantScope.denyAccess) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    const { id } = await params;
    const existing = await modelPipelineService.getModelById(id);
    if (!canAccessPlantStrict(plantScope, modelPlantId(existing))) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = await req.json();
    if (!body.status) return NextResponse.json({ error: 'status is required' }, { status: 400 });
    const model = await modelPipelineService.updateModelStatus(id, String(body.status), body);
    return NextResponse.json(model);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update model';
    console.error('[PATCH /api/model-library/:id]', error);
    if (message.includes('not found')) return NextResponse.json({ error: message }, { status: 404 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const session = getSession(req)!;
    if (!hasPermission(session, 'digital_twin.manage') && !isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const plantScope = await getPlantScope(req, session);
    if (plantScope.denyAccess) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    const { id } = await params;
    const existing = await modelPipelineService.getModelById(id);
    if (!canAccessPlantStrict(plantScope, modelPlantId(existing))) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    await modelPipelineService.deleteModel(id);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete model';
    console.error('[DELETE /api/model-library/:id]', error);
    if (message.includes('not found')) return NextResponse.json({ error: message }, { status: 404 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
