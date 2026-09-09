import { NextRequest, NextResponse } from 'next/server';
import { getSessionAsync } from '@/lib/auth';

/**
 * Auth & Plant-Scoping Proxy (Next.js 16 convention)
 *
 * Protects all /api/* routes (except public endpoints) by validating the Bearer token.
 * Applies security headers to all API responses.
 *
 * Public routes (no auth required):
 * - /api/auth/* — selected auth endpoints
 * - /api/health — infrastructure/application health probe
 *
 * Internal routes (X-PM-Cron-Secret header for server-to-server):
 * - /api/pm-schedules/check-due — PM cron job trigger
 */

const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/health',
];
const INTERNAL_SECRET = process.env.PM_CRON_SECRET || 'eam-pm-cron-secret-2025';

// Security headers applied to all API responses
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function withSecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

/**
 * Resolve the effective plant-selection signal that the proxy will pass into
 * getPlantScope(). Only the canonical maintenance reporting endpoints accept a
 * plant query fallback; every other API continues to require X-Plant-ID.
 */
export function resolveEffectivePlantId(request: NextRequest): string | null {
  const explicitPlantHeader = request.headers.get('X-Plant-ID');
  if (explicitPlantHeader) return explicitPlantHeader;

  const { pathname, searchParams } = request.nextUrl;
  if (
    pathname === '/api/reports/maintenance' ||
    pathname === '/api/reports/maintenance/export'
  ) {
    return searchParams.get('plantId');
  }

  return null;
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only handle /api/* routes
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Allow explicitly public endpoints
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return withSecurityHeaders(NextResponse.next());
  }

  // Allow internal PM cron endpoint (authenticated via secret header)
  if (pathname === '/api/pm-schedules/check-due') {
    const cronSecret = request.headers.get('x-pm-cron-secret');
    if (cronSecret === INTERNAL_SECRET) {
      return withSecurityHeaders(NextResponse.next());
    }
    // If no secret header, fall through to normal auth check
  }

  // Check for Bearer token
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return withSecurityHeaders(
      NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    );
  }

  // Validate token via DB-backed session (with in-memory cache)
  const session = await getSessionAsync(token);

  if (!session) {
    return withSecurityHeaders(
      NextResponse.json(
        { success: false, error: 'Invalid or expired session' },
        { status: 401 }
      )
    );
  }

  // Token is valid — attach session info + plant context to request headers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-session-user-id', session.userId);
  requestHeaders.set('x-session-roles', session.roles.join(','));
  requestHeaders.set('x-session-permissions', session.permissions.join(','));
  requestHeaders.set('x-user-plant-id', '');

  // Bind maintenance-report query plant selection into the normal X-Plant-ID
  // validation path. Without this, an unscoped multi-plant request could reach
  // the route with ?plantId=... and overwrite its server-generated IN filter.
  // System-wide actors remain unaffected because getPlantScope intentionally
  // ignores X-Plant-ID for system-wide sessions.
  const effectivePlantId = resolveEffectivePlantId(request);
  if (effectivePlantId) {
    requestHeaders.set('X-Plant-ID', effectivePlantId);
    requestHeaders.set('x-user-plant-id', effectivePlantId);
  }

  return withSecurityHeaders(
    NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    })
  );
}

// NOTE: Proxy always runs on Node.js runtime — no need to export runtime config

export const config = {
  matcher: ['/api/:path*'],
};