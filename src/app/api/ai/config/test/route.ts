import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { testAIConnection } from '@/lib/ai-client';
import { db } from '@/lib/db';

const logger = createLogger('api:ai:config:test');
export const maxDuration = 30;

function zaiChatEndpoint(value?: string) {
  let base = (value || 'https://api.z.ai/api/paas/v4').replace(/\/+$/, '');
  base = base.replace(/\/chat\/completions$/, '').replace(/\/images\/generations$/, '');
  return base + '/chat/completions';
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const provider = body.provider === 'zai-sdk' ? 'zai_sdk' : String(body.provider || '');
    if (provider !== 'zai-api') {
      const result = await testAIConnection();
      return NextResponse.json({ success: result.success, data: result });
    }

    const active = await db.aiConfig.findFirst({ where: { isActive: true } });
    const sameProvider = active?.provider === 'zai-api';
    const apiKey = String(body.apiKey || body.llmApiKey || (sameProvider ? active?.llmApiKey : '') || '');
    const model = String(body.llmModel || (sameProvider ? active?.llmModel : '') || 'glm-5.3');
    const endpoint = zaiChatEndpoint(String(body.customEndpoint || body.llmEndpoint || (sameProvider ? active?.llmEndpoint : '') || ''));

    if (!apiKey) return NextResponse.json({ success: false, error: 'Enter or save your Z.ai API key before testing.' }, { status: 400 });

    const started = Date.now();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
        temperature: 0,
        max_tokens: 10,
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      return NextResponse.json({ success: false, error: 'Z.ai API error (' + response.status + '): ' + detail.slice(0, 240) }, { status: 400 });
    }
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }>; model?: string };
    const ok = Boolean(data.choices?.[0]?.message?.content);
    const result = { success: ok, model: data.model || model, responseTime: Date.now() - started };
    logger.info('Z.ai connection test completed', { success: ok, model: result.model, responseTime: result.responseTime });
    return NextResponse.json({ success: ok, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Connection test failed';
    logger.error('AI connection test error', { message });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}