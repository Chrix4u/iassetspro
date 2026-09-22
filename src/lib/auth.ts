import { db } from '@/lib/db';
import { randomUUID } from 'crypto';
import { createLogger } from '@/lib/logger';

const logger = createLogger('auth');

// ============================================================================
// SESSION MANAGEMENT — DB-backed with in-memory LRU cache
// ============================================================================

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// In-memory cache for fast token lookups (avoids DB query on every API call)
const globalForSessions = globalThis as unknown as {
  sessionCache: Map<string, { data: SessionData; cachedAt: number }> | undefined;
};

if (!globalForSessions.sessionCache) {
  globalForSessions.sessionCache = new Map();
}
export const sessionCache = globalForSessions.sessionCache;

// Maximum cache entries before cleanup
const MAX_CACHE_SIZE = 500;
const CACHE_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

export interface SessionData {
  userId: string;
  username: string;
  fullName: string;     // user's display name for notifications
  roles: string[];       // role slugs
  permissions: string[]; // permission slugs
  createdAt: Date;
}

// Generate a simple auth token (UUID-based)
export function generateToken(): string {
  return randomUUID();
}

// Create a session after successful login — persists to DB + caches in memory
export async function createSession(userId: string): Promise<{ token: string; session: SessionData }> {
  // Fetch user with roles, permissions, and plant access
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      userRoles: {
        include: {
          role: {
            include: {
              rolePermissions: {
                include: { permission: true },
              },
            },
          },
        },
      },
      directPerms: {
        include: { permission: true },
      },
    },
  });

  if (!user) throw new Error('User not found');

  // Collect role-based permissions
  const roleSlugsSet = new Set<string>();
  const permissionSlugsSet = new Set<string>();

  for (const ur of (user.userRoles || [])) {
    roleSlugsSet.add(ur.role.slug);
    for (const rp of (ur.role.rolePermissions || [])) {
      permissionSlugsSet.add(rp.permission.slug);
    }
  }

  // Apply direct permission overrides
  for (const up of (user.directPerms || [])) {
    // Check expiry first
    if (up.expiresAt && new Date(up.expiresAt) < new Date()) {
      permissionSlugsSet.delete(up.permission.slug);
      continue;
    }
    if (up.isGranted) {
      permissionSlugsSet.add(up.permission.slug);
    } else {
      permissionSlugsSet.delete(up.permission.slug);
    }
  }

  // Admin role gets ALL permissions
  if (roleSlugsSet.has('admin')) {
    const allPermissions = await db.permission.findMany({ select: { slug: true } });
    for (const p of allPermissions) {
      permissionSlugsSet.add(p.slug);
    }
  }

  const uniquePermissions = [...permissionSlugsSet];
  const uniqueRoles = [...roleSlugsSet];

  const token = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  const sessionData: SessionData = {
    userId: user.id,
    username: user.username,
    fullName: user.fullName || user.username,
    roles: uniqueRoles,
    permissions: uniquePermissions,
    createdAt: now,
  };

  // Persist to database
  await db.session.create({
    data: {
      token,
      userId: user.id,
      roles: JSON.stringify(uniqueRoles),
      permissions: JSON.stringify(uniquePermissions),
      expiresAt,
    },
  });

  // Cache in memory
  sessionCache.set(token, { data: sessionData, cachedAt: Date.now() });

  // Cleanup expired DB sessions (non-blocking, best-effort)
  cleanupExpiredSessions().catch(() => {});

  return { token, session: sessionData };
}

// Cache-only session lookup for synchronous legacy callers.
// Prefer getRequestSession() in async API handlers so persisted sessions can
// self-heal after server restarts / cold instances.
export function getSession(request: Request): SessionData | null {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) return null;

  // 1. Check in-memory cache first (fast path)
  const cached = sessionCache.get(token);
  if (cached) {
    // Verify not expired
    const age = Date.now() - cached.cachedAt;
    if (age > SESSION_TTL_MS) {
      sessionCache.delete(token);
      return null;
    }
    return cached.data;
  }

  // 2. Fallback: synchronous return null (DB lookup is async, handled by middleware)
  // The middleware already validated the token, so route handlers can rely on getSession
  // returning the cached data. If cache is cold, the middleware populates it.
  return null;
}

// Get session from token directly (async, used by middleware)
/**
 * Resolve a session directly from an API request.
 *
 * Unlike getSession(), this self-heals after server restarts / cold instances by
 * falling back to the persisted session table when the in-memory cache is empty.
 * API route handlers should prefer this helper when they can await.
 */
export async function getRequestSession(request: Request): Promise<SessionData | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;

  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  const token = match?.[1]?.trim();
  if (!token) return null;

  return getSessionAsync(token);
}

export async function getSessionAsync(token: string): Promise<SessionData | null> {
  // 1. Check in-memory cache
  const cached = sessionCache.get(token);
  if (cached) {
    const age = Date.now() - cached.cachedAt;
    if (age > SESSION_TTL_MS) {
      sessionCache.delete(token);
      return null;
    }
    // Update lastSeen in DB (fire-and-forget)
    updateLastSeen(token).catch(() => {});
    return cached.data;
  }

  // 2. Look up in database
  const dbSession = await db.session.findUnique({
    where: { token },
  });

  if (!dbSession) return null;

  // Check expiry
  if (new Date(dbSession.expiresAt) < new Date()) {
    await db.session.delete({ where: { id: dbSession.id } }).catch(() => {});
    return null;
  }

  // Parse JSON fields
  let roles: string[] = [];
  let permissions: string[] = [];
  try {
    roles = JSON.parse(dbSession.roles);
    permissions = JSON.parse(dbSession.permissions);
  } catch {
    return null;
  }

  // Look up fullName from User table (not stored in Session DB row)
  let fullName = '';
  try {
    const userRecord = await db.user.findUnique({
      where: { id: dbSession.userId },
      select: { fullName: true, username: true },
    });
    fullName = userRecord?.fullName || userRecord?.username || '';
  } catch { /* ignore */ }

  const sessionData: SessionData = {
    userId: dbSession.userId,
    username: fullName.split(' ')[0] || '', // first name or username
    fullName,
    roles,
    permissions,
    createdAt: dbSession.createdAt,
  };

  // Populate cache
  sessionCache.set(token, { data: sessionData, cachedAt: Date.now() });

  // Evict old entries if cache is too large
  if (sessionCache.size > MAX_CACHE_SIZE) {
    const entries = [...sessionCache.entries()].sort((a, b) => a[1].cachedAt - b[1].cachedAt);
    for (let i = 0; i < entries.length / 2; i++) {
      sessionCache.delete(entries[i][0]);
    }
  }

  // Update lastSeen (fire-and-forget)
  updateLastSeen(token).catch(() => {});

  return sessionData;
}

// Delete session (logout)
export async function deleteSession(token: string): Promise<void> {
  // Remove from cache
  sessionCache.delete(token);

  // Remove from database
  try {
    await db.session.deleteMany({ where: { token } });
  } catch {
    // Silently fail — cache is already cleared
  }
}

// Cleanup expired sessions from DB (runs periodically)
async function cleanupExpiredSessions(): Promise<void> {
  try {
    const result = await db.session.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    // Silently cleaned up expired sessions
  } catch {
    // Silently fail
  }
}

// Update lastSeen timestamp (fire-and-forget)
async function updateLastSeen(token: string): Promise<void> {
  try {
    await db.session.update({
      where: { token },
      data: { lastSeen: new Date() },
    });
  } catch {
    // Silently fail
  }
}

// Check if user has a specific permission
export function hasPermission(session: SessionData, permissionSlug: string): boolean {
  return session.permissions.includes(permissionSlug);
}

// Check if user has any of the given permissions
export function hasAnyPermission(session: SessionData, permissionSlugs: string[]): boolean {
  return permissionSlugs.some((s) => session.permissions.includes(s));
}

// Check if user has a specific role
export function hasRole(session: SessionData, roleSlug: string): boolean {
  return session.roles.includes(roleSlug);
}

// Check if user is admin
export function isAdmin(session: SessionData): boolean {
  return session.roles.includes('admin');
}

// Get primary plant for user
export async function getUserPlantId(userId: string): Promise<string | null> {
  const userPlant = await db.userPlant.findFirst({
    where: { userId, isPrimary: true },
  });
  return userPlant?.plantId ?? null;
}

// ============================================================================
// CONVENIENCE — getCurrentUser for route handlers
// ============================================================================

export interface CurrentUser {
  id: string;
  username: string;
  fullName: string;
  roles: string[];
  permissions: string[];
}

/**
 * Get the current authenticated user from the request.
 * Wraps getSession() and returns a normalized user object with `id` field.
 * Returns null if not authenticated.
 */
export async function getCurrentUser(request: Request): Promise<CurrentUser | null> {
  const session = await getRequestSession(request);
  if (!session) return null;
  return {
    id: session.userId,
    username: session.username,
    fullName: session.fullName,
    roles: session.roles,
    permissions: session.permissions,
  };
}

// Populate session cache on server startup (warm cache from DB)
export async function warmSessionCache(): Promise<void> {
  try {
    const activeSessions = await db.session.findMany({
      where: { expiresAt: { gt: new Date() } },
    });

    // Batch-load all user fullNames to avoid N+1 queries
    const userIds = [...new Set(activeSessions.map(s => s.userId))];
    const users = await db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, fullName: true, username: true },
    });
    const userMap = new Map(users.map(u => [u.id, u.fullName || u.username || '']));

    for (const s of activeSessions) {
      let roles: string[] = [];
      let permissions: string[] = [];
      try {
        roles = JSON.parse(s.roles);
        permissions = JSON.parse(s.permissions);
      } catch {
        continue;
      }

      const fullName = userMap.get(s.userId) || '';

      sessionCache.set(s.token, {
        data: {
          userId: s.userId,
          username: fullName.split(' ')[0] || '',
          fullName,
          roles,
          permissions,
          createdAt: s.createdAt,
        },
        cachedAt: Date.now(),
      });
    }

    // Session cache warmed successfully
  } catch {
    // Silently fail — DB may not be ready during cold start
  }
}

// ============================================================================
// TOKEN ROTATION ARCHITECTURE
// Refresh token rotation, token family tracking, absolute expiry, binding
// ============================================================================

/** Max absolute session duration regardless of refresh (7 days). */
const ABSOLUTE_SESSION_MAX_MS = 7 * 24 * 60 * 60 * 1000;

/** In-memory token family store for reuse detection. */
const globalForTokenRotation = globalThis as unknown as {
  _tokenFamilies: Map<string, TokenFamilyRecord> | undefined;
};

if (!globalForTokenRotation._tokenFamilies) {
  globalForTokenRotation._tokenFamilies = new Map();
}
const tokenFamilies = globalForTokenRotation._tokenFamilies;

/** Tracks a chain of tokens issued from the same initial authentication. */
interface TokenFamilyRecord {
  /** The family ID (tied to the initial login session). */
  familyId: string;
  /** Set of token IDs that have been issued and invalidated in this family. */
  usedTokenIds: Set<string>;
  /** The currently active (latest) token ID in this family. */
  activeTokenId: string | null;
  /** Whether the entire family has been revoked (reuse detected). */
  revoked: boolean;
  /** Timestamp when the family was created. */
  createdAt: number;
  /** Timestamp when the family was last rotated. */
  lastRotatedAt: number;
}

interface RotateResult {
  /** The new token. */
  newToken: string;
  /** The new session data. */
  session: SessionData;
  /** Whether this rotation detected reuse (family was already revoked). */
  reuseDetected: boolean;
}

/**
 * Rotate a refresh token: issue a new one and invalidate the old.
 * Implements token family tracking to detect refresh token reuse attacks.
 *
 * When a previously-used refresh token is presented again, it indicates
 * a token theft scenario. In response, the entire token family is revoked,
 * forcing the legitimate user to re-authenticate.
 */
export async function rotateRefreshToken(
  oldToken: string,
  userAgent?: string,
  ipAddress?: string,
): Promise<RotateResult> {
  // Validate the old token
  const oldSession = await getSessionAsync(oldToken);
  if (!oldSession) {
    logger.warn('Token rotation failed: old token invalid or expired');
    return { newToken: '', session: oldSession!, reuseDetected: false };
  }

  // Check absolute session expiry
  const now = Date.now();
  const sessionAge = now - oldSession.createdAt.getTime();
  if (sessionAge > ABSOLUTE_SESSION_MAX_MS) {
    logger.warn('Token rotation rejected: absolute session max exceeded', {
      userId: oldSession.userId,
      sessionAgeMs: sessionAge,
      maxMs: ABSOLUTE_SESSION_MAX_MS,
    });
    await deleteSession(oldToken);
    return { newToken: '', session: oldSession, reuseDetected: false };
  }

  // Look up or create token family
  let family = tokenFamilies.get(oldToken);
  if (!family) {
    // First rotation for this token — create a new family
    family = {
      familyId: `tf-${randomUUID().slice(0, 12)}`,
      usedTokenIds: new Set([oldToken]),
      activeTokenId: oldToken,
      revoked: false,
      createdAt: now,
      lastRotatedAt: now,
    };
    tokenFamilies.set(oldToken, family);
  }

  // ── Reuse Detection ────────────────────────────────────────────────────
  // If the family is already revoked, or the old token is not the active one,
  // we have detected reuse. Revoke the entire family.
  if (family.revoked) {
    logger.error('Token reuse detected: family already revoked', {
      familyId: family.familyId,
      userId: oldSession.userId,
    });
    await revokeTokenFamily(family.familyId);
    return { newToken: '', session: oldSession, reuseDetected: true };
  }

  if (family.activeTokenId !== oldToken) {
    // The presented token is NOT the latest — someone is reusing an old token
    logger.error('Token reuse detected: stale token presented', {
      familyId: family.familyId,
      userId: oldSession.userId,
      presentedToken: oldToken.slice(0, 8),
      expectedToken: family.activeTokenId?.slice(0, 8),
    });
    // Revoke the entire family
    family.revoked = true;
    await revokeTokenFamily(family.familyId);
    // Invalidate old session
    sessionCache.delete(oldToken);
    try {
      await db.session.deleteMany({ where: { token: oldToken } });
    } catch { /* ignore */ }
    return { newToken: '', session: oldSession, reuseDetected: true };
  }

  // ── Rotate ─────────────────────────────────────────────────────────────
  // Mark the old token as used
  family.usedTokenIds.add(oldToken);

  // Delete the old session from DB and cache
  sessionCache.delete(oldToken);
  try {
    await db.session.deleteMany({ where: { token: oldToken } });
  } catch { /* ignore */ }

  // Create a new session
  const { token: newToken, session } = await createSession(oldSession.userId);

  // Update family record
  family.usedTokenIds.add(newToken);
  family.activeTokenId = newToken;
  family.lastRotatedAt = now;

  // Re-key the family map to the new token for lookup chain
  tokenFamilies.delete(oldToken);
  tokenFamilies.set(newToken, family);

  // Store binding metadata (user agent + IP)
  storeTokenBinding(newToken, { userAgent: userAgent || '', ipAddress: ipAddress || '' });

  logger.info('Token rotated successfully', {
    familyId: family.familyId,
    userId: oldSession.userId,
    newToken: newToken.slice(0, 8),
  });

  return { newToken, session, reuseDetected: false };
}

/**
 * Detect whether a token has been reused within its token family.
 * Returns true if reuse is detected (the token is not the latest in its family,
 * or the family has been revoked).
 */
export function detectTokenReuse(tokenFamily: string, tokenId: string): boolean {
  const family = tokenFamilies.get(tokenFamily);
  if (!family) return false;
  if (family.revoked) return true;
  return family.activeTokenId !== tokenId;
}

// ── Token Binding (UA/IP) ────────────────────────────────────────────────────

const globalForTokenBinding = globalThis as unknown as {
  _tokenBindings: Map<string, { userAgent: string; ipAddress: string; boundAt: number }> | undefined;
};

if (!globalForTokenBinding._tokenBindings) {
  globalForTokenBinding._tokenBindings = new Map();
}
const tokenBindings = globalForTokenBinding._tokenBindings;

/** Store binding metadata for a token (user agent + IP at creation time). */
function storeTokenBinding(
  token: string,
  binding: { userAgent: string; ipAddress: string },
): void {
  tokenBindings.set(token, {
    userAgent: binding.userAgent,
    ipAddress: binding.ipAddress,
    boundAt: Date.now(),
  });
  // Cleanup old bindings (keep last 2000)
  if (tokenBindings.size > 2000) {
    const entries = [...tokenBindings.entries()]
      .sort((a, b) => a[1].boundAt - b[1].boundAt);
    for (let i = 0; i < 500; i++) {
      tokenBindings.delete(entries[i][0]);
    }
  }
}

/**
 * Validate token binding — check if the current request's UA/IP matches
 * the token's original binding. Returns reasons if mismatch detected.
 *
 * This is a replay detection mechanism — if a token is used from a
 * significantly different UA/IP, it may indicate token theft.
 */
export function validateTokenBinding(
  token: string,
  currentUserAgent: string,
  currentIpAddress: string,
): { valid: boolean; reasons: string[] } {
  const binding = tokenBindings.get(token);
  if (!binding) {
    // No binding stored yet — this is fine for backward compatibility
    return { valid: true, reasons: [] };
  }

  const reasons: string[] = [];

  // Check user agent — normalize for comparison (ignore version numbers)
  if (binding.userAgent && currentUserAgent) {
    const normalizeUA = (ua: string) =>
      ua.replace(/\/[\d.]+/g, '/VER').replace(/\s*\([^\)]*\)/g, '').toLowerCase();
    if (normalizeUA(binding.userAgent) !== normalizeUA(currentUserAgent)) {
      reasons.push('User agent mismatch — different browser or client');
    }
  }

  // Check IP address — warn on change, but don't block (mobile networks change IPs)
  if (binding.ipAddress && currentIpAddress &&
      binding.ipAddress !== currentIpAddress &&
      binding.ipAddress !== 'unknown' &&
      currentIpAddress !== 'unknown') {
    reasons.push(`IP address changed from ${binding.ipAddress} to ${currentIpAddress}`);
  }

  return { valid: reasons.length === 0, reasons };
}

/**
 * Revoke all sessions in a token family by deleting all known tokens
 * from the cache and database.
 */
async function revokeTokenFamily(familyId: string): Promise<void> {
  let targetFamily: TokenFamilyRecord | null = null;

  for (const [, family] of tokenFamilies.entries()) {
    if (family.familyId === familyId) {
      targetFamily = family;
      break;
    }
  }

  if (!targetFamily) return;

  // Invalidate all tokens in the family
  for (const tokenId of targetFamily.usedTokenIds) {
    sessionCache.delete(tokenId);
    try {
      await db.session.deleteMany({ where: { token: tokenId } });
    } catch { /* ignore */ }
    tokenBindings.delete(tokenId);
  }

  // Clean up family record
  for (const [key, family] of tokenFamilies.entries()) {
    if (family.familyId === familyId) {
      tokenFamilies.delete(key);
    }
  }

  logger.warn('Token family revoked', {
    familyId,
    tokensRevoked: targetFamily.usedTokenIds.size,
  });
}

/**
 * Get token rotation metrics for monitoring.
 */
export function getTokenRotationMetrics() {
  let totalFamilies = 0;
  let revokedFamilies = 0;
  let totalTokens = 0;

  const seenFamilies = new Set<string>();

  for (const [, family] of tokenFamilies.entries()) {
    seenFamilies.add(family.familyId);
    totalTokens += family.usedTokenIds.size;
    if (family.revoked) revokedFamilies++;
  }

  totalFamilies = seenFamilies.size;

  return {
    totalFamilies,
    revokedFamilies,
    totalTokensTracked: totalTokens,
    absoluteSessionMaxMs: ABSOLUTE_SESSION_MAX_MS,
    bindingRecordsCount: tokenBindings.size,
  };
}
