import { randomUUID, createHash } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';
import { inspectSelfContainedGlb, MAX_PRIVATE_CAD_UPLOAD_BYTES } from '@/lib/smart-anatomy/validate-glb';
import { assertPrivateCadStorageReady, privateCadFilePath, privateCadStorageRoot } from '@/lib/smart-anatomy/private-cad-storage';
import { MultipartUploadError, MAX_CAD_MULTIPART_OVERHEAD, readBoundedMultipart } from '@/lib/smart-anatomy/limited-multipart';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  if (!isAdmin(session) && !hasPermission(session, 'digital_twin.manage')) {
    return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
  }
  const scope = await getPlantScope(req, session);
  if (scope.denyAccess) {
    return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
  }

  const reportedLength = Number(req.headers.get('content-length') || '0');
  if (Number.isFinite(reportedLength) &&
      reportedLength > MAX_PRIVATE_CAD_UPLOAD_BYTES + 1024 * 1024) {
    return NextResponse.json({ success: false, error: 'CAD upload exceeds 25 MB' }, { status: 413 });
  }

  const root = privateCadStorageRoot();
  if (!root) {
    return NextResponse.json({
      success: false,
      error: 'Private CAD storage has not been configured on the server',
    }, { status: 503 });
  }

  // Never create a directory with implicit parent permissions. An operator
  // must provision owner-only persistent storage outside all public roots.
  try {
    await assertPrivateCadStorageReady(root);
  } catch {
    return NextResponse.json({
      success: false, error: 'Private CAD storage is not safely provisioned',
    }, { status: 503 });
  }

  let storedFile: string | null = null;
  try {
    // Hard cap the streamed body before calling FormData's buffering parser,
    // including when the client uses chunked transfer with no Content-Length.
    const form = await readBoundedMultipart(
      req,
      MAX_PRIVATE_CAD_UPLOAD_BYTES + MAX_CAD_MULTIPART_OVERHEAD,
    );
    const file = form.get('file');
    const assetId = String(form.get('assetId') || '');
    const name = String(form.get('name') || '').trim();
    const sourceOrigin = String(form.get('sourceOrigin') || '');
    const sourceNote = String(form.get('sourceNote') || '').trim();

    if (!file || typeof file === 'string' || !file.name.toLowerCase().endsWith('.glb') ||
        !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_PRIVATE_CAD_UPLOAD_BYTES) {
      return NextResponse.json({
        success: false, error: 'Select a valid self-contained GLB file (maximum 25 MB)',
      }, { status: 400 });
    }
    if (!assetId || name.length < 3 || name.length > 160 ||
        !['licensed-oem', 'site-owned-scan', 'original-training'].includes(sourceOrigin) ||
        sourceNote.length < 8 || sourceNote.length > 1000) {
      return NextResponse.json({
        success: false, error: 'Asset, model name and documented legal model origin are required',
      }, { status: 400 });
    }

    const asset = await db.asset.findUnique({
      where: { id: assetId },
      select: { id: true, plantId: true },
    });
    if (!asset) return NextResponse.json({ success: false, error: 'Asset not found' }, { status: 404 });
    if (!canAccessPlantStrict(scope, asset.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const geometry = inspectSelfContainedGlb(bytes);
    const checksum = createHash('sha256').update(bytes).digest('hex');
    const id = randomUUID();
    const filePath = '/api/smart-anatomy/models/' + id + '/file';
    storedFile = privateCadFilePath(root, id);
    await writeFile(storedFile, bytes, { mode: 0o600, flag: 'wx' });

    try {
      const [model] = await db.$transaction([
        db.assetModel.create({
          data: {
            id, assetId, name, fileName: file.name.slice(0, 255),
            filePath, fileSize: bytes.byteLength, fileType: 'model/gltf-binary',
            format: 'glb', meshCount: geometry.meshCount,
            vertexCount: geometry.vertexCount, uploadedById: session.userId,
            // A model must not enter maintenance execution automatically.
            // It requires a separate engineer-mapped Digital Twin scene.
            isActive: false,
          },
        }),
        db.auditLog.create({
          data: {
            userId: session.userId, action: 'create',
            entityType: 'asset_model', entityId: id,
            newValues: JSON.stringify({
              assetId, sourceOrigin, sourceNote, checksum,
              status: 'awaiting-engineer-commissioning',
              ...geometry,
            }),
          },
        }),
      ]);
      return NextResponse.json({
        success: true,
        data: { id: model.id, name: model.name, filePath,
          meshCount: geometry.meshCount, vertexCount: geometry.vertexCount,
          checksum, commissioned: false },
      }, { status: 201 });
    } catch (error) {
      await unlink(storedFile).catch(() => {});
      storedFile = null;
      throw error;
    }
  } catch (error: unknown) {
    if (error instanceof MultipartUploadError) {
      if (storedFile) await unlink(storedFile).catch(() => {});
      return NextResponse.json({
        success: false, error: error.message,
      }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : '';
    const isInvalid = message.startsWith('GLB ') || message.startsWith('Only glTF') ||
      message.startsWith('Invalid ') || message.startsWith('GLB cannot');
    if (storedFile) await unlink(storedFile).catch(() => {});
    if (isInvalid) {
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }
    console.error('[POST /api/smart-anatomy/models]', error);
    return NextResponse.json({ success: false, error: 'Could not save the CAD model' }, { status: 500 });
  }
}
