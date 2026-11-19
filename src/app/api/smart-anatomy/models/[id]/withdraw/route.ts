import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';

/**
 * Withdraw an approved CAD from active 3D scenes without deleting provenance,
 * source bytes, mapping audit trails or historical maintenance records.
 *
 * A withdrawn file can be reviewed as historic evidence but cannot be
 * re-commissioned; engineers must import and review a replacement revision.
 */
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
    const reason = String(body?.reason || '').trim();
    if (reason.length < 15 || reason.length > 1000) {
      return NextResponse.json({
        success: false, error: 'An engineering withdrawal reason of 15–1000 characters is required',
      }, { status: 400 });
    }
    const model = await db.assetModel.findUnique({
      where: { id },
      select: {
        id: true, assetId: true, filePath: true, isActive: true,
        asset: { select: { plantId: true } },
      },
    });
    if (!model || model.filePath !== '/api/smart-anatomy/models/' + id + '/file') {
      return NextResponse.json({ success: false, error: 'Private CAD model not found' }, { status: 404 });
    }
    if (!canAccessPlantStrict(scope, model.asset.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    if (!model.isActive) {
      return NextResponse.json({
        success: false, error: 'CAD model is not currently approved for active inspection',
      }, { status: 409 });
    }

    const [updated, closed] = await db.$transaction([
      db.assetModel.update({ where: { id }, data: { isActive: false } }),
      db.digitalTwinScene.updateMany({ where: { modelId: id, isActive: true }, data: { isActive: false } }),
      db.auditLog.create({
        data: {
          userId: session.userId,
          action: 'withdraw',
          entityType: 'asset_model',
          entityId: id,
          plantId: model.asset.plantId,
          oldValues: JSON.stringify({ isActive: true }),
          newValues: JSON.stringify({
            isActive: false, reason, sourceBytesRetained: true,
            scenePublicationRevoked: true, maintenanceProcedureApproved: false,
          }),
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: { id: updated.id, isActive: false, scenesWithdrawn: closed.count },
    });
  } catch (error) {
    console.error('[POST /api/smart-anatomy/models/:id/withdraw]', error);
    return NextResponse.json({ success: false, error: 'Unable to withdraw reviewed CAD' }, { status: 500 });
  }
}
