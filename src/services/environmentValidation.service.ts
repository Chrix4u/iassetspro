// ============================================================================
// ENVIRONMENT VALIDATION SERVICE
// Validates production environment configuration for iAssetsPro EAM
// ============================================================================

import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { db } from '@/lib/db';
import { getRedisClient } from '@/lib/redis';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  info: string[];
  score: number; // 0-100
}

export interface SingleCheck {
  name: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  passed: boolean;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const WEAK_SECRETS = [
  'secret',
  'password',
  '123456',
  'changeme',
  'default',
  'example',
  'test-secret',
  'my-secret',
  'nextauth-secret',
];

const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'NEXTAUTH_SECRET',
];

const OPTIONAL_ENV_VARS = [
  { name: 'SMTP_HOST', label: 'SMTP Host (for email notifications)' },
  { name: 'SMTP_PORT', label: 'SMTP Port' },
  { name: 'SMTP_USER', label: 'SMTP User' },
  { name: 'SMTP_PASS', label: 'SMTP Password' },
  { name: 'REDIS_URL', label: 'Redis URL (for caching & sessions)' },
  { name: 'MQTT_BROKER_URL', label: 'MQTT Broker URL (for IoT)' },
  { name: 'MQTT_USERNAME', label: 'MQTT Username' },
  { name: 'MQTT_PASSWORD', label: 'MQTT Password' },
  { name: 'FILE_UPLOAD_DIR', label: 'File Upload Directory' },
  { name: 'S3_BUCKET', label: 'S3 Bucket (object storage)' },
  { name: 'S3_REGION', label: 'S3 Region' },
];

const UPLOAD_DIR_DEFAULT = './uploads';

// ─── Validation Functions ──────────────────────────────────────────────────

/**
 * Check if DATABASE_URL is set and parseable.
 */
function checkDatabaseUrl(): SingleCheck {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return {
      name: 'DATABASE_URL',
      severity: 'error',
      message: 'DATABASE_URL environment variable is not set.',
      passed: false,
    };
  }

  // Production architecture is PostgreSQL-only. Do not accept legacy
  // MariaDB/MySQL/SQLite URLs as a valid configuration.
  try {
    const parsed = new URL(url);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
      return {
        name: 'DATABASE_URL',
        severity: 'error',
        message: `Unsupported database provider ${parsed.protocol || 'unknown'}; PostgreSQL is required.`,
        passed: false,
      };
    }

    return {
      name: 'DATABASE_URL',
      severity: 'info',
      message: 'DATABASE_URL is a valid PostgreSQL connection string.',
      passed: true,
    };
  } catch {
    return {
      name: 'DATABASE_URL',
      severity: 'error',
      message: 'DATABASE_URL is set but does not appear to be a valid connection string.',
      passed: false,
    };
  }
}

/**
 * Check if JWT_SECRET is set and not weak/default.
 */
function checkJwtSecret(): SingleCheck {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return {
      name: 'JWT_SECRET',
      severity: 'error',
      message: 'JWT_SECRET is not set. Authentication will not work.',
      passed: false,
    };
  }

  if (secret.length < 16) {
    return {
      name: 'JWT_SECRET',
      severity: 'warning',
      message: `JWT_SECRET is too short (${secret.length} chars). Minimum recommended: 32 characters.`,
      passed: false,
    };
  }

  const lowerSecret = secret.toLowerCase();
  const isWeak = WEAK_SECRETS.some(weak => lowerSecret.includes(weak));
  if (isWeak) {
    return {
      name: 'JWT_SECRET',
      severity: 'error',
      message: 'JWT_SECRET appears to be a weak or default value. Use a cryptographically strong random string.',
      passed: false,
    };
  }

  return {
    name: 'JWT_SECRET',
    severity: 'info',
    message: `JWT_SECRET is set and meets strength requirements (${secret.length} chars).`,
    passed: true,
  };
}

/**
 * Check if NEXTAUTH_SECRET is set.
 */
function checkNextauthSecret(): SingleCheck {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return {
      name: 'NEXTAUTH_SECRET',
      severity: 'error',
      message: 'NEXTAUTH_SECRET is not set. Session management may be insecure.',
      passed: false,
    };
  }

  if (secret.length < 16) {
    return {
      name: 'NEXTAUTH_SECRET',
      severity: 'warning',
      message: `NEXTAUTH_SECRET is too short (${secret.length} chars). Minimum recommended: 32 characters.`,
      passed: false,
    };
  }

  const lowerSecret = secret.toLowerCase();
  const isWeak = WEAK_SECRETS.some(weak => lowerSecret.includes(weak));
  if (isWeak) {
    return {
      name: 'NEXTAUTH_SECRET',
      severity: 'warning',
      message: 'NEXTAUTH_SECRET appears to be a weak or default value.',
      passed: false,
    };
  }

  return {
    name: 'NEXTAUTH_SECRET',
    severity: 'info',
    message: 'NEXTAUTH_SECRET is set and meets requirements.',
    passed: true,
  };
}

/**
 * Check SMTP configuration (optional but warn if missing).
 */
function checkSmtpConfig(): SingleCheck[] {
  const checks: SingleCheck[] = [];
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpHost) {
    checks.push({
      name: 'SMTP Configuration',
      severity: 'warning',
      message: 'SMTP_HOST is not configured. Email notifications (password reset, alerts) will not work.',
      passed: false,
    });
  } else {
    checks.push({
      name: 'SMTP Configuration',
      severity: 'info',
      message: `SMTP is configured (host: ${smtpHost}).`,
      passed: true,
    });

    if (!smtpUser || !smtpPass) {
      checks.push({
        name: 'SMTP Credentials',
        severity: 'warning',
        message: 'SMTP_USER or SMTP_PASS is not set. Authentication to SMTP server may fail.',
        passed: false,
      });
    }
  }

  return checks;
}

/**
 * Check Redis configuration (optional, warn if missing in production).
 */
function checkRedisConfig(): SingleCheck {
  const redisUrl = process.env.REDIS_URL;
  const isProduction = process.env.NODE_ENV === 'production';

  if (!redisUrl) {
    if (isProduction) {
      return {
        name: 'REDIS_URL',
        severity: 'warning',
        message: 'REDIS_URL is not set in production. Using in-memory cache (not suitable for multi-instance deployments).',
        passed: false,
      };
    }
    return {
      name: 'REDIS_URL',
      severity: 'info',
      message: 'REDIS_URL is not set. Using in-memory fallback cache.',
      passed: true,
    };
  }

  return {
    name: 'REDIS_URL',
    severity: 'info',
    message: 'REDIS_URL is configured.',
    passed: true,
  };
}

/**
 * Check MQTT broker settings (optional).
 */
function checkMqttConfig(): SingleCheck {
  const mqttUrl = process.env.MQTT_BROKER_URL;
  if (!mqttUrl) {
    return {
      name: 'MQTT Broker',
      severity: 'info',
      message: 'MQTT_BROKER_URL is not set. IoT device connectivity features will be unavailable.',
      passed: true, // Not required
    };
  }

  return {
    name: 'MQTT Broker',
    severity: 'info',
    message: `MQTT broker is configured (${mqttUrl}).`,
    passed: true,
  };
}

/**
 * Check file upload directory exists.
 */
function checkFileUploadDir(): SingleCheck {
  const uploadDir = process.env.FILE_UPLOAD_DIR || UPLOAD_DIR_DEFAULT;

  if (!existsSync(uploadDir)) {
    try {
      mkdirSync(uploadDir, { recursive: true });
      return {
        name: 'File Upload Directory',
        severity: 'info',
        message: `Upload directory did not exist and was created: ${uploadDir}`,
        passed: true,
      };
    } catch {
      return {
        name: 'File Upload Directory',
        severity: 'warning',
        message: `Upload directory does not exist and could not be created: ${uploadDir}`,
        passed: false,
      };
    }
  }

  return {
    name: 'File Upload Directory',
    severity: 'info',
    message: `Upload directory exists: ${uploadDir}`,
    passed: true,
  };
}

/**
 * Check required environment variables list.
 */
function checkRequiredEnvVars(): SingleCheck[] {
  return REQUIRED_ENV_VARS.map(varName => {
    const value = process.env[varName];
    if (!value) {
      return {
        name: varName,
        severity: 'error',
        message: `Required environment variable ${varName} is not set.`,
        passed: false,
      };
    }
    return {
      name: varName,
      severity: 'info',
      message: `${varName} is set.`,
      passed: true,
    };
  });
}

/**
 * Check optional environment variables and report which are missing.
 */
function checkOptionalEnvVars(): SingleCheck[] {
  return OPTIONAL_ENV_VARS.map(({ name, label }) => {
    const value = process.env[name];
    if (!value) {
      return {
        name: label,
        severity: 'warning',
        message: `${label} (${name}) is not configured.`,
        passed: false,
      };
    }
    return {
      name: label,
      severity: 'info',
      message: `${label} is configured.`,
      passed: true,
    };
  });
}

/**
 * Test database connectivity via Prisma client.
 */
async function checkDatabaseConnection(): Promise<SingleCheck> {
  try {
    await db.$queryRaw`SELECT 1`;
    return {
      name: 'Database Connection',
      severity: 'info',
      message: 'Successfully connected to the database.',
      passed: true,
    };
  } catch (error) {
    return {
      name: 'Database Connection',
      severity: 'error',
      message: `Failed to connect to database: ${error instanceof Error ? error.message : 'Unknown error'}`,
      passed: false,
    };
  }
}

/**
 * Test Redis connectivity via getRedisClient.
 */
async function checkRedisConnection(): Promise<SingleCheck> {
  try {
    const client = getRedisClient();
    const result = await client.ping();
    if (result) {
      return {
        name: 'Redis Connection',
        severity: 'info',
        message: `Redis is available (type: ${client.getType()}).`,
        passed: true,
      };
    }
    return {
      name: 'Redis Connection',
      severity: 'warning',
      message: 'Redis ping returned false.',
      passed: false,
    };
  } catch (error) {
    return {
      name: 'Redis Connection',
      severity: 'warning',
      message: `Redis connectivity check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      passed: false,
    };
  }
}

// ─── Main Validation Function ──────────────────────────────────────────────

/**
 * Run all environment validation checks and return a comprehensive report.
 *
 * @returns Validation result with errors, warnings, info, and a score (0-100).
 */
export async function validateAll(): Promise<ValidationResult> {
  const checks: SingleCheck[] = [];

  // Static checks (synchronous)
  checks.push(checkDatabaseUrl());
  checks.push(checkJwtSecret());
  checks.push(checkNextauthSecret());
  checks.push(...checkSmtpConfig());
  checks.push(checkRedisConfig());
  checks.push(checkMqttConfig());
  checks.push(checkFileUploadDir());
  checks.push(...checkRequiredEnvVars());
  checks.push(...checkOptionalEnvVars());

  // Async checks (connectivity)
  try {
    const [dbCheck, redisCheck] = await Promise.allSettled([
      checkDatabaseConnection(),
      checkRedisConnection(),
    ]);

    if (dbCheck.status === 'fulfilled') checks.push(dbCheck.value);
    if (redisCheck.status === 'fulfilled') checks.push(redisCheck.value);
  } catch {
    // Connectivity checks are best-effort
  }

  // Aggregate results
  const errors = checks.filter(c => c.severity === 'error' && !c.passed);
  const warnings = checks.filter(c => c.severity === 'warning' && !c.passed);
  const info = checks.filter(c => c.passed);

  // Calculate score: start at 100, subtract for each failure
  let score = 100;
  score -= errors.length * 20;  // Each error costs 20 points
  score -= warnings.length * 5;  // Each warning costs 5 points
  score = Math.max(0, Math.min(100, score));

  return {
    valid: errors.length === 0,
    errors: errors.map(e => `[${e.name}] ${e.message}`),
    warnings: warnings.map(w => `[${w.name}] ${w.message}`),
    info: info.map(i => i.message),
    score,
  };
}

/**
 * Get the application version from package.json.
 */
export function getAppVersion(): string {
  try {
    const packageJson = readFileSync(join(process.cwd(), 'package.json'), 'utf-8');
    return JSON.parse(packageJson).version || 'unknown';
  } catch {
    return 'unknown';
  }
}
