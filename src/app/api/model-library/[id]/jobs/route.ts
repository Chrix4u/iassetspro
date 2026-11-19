import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';
import { modelPipelineService } from '@/services/modelPipeline.service';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    if (!hasPermission(session, 'digital_twin.view') && !isAdmin(session)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const plantScope = await getPlantScope(req, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { id } = await params;
    const model = await db.modelLibrary.findUnique({
      where: { id },
      select: { id: true, plantId: true, asset: { select: { plantId: true } } },
    });
    if (!model) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    const assetPlantId = model.asset?.plantId ?? null;
    const effectivePlantId = assetPlantId ?? model.plantId ?? null;
    if ((assetPlantId && model.plantId && assetPlantId !== model.plantId) ||
        !canAccessPlantStrict(plantScope, effectivePlantId)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const jobs = await modelPipelineService.getModelJobs(id);
    return NextResponse.json(jobs);
  } catch (error: unknown) {
    console.error('[GET /api/model-library/:id/jobs]', error);
    return NextResponse.json({ error: 'Failed to get model processing jobs' }, { status: 500 });
  }
}
