import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';

const logger = createLogger('api:ai:config:test-image');
export const maxDuration = 120;

function imageEndpoint(provider: string, value?: string) {
  if (provider === 'zai-api') {
    let base = (value || 'https://api.z.ai/api/paas/v4').replace(/\/+$/, '');
    base = base.replace(/\/chat\/completions$/, '').replace(/\/images\/generations$/, '');
    return base + '/images/generations';
  }
  if (provider === 'openai') return 'https://api.openai.com/v1/images/generations';
  return '';
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const provider = String(body.provider || '');
    if (!['zai-api', 'openai'].includes(provider)) {
      return NextResponse.json({ success: false, error: 'The selected provider does not have a supported image-generation test endpoint.' }, { status: 400 });
    }

    const active = await db.aiConfig.findFirst({ where: { isActive: true } });
    const sameProvider = active?.provider === provider;
    const apiKey = String(body.imageApiKey || body.apiKey || (sameProvider ? (active?.imageApiKey || active?.llmApiKey) : '') || '');
    const model = String(body.imageModel || (sameProvider ? active?.imageModel : '') || (provider === 'zai-api' ? 'glm-image' : 'dall-e-3'));
    const endpoint = imageEndpoint(provider, String(body.customEndpoint || (sameProvider ? active?.llmEndpoint : '') || ''));

    if (!apiKey) return NextResponse.json({ success: false, error: 'Enter or save an API key before testing image generation.' }, { status: 400 });

    const started = Date.now();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({
        model,
        prompt: 'Clean industrial engineering reference image of a centrifugal pump bearing housing on a neutral workshop background, no text, no logos.',
        n: 1,
        size: '1024x1024',
        ...(provider === 'zai-api' ? {} : { response_format: 'b64_json' }),
      }),
      signal: AbortSignal.timeout(110_000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      return NextResponse.json({ success: false, error: 'Image API error (' + response.status + '): ' + detail.slice(0, 240) }, { status: 400 });
    }
    const data = await response.json() as { data?: Array<{ url?: string; b64_json?: string; base64?: string }> };
    const produced = Boolean(data.data?.[0]?.url || data.data?.[0]?.b64_json || data.data?.[0]?.base64);
    const result = { success: produced, model, responseTime: Date.now() - started };
    logger.info('Image generation test completed', { provider, success: produced, model, responseTime: result.responseTime });
    return NextResponse.json({ success: produced, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Image generation test failed';
    logger.error('Image generation test error', { message });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}