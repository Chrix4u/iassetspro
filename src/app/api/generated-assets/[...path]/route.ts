import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GENERATED_ROOT = resolve(
  process.env.GENERATED_ASSETS_DIR || join(process.cwd(), 'public', 'generated-assets'),
);

const CONTENT_TYPES: Record<string, string> = {
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path } = await context.params;
    if (!Array.isArray(path) || path.length === 0) {
      return NextResponse.json({ success: false, error: 'Generated asset path is required' }, { status: 400 });
    }

    const relative = normalize(path.join('/')).replace(/^([/\\])+/, '');
    const absolute = resolve(GENERATED_ROOT, relative);
    if (absolute !== GENERATED_ROOT && !absolute.startsWith(GENERATED_ROOT + '/')) {
      return NextResponse.json({ success: false, error: 'Invalid generated asset path' }, { status: 400 });
    }

    const extension = extname(absolute).toLowerCase();
    const contentType = CONTENT_TYPES[extension];
    if (!contentType) {
      return NextResponse.json({ success: false, error: 'Generated asset type is not supported' }, { status: 415 });
    }

    const info = await stat(absolute);
    if (!info.isFile()) throw new Error('Not a file');
    const data = await readFile(absolute);

    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(data.length),
        'Cache-Control': 'public, max-age=3600, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Generated asset not found' }, { status: 404 });
  }
}