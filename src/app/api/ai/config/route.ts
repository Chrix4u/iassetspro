import { NextRequest, NextResponse } from 'next/server';
import { existsSync } from 'fs';
import { join } from 'path';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { invalidateAIConfigCache } from '@/lib/ai-client';
import { createAuditLog } from '@/lib/audit';
import { resolveDataDir } from '@/lib/data-dir';
import { db } from '@/lib/db';

const logger = createLogger('api:ai:config');

// Bump this string with every deploy to verify the VPS is running the latest code.
const CODE_VERSION = 'v4-db';

// ============================================================================
// TYPES
// ============================================================================

type AIProvider = 'zai_sdk' | 'zai-sdk' | 'zai-api' | 'openai' | 'anthropic' | 'custom' | 'gemini' | 'groq' | 'openrouter' | 'cerebras';

interface GenerationSettings {
  subsystemCount: string;
  componentsPerSubsystem: string;
  pmTemplates: string;
  includeSystemDiagram: boolean;
  includeDigitalTwin: boolean;
  includeMachineImage: boolean;
  includeSpareParts: boolean;
  includeBOM: boolean;
}

/**
 * Minimal interface matching the Prisma AiConfig record shape.
 * generationSettings comes back as a string from the DB and is parsed separately.
 */
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
  generationSettings: GenerationSettings;
  isActive: boolean;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_GENERATION_SETTINGS: GenerationSettings = {
  subsystemCount: 'auto',
  componentsPerSubsystem: 'auto',
  pmTemplates: 'auto',
  includeSystemDiagram: true,
  includeDigitalTwin: true,
  includeMachineImage: true,
  includeSpareParts: true,
  includeBOM: true,
};

const DEFAULT_CONFIG: Omit<AiConfigRecord, 'id' | 'createdById' | 'createdAt' | 'updatedAt'> = {
  provider: 'zai_sdk',
  llmModel: 'default',
  llmEndpoint: '',
  llmApiKey: '',
  llmTemperature: 0.7,
  llmMaxTokens: 8000,
  imageModel: 'default',
  imageApiKey: '',
  meshyApiKey: '',
  provider3d: 'programmatic',
  generationSettings: DEFAULT_GENERATION_SETTINGS,
  isActive: true,
};

// ============================================================================
// MASKING HELPERS
// ============================================================================

/**
 * Mask an API key, showing only the last 4 characters.
 * Returns '****' if key is too short to mask meaningfully.
 */
function maskApiKey(key: string | undefined | null): string {
  if (!key || key.length <= 4) return key ? '****' : '';
  return `****${key.slice(-4)}`;
}

/**
 * Check if a key value looks masked (starts with ****)
 */
function isMasked(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.startsWith('****');
}

// ============================================================================
// DB → DOMAIN MAPPING HELPER
// ============================================================================

/**
 * Convert a raw Prisma AiConfig row (where generationSettings is a JSON string)
 * into our AiConfigRecord shape with parsed generationSettings.
 */
function mapDbRowToRecord(row: {
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
  generationSettings: string;
  isActive: boolean;
  createdById: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}): AiConfigRecord {
  let parsedSettings: GenerationSettings;
  try {
    parsedSettings = typeof row.generationSettings === 'string'
      ? JSON.parse(row.generationSettings)
      : row.generationSettings;
  } catch {
    parsedSettings = DEFAULT_GENERATION_SETTINGS;
  }

  return {
    id: row.id,
    provider: row.provider,
    llmModel: row.llmModel,
    llmEndpoint: row.llmEndpoint,
    llmApiKey: row.llmApiKey,
    llmTemperature: row.llmTemperature,
    llmMaxTokens: row.llmMaxTokens,
    imageModel: row.imageModel,
    imageApiKey: row.imageApiKey,
    meshyApiKey: row.meshyApiKey,
    provider3d: row.provider3d,
    generationSettings: parsedSettings,
    isActive: row.isActive,
    createdById: row.createdById,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

// ============================================================================
// DENORMALIZE FOR FRONTEND
// ============================================================================

/**
 * Convert backend field names to frontend field names so the frontend
 * can use them directly. Also adds hasApiKey booleans.
 */
function denormalizeForFrontend(config: AiConfigRecord): Record<string, unknown> {
  return {
    id: config.id,
    provider: config.provider === 'zai_sdk' ? 'zai-sdk' : config.provider,
    llmModel: config.llmModel,
    apiKey: maskApiKey(config.llmApiKey),
    customEndpoint: config.llmEndpoint || '',
    temperature: config.llmTemperature ?? DEFAULT_CONFIG.llmTemperature,
    maxTokens: config.llmMaxTokens ?? DEFAULT_CONFIG.llmMaxTokens,
    imageModel: config.imageModel || DEFAULT_CONFIG.imageModel,
    imageApiKey: maskApiKey(config.imageApiKey),
    meshyApiKey: maskApiKey(config.meshyApiKey),
    provider3d: config.provider3d || 'programmatic',
    generationSettings: config.generationSettings || DEFAULT_GENERATION_SETTINGS,
    // Flatten generationSettings for frontend
    generateSystemDiagram: config.generationSettings?.includeSystemDiagram ?? true,
    generateDigitalTwin: config.generationSettings?.includeDigitalTwin ?? true,
    generateMachineImage: config.generationSettings?.includeMachineImage ?? true,
    generateSpareParts: config.generationSettings?.includeSpareParts ?? true,
    generateBom: config.generationSettings?.includeBOM ?? true,
    // Boolean flags so frontend knows keys are set
    hasApiKey: !!(config.llmApiKey && config.llmApiKey.length > 0),
    hasImageApiKey: !!(config.imageApiKey && config.imageApiKey.length > 0),
    hasMeshyApiKey: !!(config.meshyApiKey && config.meshyApiKey.length > 0),
  };
}

// ============================================================================
// VALIDATION
// ============================================================================

const VALID_PROVIDERS: AIProvider[] = ['zai_sdk', 'zai-sdk', 'zai-api', 'openai', 'anthropic', 'custom', 'gemini', 'groq', 'openrouter', 'cerebras'];

/**
 * Normalize the request body — accept both frontend field names (apiKey, temperature, etc.)
 * and backend field names (llmApiKey, llmTemperature, etc.). Returns a normalized body
 * that always uses the backend field names.
 */
function normalizeBody(body: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...body };
  // Normalize provider: frontend sends 'zai-sdk', backend uses 'zai_sdk'
  if (normalized.provider === 'zai-sdk') {
    normalized.provider = 'zai_sdk';
  }
  // Map frontend field names → backend field names
  if (normalized.apiKey !== undefined && normalized.llmApiKey === undefined) {
    normalized.llmApiKey = normalized.apiKey;
    delete normalized.apiKey;
  }
  if (normalized.customEndpoint !== undefined && normalized.llmEndpoint === undefined) {
    normalized.llmEndpoint = normalized.customEndpoint;
    delete normalized.customEndpoint;
  }
  if (normalized.temperature !== undefined && normalized.llmTemperature === undefined) {
    normalized.llmTemperature = normalized.temperature;
    delete normalized.temperature;
  }
  if (normalized.maxTokens !== undefined && normalized.llmMaxTokens === undefined) {
    normalized.llmMaxTokens = normalized.maxTokens;
    delete normalized.maxTokens;
  }
  return normalized;
}

function validateConfigBody(body: Record<string, unknown>): { valid: boolean; error?: string } {
  if (!body.provider || typeof body.provider !== 'string') {
    return { valid: false, error: 'provider is required and must be a string' };
  }
  if (!VALID_PROVIDERS.includes(body.provider as AIProvider)) {
    return { valid: false, error: `provider must be one of: ${VALID_PROVIDERS.join(', ')}` };
  }

  if (!body.llmModel || typeof body.llmModel !== 'string') {
    return { valid: false, error: 'llmModel is required and must be a string' };
  }

  if (body.llmEndpoint !== undefined && typeof body.llmEndpoint !== 'string') {
    return { valid: false, error: 'llmEndpoint must be a string' };
  }

  if (body.llmApiKey !== undefined && typeof body.llmApiKey !== 'string') {
    return { valid: false, error: 'llmApiKey must be a string' };
  }

  if (body.llmTemperature !== undefined) {
    const temp = Number(body.llmTemperature);
    if (isNaN(temp) || temp < 0 || temp > 2) {
      return { valid: false, error: 'llmTemperature must be a number between 0 and 2' };
    }
  }

  if (body.llmMaxTokens !== undefined) {
    const tokens = Number(body.llmMaxTokens);
    if (isNaN(tokens) || tokens < 1 || tokens > 128000) {
      return { valid: false, error: 'llmMaxTokens must be a number between 1 and 128000' };
    }
  }

  if (body.imageModel !== undefined && typeof body.imageModel !== 'string') {
    return { valid: false, error: 'imageModel must be a string' };
  }

  if (body.imageApiKey !== undefined && typeof body.imageApiKey !== 'string') {
    return { valid: false, error: 'imageApiKey must be a string' };
  }

  if (body.meshyApiKey !== undefined && typeof body.meshyApiKey !== 'string') {
    return { valid: false, error: 'meshyApiKey must be a string' };
  }

  if (body.provider3d !== undefined) {
    const valid3dProviders = ['programmatic', 'meshy', 'tripo3d'];
    if (typeof body.provider3d !== 'string' || !valid3dProviders.includes(body.provider3d)) {
      return { valid: false, error: `provider3d must be one of: ${valid3dProviders.join(', ')}` };
    }
  }

  return { valid: true };
}

// ============================================================================
// GET — Retrieve active AI config (or defaults)
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 },
      );
    }

    if (!hasPermission(session, 'system_settings.view') && !hasPermission(session, 'assets.view') && !isAdmin(session)) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions. Required: settings.view or assets.view' },
        { status: 403 },
      );
    }

    const activeRow = await db.aiConfig.findFirst({ where: { isActive: true } });

    if (!activeRow) {
      logger.info('No active AI config found in database, returning defaults');
      const defaultRecord: AiConfigRecord = {
        id: '',
        ...DEFAULT_CONFIG,
        createdById: '',
        createdAt: '',
        updatedAt: '',
      };
      return NextResponse.json({
        success: true,
        data: denormalizeForFrontend(defaultRecord),
        isDefault: true,
      });
    }

    const activeConfig = mapDbRowToRecord(activeRow);

    logger.info('Active AI config retrieved from database', { configId: activeConfig.id, provider: activeConfig.provider });
    return NextResponse.json({
      success: true,
      data: denormalizeForFrontend(activeConfig),
      isDefault: false,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to read AI configuration';
    logger.error('GET /api/ai/config failed', { message });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// ============================================================================
// POST — Save / Update AI configuration
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 },
      );
    }

    if (!hasPermission(session, 'system_settings.update') && !isAdmin(session)) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions. Required: settings.update' },
        { status: 403 },
      );
    }

    const rawBody = await request.json();
    const body = normalizeBody(rawBody);

    logger.info('POST /api/ai/config — incoming body after normalize', {
      hasLlmApiKey: !!body.llmApiKey,
      provider: body.provider,
      llmModel: body.llmModel,
      storage: 'database',
    });

    const validation = validateConfigBody(body);
    if (!validation.valid) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    }

    // Find existing active config in DB to preserve its API keys if needed
    const existingActiveRow = await db.aiConfig.findFirst({ where: { isActive: true } });
    const existingActive = existingActiveRow ? mapDbRowToRecord(existingActiveRow) : null;

    /**
     * API KEY PRESERVATION LOGIC:
     * 1. If incoming key is a real (non-masked) value → use it
     * 2. If incoming key is empty/masked/missing → preserve existing key
     * 3. If existing key is also masked (corrupted from old bug) → discard it
     * 4. If no real key anywhere → keep empty string
     */
    const incomingLlmApiKey = (body.llmApiKey as string) || '';
    const incomingImageApiKey = (body.imageApiKey as string) || '';
    const incomingMeshyApiKey = (body.meshyApiKey as string) || '';

    // Helper: get a safe (non-masked) existing key
    const getExistingKey = (key: string | undefined): string => {
      if (key && !isMasked(key)) return key;
      return '';
    };

    const finalLlmApiKey = (incomingLlmApiKey && !isMasked(incomingLlmApiKey))
      ? incomingLlmApiKey
      : getExistingKey(existingActive?.llmApiKey);

    const finalImageApiKey = (incomingImageApiKey && !isMasked(incomingImageApiKey))
      ? incomingImageApiKey
      : getExistingKey(existingActive?.imageApiKey);

    const finalMeshyApiKey = (incomingMeshyApiKey && !isMasked(incomingMeshyApiKey))
      ? incomingMeshyApiKey
      : getExistingKey(existingActive?.meshyApiKey);

    // Deactivate any existing active config in the database
    await db.aiConfig.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });
    if (existingActive) {
      logger.info('Deactivated previous AI config in database', { configId: existingActive.id });
    }

    // Build merged generationSettings
    const mergedSettings: GenerationSettings = {
      ...(existingActive?.generationSettings || DEFAULT_GENERATION_SETTINGS),
      ...(body.generationSettings || {}),
    };

    // Create new active config record in the database
    const newRecord = await db.aiConfig.create({
      data: {
        provider: body.provider as string,
        llmModel: body.llmModel as string,
        llmEndpoint: (body.llmEndpoint as string) || '',
        llmApiKey: finalLlmApiKey,
        llmTemperature: body.llmTemperature !== undefined ? Number(body.llmTemperature) : (existingActive?.llmTemperature ?? DEFAULT_CONFIG.llmTemperature),
        llmMaxTokens: body.llmMaxTokens !== undefined ? Number(body.llmMaxTokens) : (existingActive?.llmMaxTokens ?? DEFAULT_CONFIG.llmMaxTokens),
        imageModel: (body.imageModel as string) || (existingActive?.imageModel || DEFAULT_CONFIG.imageModel),
        imageApiKey: finalImageApiKey,
        meshyApiKey: finalMeshyApiKey,
        provider3d: (body.provider3d as string) || (existingActive?.provider3d || 'programmatic'),
        generationSettings: JSON.stringify(mergedSettings),
        isActive: true,
        createdById: session.userId,
      },
    });

    const configRecord = mapDbRowToRecord(newRecord);

    logger.info('AI config written to database', {
      configId: configRecord.id,
      savedHasLlmKey: !!configRecord.llmApiKey,
      savedKeyLength: configRecord.llmApiKey.length,
    });

    // Invalidate client-side cache so next AI call picks up the new config
    invalidateAIConfigCache();

    // Audit log
    await createAuditLog(session.userId, 'AiConfig', 'create', configRecord.id, {
      newValues: {
        provider: configRecord.provider,
        llmModel: configRecord.llmModel,
        llmTemperature: configRecord.llmTemperature,
        llmMaxTokens: configRecord.llmMaxTokens,
        imageModel: configRecord.imageModel,
        provider3d: configRecord.provider3d,
      },
    });

    logger.info('AI config saved successfully', {
      configId: configRecord.id,
      provider: configRecord.provider,
      llmModel: configRecord.llmModel,
      hasLlmKey: !!configRecord.llmApiKey,
      hasImageKey: !!configRecord.imageApiKey,
    });

    return NextResponse.json({
      success: true,
      data: denormalizeForFrontend(configRecord),
      _diag: {
        codeVersion: CODE_VERSION,
        storage: 'database',
        savedKeyLength: configRecord.llmApiKey.length,
        savedKeyEmpty: !configRecord.llmApiKey,
        savedKeyMasked: isMasked(configRecord.llmApiKey),
        incomingKeyLength: incomingLlmApiKey.length,
        finalKeyLength: finalLlmApiKey.length,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save AI configuration';
    logger.error('POST /api/ai/config failed', { message });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// ============================================================================
// PATCH /api/ai/config — Diagnostic endpoint (DB status + legacy file check)
// ============================================================================

export async function PATCH() {
  try {
    const debugInfo: Record<string, unknown> = {
      storage: 'database',
      codeVersion: CODE_VERSION,
    };

    // Query the active config from the database
    const activeRow = await db.aiConfig.findFirst({ where: { isActive: true } });

    if (activeRow) {
      const rawKey = activeRow.llmApiKey || '';
      debugInfo.dbActiveConfig = {
        configId: activeRow.id,
        provider: activeRow.provider,
        llmModel: activeRow.llmModel,
        llmKeyStatus: rawKey
          ? (rawKey.startsWith('****')
              ? `MASKED_LEAK (${rawKey.length} chars) BUG!`
              : `REAL_KEY (${rawKey.length} chars)`)
          : 'EMPTY',
        llmTemperature: activeRow.llmTemperature,
        llmMaxTokens: activeRow.llmMaxTokens,
        imageModel: activeRow.imageModel,
        imageKeyStatus: activeRow.imageApiKey
          ? (activeRow.imageApiKey.startsWith('****')
              ? `MASKED_LEAK (${activeRow.imageApiKey.length} chars) BUG!`
              : `REAL_KEY (${activeRow.imageApiKey.length} chars)`)
          : 'EMPTY',
        meshyKeyStatus: activeRow.meshyApiKey
          ? (activeRow.meshyApiKey.startsWith('****')
              ? `MASKED_LEAK (${activeRow.meshyApiKey.length} chars) BUG!`
              : `REAL_KEY (${activeRow.meshyApiKey.length} chars)`)
          : 'EMPTY',
      };
    } else {
      debugInfo.dbActiveConfig = { status: 'no_active_config' };
    }

    // Also check if the old JSON file still exists and report on it
    try {
      const legacyPath = join(resolveDataDir(), 'ai-config.json');
      debugInfo.legacyFile = {
        path: legacyPath,
        exists: existsSync(legacyPath),
        resolvedDataDir: resolveDataDir(),
      };
    } catch {
      debugInfo.legacyFile = { error: 'failed to resolve legacy path' };
    }

    logger.info('[DEBUG] AI config diagnostic', debugInfo);
    return NextResponse.json({ success: true, debug: debugInfo });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Debug failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}