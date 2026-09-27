// ============================================================================
// UNIVERSAL AI LLM CLIENT
// ============================================================================
// Supports multiple AI providers:
//   - Z.ai SDK (built-in, for sandbox)
//   - Google Gemini (FREE tier - OpenAI-compatible)
//   - Groq (FREE tier - OpenAI-compatible)
//   - OpenRouter (aggregator with free models)
//   - Cerebras (FREE tier - OpenAI-compatible)
//   - Custom OpenAI-compatible endpoints
//   - OpenAI
//   - Anthropic (Claude)
//
// Reads configuration from the database (ai_configs table) and creates
// appropriate HTTP clients for each provider. Falls back to Z.ai SDK when
// no external config is set.
// ============================================================================

import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';

const logger = createLogger('lib:ai-client');

// ============================================================================
// TYPES
// ============================================================================

type AIProvider = 'zai_sdk' | 'zai-api' | 'openai' | 'anthropic' | 'custom' | 'gemini' | 'groq' | 'openrouter' | 'cerebras';

interface AiConfigRecord {
  id: string;
  provider: string;
  llmModel: string;
  llmEndpoint: string;
  llmApiKey: string;
  llmTemperature: number;
  llmMaxTokens: number;
  imageModel: string;
  imageApiKey: string;
  meshyApiKey: string;
  provider3d: string;
  generationSettings: Record<string, unknown> | string;
  isActive: boolean;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionOptions {
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
}

interface ChatCompletionResponse {
  id?: string;
  choices: Array<{
    index?: number;
    message?: {
      role?: string;
      content?: string;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  model?: string;
}

interface ImageGenerationOptions {
  prompt: string;
  size?: string;
}

interface ImageGenerationResponse {
  data: Array<{
    base64?: string;
    url?: string;
    revised_prompt?: string;
  }>;
}

// ============================================================================
// PRE-CONFIGURED PROVIDER DEFINITIONS
// ============================================================================

const PROVIDER_ENDPOINTS: Record<string, { chatUrl: string; imageUrl: string; models: string[]; docsUrl: string; freeModels: string[] }> = {
  'zai-api': {
    chatUrl: 'https://api.z.ai/api/paas/v4/chat/completions',
    imageUrl: 'https://api.z.ai/api/paas/v4/images/generations',
    models: ['glm-5.3', 'glm-4.6', 'glm-4.5'],
    freeModels: [],
    docsUrl: 'https://z.ai/manage-apikey/apikey-list',
  },
  gemini: {
    chatUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    imageUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/images/generations',
    models: ['gemini-2.5-flash-preview-05-20', 'gemini-2.5-flash-preview-04-17', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    freeModels: ['gemini-2.5-flash-preview-05-20', 'gemini-2.5-flash-preview-04-17', 'gemini-2.0-flash', 'gemini-1.5-flash'],
    docsUrl: 'https://aistudio.google.com/apikey',
  },
  groq: {
    chatUrl: 'https://api.groq.com/openai/v1/chat/completions',
    imageUrl: 'https://api.groq.com/openai/v1/images/generations',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
    freeModels: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
    docsUrl: 'https://console.groq.com/keys',
  },
  openrouter: {
    chatUrl: 'https://openrouter.ai/api/v1/chat/completions',
    imageUrl: 'https://openrouter.ai/api/v1/images/generations',
    models: [
      'google/gemini-2.5-flash-preview',
      'meta-llama/llama-3.3-70b-instruct:free',
      'google/gemma-2-9b-it:free',
      'mistralai/mistral-7b-instruct:free',
      'qwen/qwen-2.5-72b-instruct:free',
    ],
    freeModels: [
      'google/gemini-2.5-flash-preview',
      'meta-llama/llama-3.3-70b-instruct:free',
      'google/gemma-2-9b-it:free',
      'mistralai/mistral-7b-instruct:free',
      'qwen/qwen-2.5-72b-instruct:free',
    ],
    docsUrl: 'https://openrouter.ai/keys',
  },
  cerebras: {
    chatUrl: 'https://api.cerebras.ai/v1/chat/completions',
    imageUrl: 'https://api.cerebras.ai/v1/images/generations',
    models: ['llama-3.3-70b', 'llama3.1-8b'],
    freeModels: ['llama-3.3-70b', 'llama3.1-8b'],
    docsUrl: 'https://cloud.cerebras.ai/',
  },
  openai: {
    chatUrl: 'https://api.openai.com/v1/chat/completions',
    imageUrl: 'https://api.openai.com/v1/images/generations',
    models: ['gpt-4o', 'gpt-4-turbo', 'gpt-4o-mini', 'gpt-3.5-turbo'],
    freeModels: [],
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  anthropic: {
    chatUrl: 'https://api.anthropic.com/v1/messages',
    imageUrl: '',
    models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
    freeModels: [],
    docsUrl: 'https://console.anthropic.com/',
  },
};

function normalizeZaiEndpoint(value: string, kind: 'chat' | 'image'): string {
  const fallbackBase = 'https://api.z.ai/api/paas/v4';
  let url = (value || fallbackBase).replace(/\/+$/, '');
  url = url.replace(/\/chat\/completions$/, '').replace(/\/images\/generations$/, '');
  return kind === 'chat' ? url + '/chat/completions' : url + '/images/generations';
}

// ============================================================================
// CONFIG LOADING (DATABASE)
// ============================================================================

let _cachedConfig: AiConfigRecord | null | undefined = undefined; // undefined = not yet loaded
let _cacheTimestamp = 0;
const CONFIG_CACHE_TTL_MS = 30_000; // Cache for 30 seconds

/**
 * Read the active AI config from the database (ai_configs table).
 * Uses in-memory caching with 30s TTL to avoid DB queries on every request.
 */
async function getActiveConfig(): Promise<AiConfigRecord | null> {
  const now = Date.now();
  if (_cachedConfig !== undefined && (now - _cacheTimestamp) < CONFIG_CACHE_TTL_MS) {
    return _cachedConfig;
  }
  try {
    const config = await db.aiConfig.findFirst({ where: { isActive: true } });
    _cachedConfig = config || null;
    _cacheTimestamp = now;
    return _cachedConfig;
  } catch (err) {
    console.error('[ai-client] Failed to read config from DB:', err);
    _cachedConfig = null;
    _cacheTimestamp = now;
    return null;
  }
}

/**
 * Invalidate the config cache (called after config save).
 */
export function invalidateAIConfigCache(): void {
  _cachedConfig = undefined;
  _cacheTimestamp = 0;
}

// ============================================================================
// OPENAI-COMPATIBLE CHAT COMPLETIONS (fetch-based)
// ============================================================================

/**
 * Call any OpenAI-compatible chat completions endpoint via direct HTTP fetch.
 * Works for: Google Gemini, Groq, OpenRouter, Cerebras, OpenAI, Custom endpoints.
 */
async function callOpenAICompatible(
  endpoint: string,
  apiKey: string,
  model: string,
  options: ChatCompletionOptions,
  provider: string = 'unknown',
): Promise<ChatCompletionResponse> {
  const url = endpoint || PROVIDER_ENDPOINTS[provider]?.chatUrl || '';
  if (!url) {
    throw new Error(`No chat endpoint configured for provider "${provider}"`);
  }
  if (!apiKey) {
    throw new Error(`No API key configured for provider "${provider}". Please go to AI Settings to add your API key.`);
  }

  logger.info(`Calling ${provider} chat completions`, { model, url });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      ...(provider === 'anthropic' ? { 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } : {}),
      ...(provider === 'openrouter' ? { 'HTTP-Referer': 'https://iassetspro.com', 'X-Title': 'iAssetsPro EAM' } : {}),
    },
    body: JSON.stringify({
      model,
      messages: options.messages.map(m => ({ role: m.role, content: m.content })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 8000,
      ...(provider === 'anthropic' ? { system: options.messages.find(m => m.role === 'system')?.content, messages: options.messages.filter(m => m.role !== 'system') } : {}),
    }),
    signal: AbortSignal.timeout(120_000), // 2 minute timeout
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'No error body');
    throw new Error(
      `${provider} API error (${response.status}): ${errorBody.slice(0, 500)}`,
    );
  }

  const data = await response.json() as ChatCompletionResponse;

  // Handle Anthropic response format (different structure)
  if (provider === 'anthropic') {
    return {
      id: data.id,
      choices: [{
        message: {
          role: 'assistant',
          content: (data as any).content?.[0]?.text || '',
        },
        finish_reason: (data as any).stop_reason,
      }],
      usage: data.usage,
      model: data.model,
    };
  }

  return data;
}

// ============================================================================
// Z.AI SDK FALLBACK
// ============================================================================

/**
 * Call Z.ai SDK (built-in). This is the existing behavior for the sandbox
 * development environment. Falls back to direct fetch if SDK is not available.
 */
async function callZaiSdk(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI.create();
    const response = await zai.chat.completions.create({
      messages: options.messages.map(m => ({ role: m.role, content: m.content })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 8000,
      thinking: { type: 'disabled' },
    });
    return response as ChatCompletionResponse;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Z.ai SDK call failed', { message: msg });
    throw new Error(
      `Z.ai SDK failed: ${msg}. ` +
      `To use AI features, go to AI Settings (⚙️) and configure a free provider like Google Gemini or Groq. ` +
      `You only need a free API key — no credit card required.`,
    );
  }
}

// ============================================================================
// PUBLIC API — CHAT COMPLETIONS
// ============================================================================

/**
 * Main entry point for LLM chat completions.
 * Automatically selects the right provider based on the saved config.
 *
 * Usage:
 *   const response = await aiChatCompletion({
 *     messages: [
 *       { role: 'system', content: 'You are a helpful assistant...' },
 *       { role: 'user', content: 'Generate data for a centrifugal pump' },
 *     ],
 *     temperature: 0.7,
 *     max_tokens: 8000,
 *   });
 *   const text = response.choices[0]?.message?.content;
 */
export async function aiChatCompletion(
  options: ChatCompletionOptions,
): Promise<ChatCompletionResponse> {
  const config = await getActiveConfig();

  // No config saved → try Z.ai SDK
  if (!config) {
    logger.info('No AI config found, using Z.ai SDK');
    return callZaiSdk(options);
  }

  const provider = config.provider;

  // Z.ai SDK provider
  if (provider === 'zai_sdk') {
    logger.info('Using Z.ai SDK (built-in provider)');
    return callZaiSdk(options);
  }

  // Determine endpoint and API key
  let endpoint = config.llmEndpoint || '';
  let apiKey = config.llmApiKey || '';
  let model = config.llmModel || '';

  const keyLooksMasked = apiKey.startsWith('****');
  logger.info('Resolved AI provider credentials', {
    provider,
    hasApiKey: !!apiKey,
    keyLooksMasked,
  });
  // If key starts with ****, it means the masked value leaked into the data file
  if (keyLooksMasked) {
    throw new Error(
      `BUG: API key for "${provider}" is masked (starts with ****). ` +
      `This means the masked display value was saved as the real key. ` +
      `Please go to AI Settings, clear the key field, enter your actual API key, and save again.`
    );
  }

  // For pre-configured providers, use built-in endpoints if no custom endpoint
  const providerDef = PROVIDER_ENDPOINTS[provider];
  if (provider === 'zai-api') {
    endpoint = normalizeZaiEndpoint(endpoint, 'chat');
  } else if (providerDef && !endpoint) {
    endpoint = providerDef.chatUrl;
  }

  if (!model) {
    model = providerDef?.models[0] || '';
  }

  if (!model) {
    throw new Error(`No model configured for provider "${provider}". Please set a model in AI Settings.`);
  }

  // For OpenAI provider, the endpoint is built-in
  if (provider === 'openai' && !endpoint) {
    endpoint = PROVIDER_ENDPOINTS.openai.chatUrl;
  }

  // Use configured temperature/max_tokens as defaults if not provided
  const finalOptions: ChatCompletionOptions = {
    ...options,
    temperature: options.temperature ?? config.llmTemperature ?? 0.7,
    max_tokens: options.max_tokens ?? config.llmMaxTokens ?? 8000,
  };

  logger.info(`Using provider: ${provider}`, { model, hasEndpoint: !!endpoint, hasApiKey: !!apiKey });

  return callOpenAICompatible(endpoint, apiKey, model, finalOptions, provider);
}

// ============================================================================
// PUBLIC API — IMAGE GENERATION
// ============================================================================

/**
 * Generate an image using the configured AI provider.
 * Falls back gracefully if image generation is not supported.
 */
export async function aiImageGeneration(
  options: ImageGenerationOptions,
): Promise<ImageGenerationResponse> {
  const config = await getActiveConfig();

  // Image generation must use an explicitly configured provider in production.
  // The bundled Z.ai SDK points at a sandbox-internal endpoint and is not
  // reachable from normal VPS deployments.
  if (!config) {
    throw new Error(
      'No active AI image provider is configured. Open AI Settings and configure an image-capable provider before generating machine visuals.',
    );
  }

  const provider = config.provider;

  // For providers without image generation support (Gemini via OpenAI compat, Groq, etc.)
  // we skip image generation gracefully — it's optional
  const providerDef = PROVIDER_ENDPOINTS[provider];
  if (!providerDef?.imageUrl) {
    throw new Error(`Provider "${provider}" does not support image generation. Image generation is optional — the asset will be created without an AI illustration.`);
  }

  const endpoint = provider === 'zai-api'
    ? normalizeZaiEndpoint(config.llmEndpoint || providerDef.imageUrl, 'image')
    : provider === 'custom'
      ? (config.llmEndpoint || providerDef.imageUrl)
      : providerDef.imageUrl;
  let apiKey = config.imageApiKey || config.llmApiKey || '';

  // For OpenAI with image key
  if (provider === 'openai' && !apiKey) {
    apiKey = config.llmApiKey || '';
  }

  if (!apiKey) {
    throw new Error('No API key configured for image generation. Image generation is optional — the asset will be created without an AI illustration.');
  }

  const model = config.imageModel || 'dall-e-3';

  logger.info(`Generating image via ${provider}`, { model });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt: options.prompt,
      n: 1,
      size: options.size || '1024x1024',
      ...(provider === 'zai-api' ? {} : { response_format: 'b64_json' }),
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'No error body');
    throw new Error(`Image generation API error (${response.status}): ${errorBody.slice(0, 300)}`);
  }

  const raw = await response.json() as {
    data?: Array<{ base64?: string; b64_json?: string; url?: string; revised_prompt?: string }>;
  };
  return {
    data: (raw.data || []).map((item) => ({
      base64: item.base64 || item.b64_json,
      url: item.url,
      revised_prompt: item.revised_prompt,
    })),
  };
}

// ============================================================================
// PUBLIC API — CONNECTION TEST
// ============================================================================

/**
 * Test connection to the configured AI provider with a simple prompt.
 * Returns success/failure with response time and model info.
 */
export async function testAIConnection(): Promise<{
  success: boolean;
  model?: string;
  responseTime?: number;
  error?: string;
}> {
  const startTime = Date.now();
  const config = await getActiveConfig();

  if (!config) {
    return {
      success: false,
      error: 'No AI configuration found. Please save a configuration first.',
    };
  }

  const provider = config.provider;

  // Z.ai SDK — can't easily test, just check if available
  if (provider === 'zai_sdk') {
    try {
      const ZAI = (await import('z-ai-web-dev-sdk')).default;
      await ZAI.create();
      return {
        success: true,
        model: 'Z.ai SDK (Built-in)',
        responseTime: Date.now() - startTime,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Z.ai SDK not available: ${msg}`,
      };
    }
  }

  // For external providers, send a minimal test message
  try {
    const response = await aiChatCompletion({
      messages: [
        { role: 'user', content: 'Reply with exactly: OK' },
      ],
      temperature: 0,
      max_tokens: 10,
    });

    const content = response.choices?.[0]?.message?.content;
    const responseTime = Date.now() - startTime;

    return {
      success: !!content,
      model: response.model || config.llmModel,
      responseTime,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: msg,
    };
  }
}

// ============================================================================
// PUBLIC API — GET PROVIDER INFO
// ============================================================================

/**
 * Get available provider definitions for the config page.
 * Returns endpoint URLs, available models, free tier info, and docs links.
 */
export function getProviderDefinitions(): typeof PROVIDER_ENDPOINTS {
  return PROVIDER_ENDPOINTS;
}

/**
 * Get the current active config (for debugging).
 */
export async function getCurrentConfig(): Promise<AiConfigRecord | null> {
  return getActiveConfig();
}