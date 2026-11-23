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
    // Only a plant-authorized Digital Twin manager may view declared OEM
    // identity and source notes; ordinary 3D viewers see status only.
    const canInspectSourceEvidence = isAdmin(session) ||
      hasPermission(session, 'digital_twin.manage');
    let sourceEvidence: {
      sourceOrigin: string;
      sourceNote: string;
      oemManufacturer: string | null;
      oemModel: string | null;
      drawingRevision: string | null;
      nameplateSerial: string | null;
      conversionSidecarPresent: boolean;
      originalCadFileChecksumVerified: boolean;
    } | null = null;
    if (canInspectSourceEvidence) {
      const record = await db.auditLog.findFirst({
        where: {entityType:'asset_model', entityId:id, action:'create'},
        select: {newValues:true},
        orderBy: {createdAt:'asc'},
      });
      try {
        const declared = JSON.parse(record?.newValues || '{}') as {
          sourceOrigin?: unknown;
          sourceNote?: unknown;
          sourceMachineClaim?: Record<string, unknown> | null;
          conversionEvidence?: unknown;
        };
        const identity = declared.sourceMachineClaim || {};
        let sourceChecksumVerified = false;
        if (declared.conversionEvidence && typeof declared.conversionEvidence === 'object') {
          const evidence = declared.conversionEvidence as { sourceSha256?: unknown };
          const sourceVerifiedAudit = await db.auditLog.findFirst({
            where: {entityType:'asset_model',entityId:id,action:'source_verified'},
            select: {newValues:true},
            orderBy: {createdAt:'desc'},
          });
          try {
            const verified = JSON.parse(sourceVerifiedAudit?.newValues || '{}') as {
              sourceSha256?: unknown;
              independentlyComparedOriginalCadBytes?: unknown;
              verifiedById?: unknown;
            };
            sourceChecksumVerified =
              typeof evidence.sourceSha256 === 'string' &&
              verified.sourceSha256 === evidence.sourceSha256 &&
              verified.independentlyComparedOriginalCadBytes === true &&
              typeof verified.verifiedById === 'string' &&
              verified.verifiedById !== model.uploadedById;
          } catch {
            sourceChecksumVerified = false;
          }
        }
        const restricted = (value: unknown): string | null =>
          typeof value === 'string' && value.length <= 140 ? value : null;
        sourceEvidence = {
          sourceOrigin: restricted(declared.sourceOrigin) || 'unspecified',
          sourceNote: typeof declared.sourceNote === 'string'
            ? declared.sourceNote.slice(0,1000) : '',
          oemManufacturer: restricted(identity.oemManufacturer),
          oemModel: restricted(identity.oemModel),
          drawingRevision: restricted(identity.drawingRevision),
          nameplateSerial: restricted(identity.nameplateSerial),
          conversionSidecarPresent: Boolean(declared.conversionEvidence),
          originalCadFileChecksumVerified: sourceChecksumVerified,
        };
      } catch {
        // Invalid original audit evidence is never treated as verified.
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        id, isActive: model.isActive,
        sourceEvidence,
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
