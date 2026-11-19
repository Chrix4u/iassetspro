import { NextRequest, NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { assertPrivateCadStorageReady, privateCadFilePath, privateCadStorageRoot } from '@/lib/smart-anatomy/private-cad-storage';
import { auditedGlbMeshPaths } from '@/lib/smart-anatomy/mesh-source-paths';
import { MAX_PRIVATE_CAD_UPLOAD_BYTES } from '@/lib/smart-anatomy/validate-glb';
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
      select: { id: true, assetId: true, filePath: true, fileSize: true, isActive: true,
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

    const storedSource = await db.auditLog.findFirst({
      where: { entityType: 'asset_model', entityId: id, action: 'create' },
      select: { newValues: true },
      orderBy: { createdAt: 'asc' },
    });
    let expectedChecksum: string | null = null;
    try {
      const source = JSON.parse(storedSource?.newValues || '{}') as { checksum?: unknown };
      if (typeof source.checksum === 'string' && /^[0-9a-f]{64}$/i.test(source.checksum)) {
        expectedChecksum = source.checksum;
      }
    } catch {
      // Corrupt or missing original source attestation is never safe to approve.
    }
    if (!expectedChecksum) {
      return NextResponse.json({
        success: false, error: 'Original CAD checksum attestation is missing',
      }, { status: 409 });
    }

    const root = privateCadStorageRoot();
    if (!root) {
      return NextResponse.json({
        success: false, error: 'Private CAD storage is not configured',
      }, { status: 503 });
    }
    try {
      await assertPrivateCadStorageReady(root);
    } catch {
      return NextResponse.json({
        success: false, error: 'Private CAD storage is not safely provisioned',
      }, { status: 503 });
    }

    let importedPaths: Set<string>;
    try {
      const file = await readFile(privateCadFilePath(root, id));
      if (file.byteLength !== model.fileSize ||
          file.byteLength > MAX_PRIVATE_CAD_UPLOAD_BYTES ||
          !timingSafeEqual(
            createHash('sha256').update(file).digest(),
            Buffer.from(expectedChecksum, 'hex'),
          )) throw new Error('CAD source checksum mismatch');
      importedPaths = auditedGlbMeshPaths(file);
    } catch {
      return NextResponse.json({
        success: false,
        error: 'CAD source could not be verified against its original geometry and fingerprint',
      }, { status: 409 });
    }

    const verifiedBindings = await db.assetMeshBinding.findMany({
      where: { modelId: id, assetId: model.assetId, componentId: { not: null } },
      select: {
        meshPath: true, meshName: true, componentId: true,
        component: { select: { assetId: true } },
      },
    });
    if (!verifiedBindings.length) {
      return NextResponse.json({
        success: false, error: 'Link at least one exact CAD node to a registered component before commissioning',
      }, { status: 409 });
    }

    // Review checkboxes alone are insufficient. All maintenance-authoritative
    // component mappings must actually exist in the source GLB scene graph.
    const mappedPaths = new Set<string>();
    for (const binding of verifiedBindings) {
      if (!binding.meshPath || !importedPaths.has(binding.meshPath) ||
          binding.component?.assetId !== model.assetId ||
          mappedPaths.has(binding.meshPath)) {
        return NextResponse.json({
          success: false,
          error: 'A mapped CAD node does not exist in the reviewed GLB or conflicts with another component',
        }, { status: 409 });
      }
      mappedPaths.add(binding.meshPath);
    }
    const linkedComponents = verifiedBindings.length;

    const [updated] = await db.$transaction([
      db.assetModel.update({ where: { id }, data: { isActive: true } }),
      db.auditLog.create({
        data: {
          userId: session.userId, action: 'update', entityType: 'asset_model', entityId: id,
          oldValues: JSON.stringify({ isActive: false }),
          newValues: JSON.stringify({
            isActive: true, reviewNote: note, sourceReviewed: true,
            geometryReviewed: true, componentMappingReviewed: true,
            linkedComponents, importedMeshPaths: importedPaths.size,
            exactSourcePathMatches: mappedPaths.size,
            originalSourceIntegrityVerified: true,
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
