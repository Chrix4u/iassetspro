import { readFile } from 'node:fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';
import { privateCadFilePath, privateCadStorageRoot } from '@/lib/smart-anatomy/private-cad-storage';
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
    const file = await readFile(privateCadFilePath(root, id));
    if (file.byteLength !== model.fileSize || file.byteLength > MAX_PRIVATE_CAD_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'CAD file size verification failed' }, { status: 409 });
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
