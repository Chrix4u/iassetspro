import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { cache } from '@/lib/cache';

// GET /api/health — system health check
export async function GET() {
  const startTime = Date.now();
  const checks: Record<string, { status: 'healthy' | 'degraded' | 'unhealthy'; latencyMs: number; details?: string }> = {};

  // Database check
  try {
    const dbStart = Date.now();
    await db.$queryRaw`SELECT 1`;
    checks.database = { status: 'healthy', latencyMs: Date.now() - dbStart };
  } catch (error) {
    checks.database = {
      status: 'unhealthy',
      latencyMs: 0,
      details: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  // Cache check
  try {
    const cacheStart = Date.now();
    cache.set('health-check', 'ok', 5000);
    const val = cache.get('health-check');
    cache.delete('health-check');
    checks.cache = {
      status: val === 'ok' ? 'healthy' : 'degraded',
      latencyMs: Date.now() - cacheStart,
    };
  } catch {
    checks.cache = { status: 'degraded', latencyMs: 0, details: 'Cache check failed' };
  }

  // Memory usage
  const memUsage = process.memoryUsage();
  const memoryMB = {
    rss: Math.round(memUsage.rss / 1024 / 1024),
    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
    external: Math.round(memUsage.external / 1024 / 1024),
  };

  const cacheStats = cache.getStats();

  const allHealthy = Object.values(checks).every(c => c.status === 'healthy');

  return NextResponse.json(
    {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      responseTimeMs: Date.now() - startTime,
      version: process.env.npm_package_version || '1.0.0',
      buildVersion: process.env.NEXT_PUBLIC_BUILD_VERSION || 'unknown',
      checks,
      system: {
        memory: memoryMB,
        cache: cacheStats,
        nodeVersion: process.version,
        platform: process.platform,
      },
    },
    {
      status: allHealthy ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  );
}
