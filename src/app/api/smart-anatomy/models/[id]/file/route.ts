import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
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
  if (!isAdmin(session) && !hasPermission(session, 'digital_twin.view') &&
      !hasPermission(session, 'digital_twin.manage')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }
  const scope = await getPlantScope(req, session);
  if (scope.denyAccess) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Model not found' }, { status: 404 });
  }
  const model = await db.assetModel.findUnique({
    where: { id },
    select: { filePath: true, fileSize: true, isActive: true, uploadedById: true,
      asset: { select: { plantId: true } } },
  });
  if (!model || model.filePath !== '/api/smart-anatomy/models/' + id + '/file') {
    return NextResponse.json({ error: 'Model not found' }, { status: 404 });
  }
  if (!canAccessPlantStrict(scope, model.asset.plantId)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }
  // The same plant is not sufficient authorization to inspect an
  // uncommissioned proprietary manufacturer drawing. Ordinary Digital Twin
  // viewers receive only independently commissioned/approved models.
  if (!model.isActive && !isAdmin(session) && !hasPermission(session, 'digital_twin.manage')) {
    return NextResponse.json({ error: 'Private CAD is awaiting independent engineering approval' }, { status: 403 });
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
    // Never read an unbounded or final-component-symlinked file. Pre-check
    // the descriptor's type and size *before* allocating file bytes.
    const handle = await open(privateCadFilePath(root, id),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    let file: Buffer;
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size <= 0 ||
          stat.size !== model.fileSize || stat.size > MAX_PRIVATE_CAD_UPLOAD_BYTES) {
        return NextResponse.json({ error: 'CAD file size verification failed' }, { status: 409 });
      }
      file = await handle.readFile();
      const after = await handle.stat();
      if (after.dev !== stat.dev || after.ino !== stat.ino ||
          after.size !== stat.size || after.mtimeMs !== stat.mtimeMs ||
          after.ctimeMs !== stat.ctimeMs) {
        return NextResponse.json({ error: 'CAD file changed during verification' }, { status: 409 });
      }
    } finally {
      await handle.close();
    }
    if (file.byteLength !== model.fileSize) {
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
