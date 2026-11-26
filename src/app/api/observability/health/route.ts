// ============================================================================
// API ROUTE — GET /api/observability/health — Comprehensive health check
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { loadavg } from 'node:os';
import { getSession, isAdmin } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import { OpenTelemetryService } from '@/services/observability/openTelemetry.service';
import { PrometheusMetricsService } from '@/services/observability/prometheusMetrics.service';
import { CentralizedLoggingService } from '@/services/observability/centralizedLogging.service';

const logger = createLogger('observability-health');

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session || !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    const startTime = Date.now();
    const checks: Record<string, { status: 'healthy' | 'degraded' | 'unhealthy'; latencyMs: number; details?: string }> = {};

    // ── Database connectivity check ──────────────────────────────────────────
    try {
      const dbStart = Date.now();
      await db.$queryRaw`SELECT 1 as ok`;
      const dbLatency = Date.now() - dbStart;
      checks.database = {
        status: dbLatency < 100 ? 'healthy' : dbLatency < 500 ? 'degraded' : 'unhealthy',
        latencyMs: dbLatency,
        details: `Query executed in ${dbLatency}ms`,
      };
    } catch (error) {
      checks.database = {
        status: 'unhealthy',
        latencyMs: 0,
        details: error instanceof Error ? error.message : 'Database connection failed',
      };
    }

    // ── Memory usage ─────────────────────────────────────────────────────────
    const mem = process.memoryUsage();
    const memRssMB = Math.round(mem.rss / 1024 / 1024);
    const memHeapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
    const memHeapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
    const memHeapPercent = memHeapTotalMB > 0 ? Math.round((memHeapUsedMB / memHeapTotalMB) * 100) : 0;
    checks.memory = {
      status: memHeapPercent < 70 ? 'healthy' : memHeapPercent < 90 ? 'degraded' : 'unhealthy',
      latencyMs: 0,
      details: `RSS: ${memRssMB}MB, Heap: ${memHeapUsedMB}/${memHeapTotalMB}MB (${memHeapPercent}%)`,
    };

    // ── Uptime ───────────────────────────────────────────────────────────────
    const uptimeSeconds = process.uptime();
    const uptimeDays = Math.floor(uptimeSeconds / 86400);
    const uptimeHours = Math.floor((uptimeSeconds % 86400) / 3600);
    const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60);
    checks.uptime = {
      status: 'healthy',
      latencyMs: 0,
      details: `${uptimeDays}d ${uptimeHours}h ${uptimeMinutes}m (${Math.round(uptimeSeconds)}s)`,
    };

    // ── OpenTelemetry store stats ────────────────────────────────────────────
    try {
      const otelStats = OpenTelemetryService.getStats();
      checks.tracing = {
        status: otelStats.totalSpans < otelStats.maxSpans ? 'healthy' : 'degraded',
        latencyMs: 0,
        details: `${otelStats.activeSpans} active, ${otelStats.totalSpans}/${otelStats.maxSpans} stored, ${otelStats.completedTraces} completed`,
      };
    } catch {
      checks.tracing = { status: 'unhealthy', latencyMs: 0, details: 'OpenTelemetry service unavailable' };
    }

    // ── Metrics service stats ────────────────────────────────────────────────
    try {
      const metricsList = PrometheusMetricsService.listMetrics();
      checks.metrics = {
        status: 'healthy',
        latencyMs: 0,
        details: `${metricsList.length} registered metric families`,
      };
    } catch {
      checks.metrics = { status: 'unhealthy', latencyMs: 0, details: 'Prometheus metrics service unavailable' };
    }

    // ── Centralized logging stats ────────────────────────────────────────────
    try {
      const logStats = CentralizedLoggingService.getStats(1);
      const totalEntries = logStats.totalEntries;
      checks.logging = {
        status: totalEntries < 80_000 ? 'healthy' : totalEntries < 95_000 ? 'degraded' : 'unhealthy',
        latencyMs: 0,
        details: `${totalEntries} entries in buffer, error rate: ${logStats.errorRate}%`,
      };
    } catch {
      checks.logging = { status: 'unhealthy', latencyMs: 0, details: 'Centralized logging service unavailable' };
    }

    // ── Active connections estimate (from metrics) ───────────────────────────
    try {
      const connMetric = PrometheusMetricsService.getMetric('db_connections_active');
      const connValue = connMetric?.values?.['(none)'] as number | undefined;
      const poolMetric = PrometheusMetricsService.getMetric('db_connections_pool_size');
      const poolValue = poolMetric?.values?.['(none)'] as number | undefined;
      checks.connections = {
        status: 'healthy',
        latencyMs: 0,
        details: `Active: ${connValue ?? 'N/A'}, Pool size: ${poolValue ?? 'N/A'}`,
      };
    } catch {
      checks.connections = { status: 'healthy', latencyMs: 0, details: 'Connection metrics not available' };
    }

    // ── Queue depth ──────────────────────────────────────────────────────────
    try {
      const queueMetric = PrometheusMetricsService.getMetric('queue_depth');
      const queueValue = queueMetric?.values?.['(none)'] as number | undefined;
      checks.queue = {
        status: (queueValue ?? 0) < 100 ? 'healthy' : (queueValue ?? 0) < 500 ? 'degraded' : 'unhealthy',
        latencyMs: 0,
        details: `Queue depth: ${queueValue ?? 0}`,
      };
    } catch {
      checks.queue = { status: 'healthy', latencyMs: 0, details: 'Queue metrics not available' };
    }

    // ── Observability persistence status ────────────────────────────────────
    try {
      const { getStatus } = await import('@/services/observability/persistence.service');
      const persistStatus = getStatus();
      const tp = persistStatus.totalPersisted;
      checks.persistence = {
        status: persistStatus.isRunning ? 'healthy' : 'degraded',
        latencyMs: 0,
        details: `Running: ${persistStatus.isRunning}, Flush: ${persistStatus.config.flushIntervalMs}ms, Persisted: ${tp.logs} logs / ${tp.traces} traces / ${tp.metrics} metrics`,
      };
    } catch {
      checks.persistence = { status: 'healthy', latencyMs: 0, details: 'Persistence service not loaded' };
    }

    // ── Overall status determination ─────────────────────────────────────────
    const statusValues = Object.values(checks);
    const hasUnhealthy = statusValues.some(c => c.status === 'unhealthy');
    const hasDegraded = statusValues.some(c => c.status === 'degraded');
    const overallStatus = hasUnhealthy ? 'unhealthy' : hasDegraded ? 'degraded' : 'healthy';

    const totalLatencyMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      data: {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        responseTimeMs: totalLatencyMs,
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        pid: process.pid,
        checks,
        summary: {
          total: statusValues.length,
          healthy: statusValues.filter(c => c.status === 'healthy').length,
          degraded: statusValues.filter(c => c.status === 'degraded').length,
          unhealthy: statusValues.filter(c => c.status === 'unhealthy').length,
        },
        system: {
          uptime: uptimeSeconds,
          memory: {
            rssMB: memRssMB,
            heapUsedMB: memHeapUsedMB,
            heapTotalMB: memHeapTotalMB,
            heapPercent: memHeapPercent,
            externalMB: Math.round(mem.external / 1024 / 1024),
          },
          cpu: {
            loadAvg: loadavg(),
            usageSeconds: Object.fromEntries(Object.entries(process.cpuUsage()).map(([key, value]) => [key, value / 1_000_000])),
          },
        },
      },
    });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: 'Health check failed' }, { status: 500 });
  }
}
