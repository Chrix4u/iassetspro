import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  if (!isAdmin(session) && !hasPermission(session, 'digital_twin.manage')) {
    return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
  }
  const scope = await getPlantScope(req, session);
  if (scope.denyAccess) {
    return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const note = String(body?.reviewNote || '').trim();
    if (body?.sourceReviewed !== true || body?.geometryReviewed !== true ||
        body?.componentMappingReviewed !== true || note.length < 12 || note.length > 1000) {
      return NextResponse.json({
        success: false,
        error: 'Engineer must review source, geometry and component links and provide a review note',
      }, { status: 400 });
    }

    const model = await db.assetModel.findUnique({
      where: { id },
      select: { id: true, assetId: true, filePath: true, isActive: true,
        asset: { select: { plantId: true } } },
    });
    if (!model || !/^\/api\/smart-anatomy\/models\/[0-9a-f-]{36}\/file$/i.test(model.filePath) ||
        model.filePath !== '/api/smart-anatomy/models/' + id + '/file') {
      return NextResponse.json({ success: false, error: 'Private CAD model not found' }, { status: 404 });
    }
    if (!canAccessPlantStrict(scope, model.asset.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }
    if (model.isActive) {
      return NextResponse.json({ success: true, data: { id, isActive: true } });
    }
    // A withdrawn engineering revision must not silently be reactivated.
    // Require an independently uploaded file with new source provenance.
    const withdrawn = await db.auditLog.findFirst({
      where: { entityType: 'asset_model', entityId: id, action: 'withdraw' },
      select: { id: true },
    });
    if (withdrawn) {
      return NextResponse.json({
        success: false,
        error: 'This CAD revision was withdrawn; import and review a new revision',
      }, { status: 409 });
    }

    const linkedComponents = await db.assetMeshBinding.count({
      where: { modelId: id, assetId: model.assetId, componentId: { not: null } },
    });
    if (linkedComponents < 1) {
      return NextResponse.json({
        success: false, error: 'Link at least one exact CAD node to a registered component before commissioning',
      }, { status: 409 });
    }

    const [updated] = await db.$transaction([
      db.assetModel.update({ where: { id }, data: { isActive: true } }),
      db.auditLog.create({
        data: {
          userId: session.userId, action: 'update', entityType: 'asset_model', entityId: id,
          oldValues: JSON.stringify({ isActive: false }),
          newValues: JSON.stringify({
            isActive: true, reviewNote: note, sourceReviewed: true,
            geometryReviewed: true, componentMappingReviewed: true,
            linkedComponents,
            // Technical review does not approve any particular physical
            // disassembly instructions or automated maintenance.
            maintenanceProcedureApproved: false,
          }),
        },
      }),
    ]);
    return NextResponse.json({
      success: true,
      data: { id: updated.id, isActive: updated.isActive, linkedComponents },
    });
  } catch (error) {
    console.error('[POST /api/smart-anatomy/models/:id/commission]', error);
    return NextResponse.json({ success: false, error: 'Could not commission private CAD model' }, { status: 500 });
  }
}
