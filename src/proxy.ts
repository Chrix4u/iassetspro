import { NextRequest, NextResponse } from 'next/server';
import { getSessionAsync } from '@/lib/auth';
import { getUnavailableOperationalModules } from '@/lib/module-access.server';

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
const API_MODULE_RULES: ReadonlyArray<{ prefix: string; modules: string[] }> = [
  // Repairs composite resource/report surfaces — order matters.
  { prefix: '/api/repairs/material-requests', modules: ['repairs', 'inventory'] },
  { prefix: '/api/repairs/spare-part-returns', modules: ['repairs', 'inventory'] },
  { prefix: '/api/repairs/tool-requests', modules: ['repairs', 'tools'] },
  { prefix: '/api/repairs/tool-transfers', modules: ['repairs', 'tools'] },
  { prefix: '/api/repairs/damaged-tools', modules: ['repairs', 'tools'] },
  { prefix: '/api/repairs/reports', modules: ['repairs', 'reports'] },
  { prefix: '/api/repairs', modules: ['repairs'] },

  // Composite reporting endpoints.
  { prefix: '/api/reports/maintenance', modules: ['reports', 'work_orders', 'maintenance_requests'] },
  { prefix: '/api/reports/machine-availability', modules: ['reports', 'assets'] },
  { prefix: '/api/reports/failure-analysis', modules: ['reports', 'failure_analysis'] },
  { prefix: '/api/reports/downtime', modules: ['reports', 'downtime'] },
  { prefix: '/api/reports/labor-utilization', modules: ['reports', 'work_orders'] },
  { prefix: '/api/reports/repeat-failures', modules: ['reports', 'work_orders'] },
  { prefix: '/api/reports', modules: ['reports'] },

  // Primary operational domains and their supporting APIs.
  { prefix: '/api/assets', modules: ['assets'] },
  { prefix: '/api/asset-categories', modules: ['assets'] },
  { prefix: '/api/asset-models', modules: ['assets'] },
  { prefix: '/api/component-registry', modules: ['assets'] },
  { prefix: '/api/spatial-nodes', modules: ['assets'] },
  { prefix: '/api/maintenance-requests', modules: ['maintenance_requests'] },
  { prefix: '/api/work-orders', modules: ['work_orders'] },
  { prefix: '/api/inventory', modules: ['inventory'] },
  { prefix: '/api/tools', modules: ['tools'] },
  { prefix: '/api/pm-schedules', modules: ['pm_schedules'] },
  { prefix: '/api/pm-templates', modules: ['pm_schedules'] },
  { prefix: '/api/pm-triggers', modules: ['pm_schedules'] },
  { prefix: '/api/pm-analytics', modules: ['pm_schedules', 'analytics'] },
  { prefix: '/api/analytics', modules: ['analytics'] },
  { prefix: '/api/production-orders', modules: ['production'] },
  { prefix: '/api/production-batches', modules: ['production'] },
  { prefix: '/api/work-centers', modules: ['production'] },
  { prefix: '/api/quality-inspections', modules: ['quality'] },
  { prefix: '/api/quality-ncr', modules: ['quality'] },
  { prefix: '/api/quality-audits', modules: ['quality'] },
  { prefix: '/api/quality-control-plans', modules: ['quality'] },
  { prefix: '/api/spc-processes', modules: ['quality'] },
  { prefix: '/api/safety-incidents', modules: ['safety'] },
  { prefix: '/api/safety-inspections', modules: ['safety'] },
  { prefix: '/api/safety-training', modules: ['safety'] },
  { prefix: '/api/safety-equipment', modules: ['safety'] },
  { prefix: '/api/safety-permits', modules: ['safety'] },
  { prefix: '/api/iot', modules: ['iot_sensors'] },
  { prefix: '/api/connectivity', modules: ['iot_sensors'] },
  { prefix: '/api/calibrations', modules: ['calibration'] },
  { prefix: '/api/meter-readings', modules: ['meter_readings'] },
  { prefix: '/api/training-courses', modules: ['training'] },
  { prefix: '/api/risk-assessments', modules: ['risk_assessment'] },
  { prefix: '/api/bill-of-materials', modules: ['bom'] },
  { prefix: '/api/bom-revisions', modules: ['bom'] },
  { prefix: '/api/failure-analysis', modules: ['failure_analysis'] },
  { prefix: '/api/failure-records', modules: ['failure_analysis'] },
  { prefix: '/api/digital-twins', modules: ['digital_twin'] },
  { prefix: '/api/digital-twin-scenes', modules: ['digital_twin'] },
  { prefix: '/api/system-diagrams', modules: ['digital_twin'] },
  { prefix: '/api/predictive-models', modules: ['predictive'] },
  { prefix: '/api/prediction-alerts', modules: ['predictive'] },
  { prefix: '/api/shift-handovers', modules: ['shift_management'] },
  { prefix: '/api/notifications', modules: ['notifications'] },
  { prefix: '/api/documents', modules: ['documents'] },
];

function matchesApiPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + '/');
}

export function requiredModulesForApiPath(pathname: string): string[] {
  // Nested Work Order resource endpoints expose cross-module data and actions.
  // Check them before the generic /api/work-orders prefix.
  if (/^\/api\/work-orders\/[^/]+\/materials(?:\/|$)/.test(pathname)) {
    return ['work_orders', 'repairs', 'inventory'];
  }
  if (/^\/api\/work-orders\/[^/]+\/personal-tools(?:\/|$)/.test(pathname)) {
    return ['work_orders', 'repairs', 'tools'];
  }
  if (/^\/api\/work-orders\/[^/]+\/tool-options(?:\/|$)/.test(pathname)) {
    return ['work_orders', 'repairs', 'tools'];
  }
  if (/^\/api\/work-orders\/[^/]+\/components(?:\/|$)/.test(pathname)) {
    return ['work_orders', 'assets'];
  }

  return API_MODULE_RULES.find((rule) => matchesApiPrefix(pathname, rule.prefix))?.modules ?? [];
}

async function moduleGateResponse(pathname: string): Promise<NextResponse | null> {
  const requiredModules = requiredModulesForApiPath(pathname);
  if (requiredModules.length === 0) return null;

  const unavailable = await getUnavailableOperationalModules(requiredModules);
  if (unavailable.length === 0) return null;

  return withSecurityHeaders(
    NextResponse.json(
      {
        success: false,
        error: 'Required module is not licensed, enabled, and active',
        unavailableModules: unavailable,
      },
      { status: 403 },
    ),
  );
}

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

function hasReportViewPermission(session: { roles: string[]; permissions: string[] }): boolean {
  return session.roles.includes('admin') || session.permissions.some(permission =>
    ['reports.view', 'reports.export', 'analytics.view'].includes(permission),
  );
}

function hasReportExportPermission(session: { roles: string[]; permissions: string[] }): boolean {
  return session.roles.includes('admin') || session.permissions.includes('reports.export');
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

  // Allow internal PM cron endpoint only while PM itself is operational.
  if (pathname === '/api/pm-schedules/check-due') {
    const cronSecret = request.headers.get('x-pm-cron-secret');
    if (cronSecret === INTERNAL_SECRET) {
      const blocked = await moduleGateResponse(pathname);
      if (blocked) return blocked;
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

  const moduleBlocked = await moduleGateResponse(pathname);
  if (moduleBlocked) return moduleBlocked;

  // Legacy detailed Repairs reporting previously required only authentication.
  // Enforce the same view/export policy as the canonical reporting surface.
  if (pathname === '/api/repairs/reports/detailed') {
    const reportFormat = (request.nextUrl.searchParams.get('format') || 'json').toLowerCase();
    if (!['json', 'xlsx'].includes(reportFormat)) {
      return withSecurityHeaders(
        NextResponse.json(
          { success: false, error: 'Unsupported report format. Use json or xlsx.' },
          { status: 400 },
        ),
      );
    }

    const permitted = reportFormat === 'xlsx'
      ? hasReportExportPermission(session)
      : hasReportViewPermission(session);

    if (!permitted) {
      return withSecurityHeaders(
        NextResponse.json(
          {
            success: false,
            error: reportFormat === 'xlsx'
              ? 'Insufficient permissions: reports.export required'
              : 'Insufficient permissions: reports.view required',
          },
          { status: 403 },
        ),
      );
    }
  }

  // The older aggregate Repairs endpoint supports PDF through ?format=pdf.
  // Keep JSON viewing on its established role gate, but file export must require
  // the explicit reports.export capability.
  if (
    pathname === '/api/repairs/reports' &&
    request.nextUrl.searchParams.get('format')?.toLowerCase() === 'pdf' &&
    !hasReportExportPermission(session)
  ) {
    return withSecurityHeaders(
      NextResponse.json(
        { success: false, error: 'Insufficient permissions: reports.export required' },
        { status: 403 },
      ),
    );
  }

  // Token is valid — attach a verified session snapshot for the route worker.
  // Route handlers may run in a separate worker/process from the proxy, so they
  // must not depend on sharing the proxy's in-memory session cache.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-session-verified', '1');
  requestHeaders.set('x-session-user-id', session.userId);
  requestHeaders.set('x-session-username', encodeURIComponent(session.username || ''));
  requestHeaders.set('x-session-full-name', encodeURIComponent(session.fullName || session.username || ''));
  requestHeaders.set('x-session-roles', session.roles.join(','));
  requestHeaders.set('x-session-permissions', session.permissions.join(','));
  requestHeaders.set('x-session-created-at', session.createdAt.toISOString());
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