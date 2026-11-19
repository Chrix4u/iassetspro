import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  if (!isAdmin(session) && !hasPermission(session, 'digital_twin.view')) {
    return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
  }
  const scope = await getPlantScope(req, session);
  if (scope.denyAccess) return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });

  try {
    const { id } = await params;
    const model = await db.assetModel.findUnique({
      where: { id },
      select: {
        id: true, uploadedById: true, filePath: true, isActive: true,
        asset: { select: { plantId: true } },
      },
    });
    if (!model || model.filePath !== '/api/smart-anatomy/models/' + id + '/file') {
      return NextResponse.json({ success: false, error: 'Private CAD not found' }, { status: 404 });
    }
    if (!canAccessPlantStrict(scope, model.asset.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const retired = await db.auditLog.findFirst({
      where: { entityType: 'asset_model', entityId: id, action: 'withdraw' },
      select: { id: true },
    });
    return NextResponse.json({
      success: true,
      data: {
        id, isActive: model.isActive,
        withdrawn: Boolean(retired),
        independentReviewerEligible:
          !retired && model.uploadedById !== session.userId && Boolean(model.uploadedById) &&
          (isAdmin(session) || hasPermission(session, 'digital_twin.manage')),
        status: retired ? 'withdrawn' : model.isActive ? 'approved' : 'awaiting-review',
      },
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[GET /api/smart-anatomy/models/:id/status]', error);
    return NextResponse.json({ success: false, error: 'Could not verify CAD review status' }, { status: 500 });
  }
}
