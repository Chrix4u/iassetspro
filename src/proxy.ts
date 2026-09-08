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

  // Pass through X-Plant-ID as x-user-plant-id for downstream route handler convenience.
  const plantIdHeader = request.headers.get('X-Plant-ID');
  if (plantIdHeader) {
    requestHeaders.set('x-user-plant-id', plantIdHeader);
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
