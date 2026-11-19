import { readFile } from 'node:fs/promises';
import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';
import { assertPrivateCadStorageReady, privateCadFilePath, privateCadStorageRoot } from '@/lib/smart-anatomy/private-cad-storage';
import { MAX_PRIVATE_CAD_UPLOAD_BYTES } from '@/lib/smart-anatomy/validate-glb';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!isAdmin(session) && !hasPermission(session, 'digital_twin.view')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }
  const scope = await getPlantScope(req, session);
  if (scope.denyAccess) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Model not found' }, { status: 404 });
  }
  const model = await db.assetModel.findUnique({
    where: { id },
    select: { filePath: true, fileSize: true, asset: { select: { plantId: true } } },
  });
  if (!model || model.filePath !== '/api/smart-anatomy/models/' + id + '/file') {
    return NextResponse.json({ error: 'Model not found' }, { status: 404 });
  }
  if (!canAccessPlantStrict(scope, model.asset.plantId)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const root = privateCadStorageRoot();
  if (!root) return NextResponse.json({ error: 'Private CAD storage not configured' }, { status: 503 });
  try {
    await assertPrivateCadStorageReady(root);
  } catch {
    return NextResponse.json({ error: 'Private CAD storage not safely provisioned' }, { status: 503 });
  }

  // Every proprietary upload has an immutable source checksum in its audit
  // creation record. Refuse to serve mutated files even when their byte count
  // matches (for example, an accidental replacement on a shared volume).
  const sourceAudit = await db.auditLog.findFirst({
    where: { entityType: 'asset_model', entityId: id, action: 'create' },
    select: { newValues: true },
    orderBy: { createdAt: 'asc' },
  });
  let expectedSha256: string | null = null;
  try {
    const recorded = JSON.parse(sourceAudit?.newValues || '{}') as { checksum?: unknown };
    if (typeof recorded.checksum === 'string' && /^[0-9a-f]{64}$/i.test(recorded.checksum)) {
      expectedSha256 = recorded.checksum.toLowerCase();
    }
  } catch {
    // A missing or corrupt provenance record is not a valid source attestation.
  }
  if (!expectedSha256) {
    return NextResponse.json({ error: 'CAD source integrity attestation unavailable' }, { status: 409 });
  }

  try {
    const file = await readFile(privateCadFilePath(root, id));
    if (file.byteLength !== model.fileSize || file.byteLength > MAX_PRIVATE_CAD_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'CAD file size verification failed' }, { status: 409 });
    }
    const actualSha256 = createHash('sha256').update(file).digest();
    if (!timingSafeEqual(actualSha256, Buffer.from(expectedSha256, 'hex'))) {
      return NextResponse.json({ error: 'CAD source checksum verification failed' }, { status: 409 });
    }
    return new NextResponse(new Uint8Array(file), {
      status: 200,
      headers: {
        'Content-Type': 'model/gltf-binary',
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline; filename="model.glb"',
      },
    });
  } catch (error) {
    console.error('[GET /api/smart-anatomy/models/:id/file]', error);
    return NextResponse.json({ error: 'CAD model file unavailable' }, { status: 404 });
  }
}
