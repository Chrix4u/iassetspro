import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin, hasAnyPermission } from '@/lib/auth';
import { getPlantScope, canAccessPlant } from '@/lib/plant-scope';
import {
  SUPPORTED_REPORT_TYPES,
  type ReportType,
  type ReportFilters,
} from '@/services/repairsReportXlsx.service';
import { generateRepairsReport } from '@/services/repairsReportXlsxSafe.service';
import { createLogger } from '@/lib/logger';

const logger = createLogger('api:repairs:reports:xlsx');

// ============================================================================
// POST /api/repairs/reports/xlsx
// Body: { reportType: string, filters?: Record<string, string> }
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

    // Downloading an operational report is a distinct capability from viewing
    // report/analytics screens. Keep every XLSX path aligned with reports.export.
    if (!hasAnyPermission(session, ['reports.export']) && !isAdmin(session)) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions: reports.export required' },
        { status: 403 },
      );
    }

    let body: { reportType?: string; filters?: Record<string, string | undefined> };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 },
      );
    }

    const { reportType, filters: rawFilters } = body;

    if (!reportType || typeof reportType !== 'string') {
      return NextResponse.json(
        { success: false, error: 'reportType is required' },
        { status: 400 },
      );
    }

    if (!SUPPORTED_REPORT_TYPES.includes(reportType as ReportType)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid report type. Supported: ${SUPPORTED_REPORT_TYPES.join(', ')}`,
        },
        { status: 400 },
      );
    }

    // Plant authorization is server authoritative. The report service currently
    // accepts one plantId, so non-system-wide users must never be allowed to
    // omit plant scope and accidentally export data from every plant.
    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: no access to the requested plant' },
        { status: 403 },
      );
    }

    const requestedPlantId = rawFilters?.plantId;
    const filters: ReportFilters = {
      ...(rawFilters ?? {}),
    };

    if (plantScope.isScoped && plantScope.plantId) {
      if (requestedPlantId && requestedPlantId !== plantScope.plantId) {
        return NextResponse.json(
          { success: false, error: 'Forbidden: requested plant is outside the active plant scope' },
          { status: 403 },
        );
      }
      filters.plantId = plantScope.plantId;
    } else if (!plantScope.isSystemWide) {
      if (requestedPlantId) {
        if (!canAccessPlant(plantScope, requestedPlantId)) {
          return NextResponse.json(
            { success: false, error: 'Forbidden: no access to the requested plant' },
            { status: 403 },
          );
        }
        filters.plantId = requestedPlantId;
      } else if (plantScope.accessiblePlantIds.length === 1) {
        filters.plantId = plantScope.accessiblePlantIds[0];
      } else {
        // Fail closed until the service supports an IN-list of accessible plants.
        // This avoids an all-plant export for ordinary multi-plant users.
        return NextResponse.json(
          {
            success: false,
            error: 'Select one of your accessible plants before exporting this report',
          },
          { status: 400 },
        );
      }
    }

    logger.info('Generating XLSX report', {
      reportType,
      plantId: filters.plantId || 'all',
      userId: session.userId,
    });

    const { buffer, filename } = await generateRepairsReport(
      reportType as ReportType,
      filters,
      session,
    );

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate report';
    logger.error('XLSX report generation failed', { error: message });
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}