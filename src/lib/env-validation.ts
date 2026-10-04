// ============================================================================
// ENVIRONMENT VALIDATION — Startup checks for security misconfigurations
// ============================================================================

import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';

const logger = createLogger('envValidation');

// ── Types ───────────────────────────────────────────────────────────────────

export interface ValidationIssue {
  /** Category of the issue (e.g., 'critical', 'warning', 'info'). */
  severity: 'critical' | 'warning' | 'info';
  /** Human-readable description of the issue. */
  message: string;
  /** The environment variable or setting that caused the issue. */
  key?: string;
  /** The actual value detected (will be masked for secrets). */
  value?: string;
  /** Suggested fix. */
  suggestion?: string;
}

export interface ValidationResult {
  /** Whether all critical checks passed. */
  valid: boolean;
  /** Node.js environment. */
  nodeEnv: string;
  /** Timestamp of validation. */
  validatedAt: string;
  /** List of all issues found. */
  issues: ValidationIssue[];
  /** Only critical issues. */
  criticalIssues: ValidationIssue[];
  /** Total count of issues by severity. */
  counts: { critical: number; warning: number; info: number };
  /** Whether database connectivity was verified. */
  dbConnected: boolean;
}

// ── Required Environment Variables ──────────────────────────────────────────

const REQUIRED_VARS: Array<{ key: string; description: string; critical: boolean }> = [
  { key: 'DATABASE_URL', description: 'Database connection URL', critical: true },
  { key: 'NEXTAUTH_SECRET', description: 'NextAuth.js secret for session encryption', critical: true },
];

const RECOMMENDED_VARS: Array<{ key: string; description: string }> = [
  { key: 'NEXTAUTH_URL', description: 'Canonical URL of the application' },
  { key: 'JWT_SECRET', description: 'JWT signing secret (separate from NEXTAUTH_SECRET)' },
  { key: 'ENCRYPTION_KEY', description: 'Encryption key for sensitive data' },
];

// ── Default/Weak Value Detection ────────────────────────────────────────────

const WEAK_SECRETS = new Set([
  'secret',
  'password',
  '123456',
  '12345678',
  'admin',
  'root',
  'default',
  'changeme',
  'test',
  'development',
  'nextauth-secret',
  'your-secret-here',
  'your-nextauth-secret',
  'super-secret',
  'my-secret',
  'keyboard-cat',
]);

const SHORT_SECRET_THRESHOLD = 24;

// ── Validation Checks ───────────────────────────────────────────────────────

/** Check for required environment variables. */
function checkRequiredVars(): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const { key, description, critical } of REQUIRED_VARS) {
    const value = process.env[key];
    if (!value) {
      issues.push({
        severity: critical ? 'critical' : 'warning',
        message: `Required environment variable ${key} (${description}) is not set`,
        key,
        suggestion: `Set ${key} in your .env file or deployment environment`,
      });
    }
  }

  for (const { key, description } of RECOMMENDED_VARS) {
    const value = process.env[key];
    if (!value) {
      issues.push({
        severity: 'warning',
        message: `Recommended environment variable ${key} (${description}) is not set`,
        key,
        suggestion: `Consider setting ${key} for enhanced security`,
      });
    }
  }

  return issues;
}

/** Check for default or weak secret values. */
function checkWeakSecrets(): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const secretKeys = [
    'NEXTAUTH_SECRET',
    'JWT_SECRET',
    'ENCRYPTION_KEY',
    'DATABASE_URL',
  ];

  for (const key of secretKeys) {
    const value = process.env[key];
    if (!value) continue;

    // Check for known weak values
    if (WEAK_SECRETS.has(value.toLowerCase())) {
      issues.push({
        severity: 'critical',
        message: `${key} uses a known insecure default value — this is a critical security risk`,
        key,
        value: maskValue(value),
        suggestion: `Generate a cryptographically random value: openssl rand -base64 48`,
      });
    }

    // Check for short secrets (only for non-URL values)
    if (key !== 'DATABASE_URL' && value.length < SHORT_SECRET_THRESHOLD) {
      issues.push({
        severity: 'warning',
        message: `${key} is shorter than recommended ${SHORT_SECRET_THRESHOLD} characters (${value.length} chars)`,
        key,
        value: maskValue(value),
        suggestion: `Use at least ${SHORT_SECRET_THRESHOLD} characters for ${key}`,
      });
    }
  }

  // Check for default NEXTAUTH_SECRET
  const nextauthSecret = process.env.NEXTAUTH_SECRET;
  if (nextauthSecret === 'development-secret-change-me' || nextauthSecret === 'YOUR_NEXTAUTH_SECRET_HERE') {
    issues.push({
      severity: 'critical',
      message: 'NEXTAUTH_SECRET is set to a well-known development default — must be changed in production',
      key: 'NEXTAUTH_SECRET',
      suggestion: 'Generate a unique secret: openssl rand -base64 48',
    });
  }

  return issues;
}

/** Check for development-only settings in production. */
function checkDevSettingsInProduction(): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nodeEnv = process.env.NODE_ENV;

  if (nodeEnv !== 'production') {
    issues.push({
      severity: 'info',
      message: `Running in ${nodeEnv || 'undefined'} mode — not a production deployment`,
      key: 'NODE_ENV',
      value: nodeEnv || '(not set)',
    });
    return issues;
  }

  // In production, check for dangerous dev settings
  if (process.env.DEBUG === 'true' || process.env.DEBUG === '1') {
    issues.push({
      severity: 'warning',
      message: 'DEBUG mode is enabled in production — this may expose sensitive information',
      key: 'DEBUG',
      suggestion: 'Disable DEBUG in production',
    });
  }

  if (process.env.VERBOSITY === 'debug' || process.env.LOG_LEVEL === 'debug') {
    issues.push({
      severity: 'warning',
      message: 'Debug logging is enabled in production — logs may contain sensitive data',
      key: process.env.VERBOSITY ? 'VERBOSITY' : 'LOG_LEVEL',
      suggestion: 'Set log level to "info" or "warn" in production',
    });
  }

  // Check for CORS wildcard in production
  const corsOrigin = process.env.CORS_ORIGIN || process.env.NEXT_PUBLIC_APP_URL;
  if (corsOrigin === '*' || corsOrigin?.includes('*')) {
    issues.push({
      severity: 'critical',
      message: 'CORS origin is set to wildcard (*) in production — restrict to specific domains',
      key: corsOrigin === process.env.CORS_ORIGIN ? 'CORS_ORIGIN' : 'NEXT_PUBLIC_APP_URL',
      suggestion: 'Set CORS_ORIGIN to your application\'s specific domain(s)',
    });
  }

  return issues;
}

/** Check for potentially insecure database configuration. */
function checkDatabaseConfig(): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const dbUrl = process.env.DATABASE_URL || '';

  // Check for SQLite in production (if explicitly set)
  if (process.env.NODE_ENV === 'production' && dbUrl.startsWith('file:')) {
    issues.push({
      severity: 'warning',
      message: 'Using SQLite in production — migrate to PostgreSQL for supported production durability',
      key: 'DATABASE_URL',
      suggestion: 'Configure a PostgreSQL connection for production',
    });
  }

  // Check for exposed DB credentials in URL
  if (/^postgres(?:ql)?:\/\//i.test(dbUrl)) {
    try {
      const url = new URL(dbUrl);
      if (url.password === '' || url.password === 'password' || url.password === 'root') {
        issues.push({
          severity: 'critical',
          message: 'Database password in DATABASE_URL is empty or uses a weak default',
          key: 'DATABASE_URL',
          suggestion: 'Set a strong database password',
        });
      }
    } catch {
      // Invalid URL format
      issues.push({
        severity: 'warning',
        message: 'DATABASE_URL has an invalid format',
        key: 'DATABASE_URL',
      });
    }
  }

  return issues;
}

/** Validate database connectivity. */
async function checkDatabaseConnectivity(): Promise<{ connected: boolean; issue?: ValidationIssue }> {
  try {
    // Attempt a simple query to verify connectivity
    await db.$queryRaw`SELECT 1 as ok`;
    return { connected: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      connected: false,
      issue: {
        severity: 'critical',
        message: `Database connectivity check failed: ${message}`,
        key: 'DATABASE_URL',
        suggestion: 'Verify database is running and credentials are correct',
      },
    };
  }
}

/** Mask a secret value for safe display. */
function maskValue(value: string): string {
  if (!value || value.length <= 4) return '••••';
  if (value.length <= 12) {
    return value.slice(0, 2) + '••••' + value.slice(-2);
  }
  return value.slice(0, 4) + '••••' + value.slice(-4);
}

// ── Main Validation Function ────────────────────────────────────────────────

/** Track whether validation has been run to avoid repeated DB checks. */
let _validationResult: ValidationResult | null = null;
let _validationTime = 0;
const VALIDATION_CACHE_MS = 5 * 60 * 1000; // Cache for 5 minutes

/**
 * Validate the application environment for security and configuration issues.
 *
 * Checks:
 * 1. Required environment variables are present
 * 2. No default or weak secret values
 * 3. Development-only settings not in production
 * 4. Database connectivity
 * 5. Database configuration security
 *
 * Results are cached for 5 minutes to avoid repeated DB checks.
 *
 * @returns ValidationResult with all issues found.
 */
export async function validateEnvironment(): Promise<ValidationResult> {
  // Return cached result if fresh
  if (_validationResult && Date.now() - _validationTime < VALIDATION_CACHE_MS) {
    return _validationResult;
  }

  const nodeEnv = process.env.NODE_ENV || 'development';
  const issues: ValidationIssue[] = [];

  // Run all checks
  issues.push(...checkRequiredVars());
  issues.push(...checkWeakSecrets());
  issues.push(...checkDevSettingsInProduction());
  issues.push(...checkDatabaseConfig());

  // Database connectivity check (async)
  const dbResult = await checkDatabaseConnectivity();
  if (!dbResult.connected && dbResult.issue) {
    issues.push(dbResult.issue);
  }

  // Sort issues by severity (critical first)
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const criticalIssues = issues.filter(i => i.severity === 'critical');
  const counts = {
    critical: criticalIssues.length,
    warning: issues.filter(i => i.severity === 'warning').length,
    info: issues.filter(i => i.severity === 'info').length,
  };

  const result: ValidationResult = {
    valid: counts.critical === 0 && dbResult.connected,
    nodeEnv,
    validatedAt: new Date().toISOString(),
    issues,
    criticalIssues,
    counts,
    dbConnected: dbResult.connected,
  };

  // Cache the result
  _validationResult = result;
  _validationTime = Date.now();

  // Log summary
  if (result.valid) {
    logger.info('Environment validation passed', {
      nodeEnv,
      dbConnected: dbResult.connected,
      warnings: counts.warning,
      info: counts.info,
    });
  } else {
    logger.error('Environment validation FAILED', {
      nodeEnv,
      criticalIssues: counts.critical,
      dbConnected: dbResult.connected,
    });
    for (const issue of criticalIssues) {
      logger.error(`[ENV] ${issue.message}`, { key: issue.key });
    }
  }

  return result;
}

/**
 * Get the cached validation result without re-checking DB.
 * Useful for middleware that shouldn't block on DB queries.
 */
export function getCachedValidation(): ValidationResult | null {
  if (!_validationResult) return null;
  return _validationResult;
}

/**
 * Force re-validation (clear cache).
 */
export function invalidateValidationCache(): void {
  _validationResult = null;
  _validationTime = 0;
}
