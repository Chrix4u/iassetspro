import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin } from '@/lib/auth';
import {
  GTP_MANIFEST_SCHEMA,
  fingerprintManifestCore,
  verifyManifestSignature,
  type GtpManifestCore,
} from '@/lib/gtp-migration-manifest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ApprovedManifest = GtpManifestCore & {
  fingerprint: string;
  approval: { algorithm: 'HMAC-SHA256'; signature: string } | null;
};

const closeEnough = (a: number, b: number, tolerance = 0.01) => Math.abs(a - b) <= tolerance;

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session || !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Administrator access required' }, { status: 403 });
    }

    const body = await request.json();
    const manifest = body?.manifest as ApprovedManifest | undefined;
    const confirmedFingerprint = String(body?.fingerprint || '').trim();
    if (!manifest || manifest.schemaVersion !== GTP_MANIFEST_SCHEMA || !manifest.workbookParity) {
      return NextResponse.json({ success: false, error: 'Signed manifest with workbook parity baseline is required' }, { status: 400 });
    }

    const core: GtpManifestCore = {
      schemaVersion: manifest.schemaVersion,
      source: manifest.source,
      reconciliation: manifest.reconciliation,
      migrationActorUserId: manifest.migrationActorUserId,
      migrationPlantId: manifest.migrationPlantId,
      identityConvention: manifest.identityConvention,
      counts: manifest.counts,
      workbookParity: manifest.workbookParity,
      rows: manifest.rows,
    };
    const calculatedFingerprint = fingerprintManifestCore(core);
    if (calculatedFingerprint !== manifest.fingerprint || confirmedFingerprint !== manifest.fingerprint) {
      return NextResponse.json({ success: false, error: 'Parity manifest fingerprint verification failed' }, { status: 409 });
    }
    if (!manifest.approval || manifest.approval.algorithm !== 'HMAC-SHA256'
      || !verifyManifestSignature(manifest.fingerprint, manifest.approval.signature)) {
      return NextResponse.json({ success: false, error: 'Parity manifest signature is invalid' }, { status: 409 });
    }
    if (manifest.migrationActorUserId !== session.userId) {
      return NextResponse.json({ success: false, error: 'Parity manifest belongs to a different administrator session' }, { status: 403 });
    }

    const rows = manifest.rows as Array<{
      legacyWorkOrderNo: string;
      proposedMaintenanceRequest: { requestNumber: string };
      proposedWorkOrder: { woNumber: string };
    }>;
    const woNumbers = rows.map((row) => row.proposedWorkOrder.woNumber);
    const requestNumbers = rows.map((row) => row.proposedMaintenanceRequest.requestNumber);

    const [workOrders, maintenanceRequests] = await Promise.all([
      db.workOrder.findMany({
        where: { woNumber: { in: woNumbers }, plantId: manifest.migrationPlantId },
        select: { woNumber: true, type: true, priority: true, createdAt: true, actualStart: true },
      }),
      db.maintenanceRequest.findMany({
        where: { requestNumber: { in: requestNumbers }, plantId: manifest.migrationPlantId },
        select: { requestNumber: true },
      }),
    ]);

    const breakdowns = workOrders.filter((wo) => String(wo.type || '').toLowerCase() === 'breakdown');
    const priorityOne2025 = breakdowns.filter((wo) =>
      String(wo.priority || '').toLowerCase() === 'critical' && wo.createdAt.getUTCFullYear() === 2025);
    const responseMinutes = priorityOne2025.reduce((sum, wo) => {
      if (!wo.actualStart) return sum;
      const minutes = (wo.actualStart.getTime() - wo.createdAt.getTime()) / 60000;
      return minutes > 0 ? sum + minutes : sum;
    }, 0);

    const source = manifest.workbookParity;
    const checks = {
      jobRecords: {
        expected: source.authoritativeJobRecords,
        actualWorkOrders: workOrders.length,
        actualMaintenanceRequests: maintenanceRequests.length,
        pass: workOrders.length === source.authoritativeJobRecords
          && maintenanceRequests.length === source.authoritativeJobRecords,
      },
      breakdowns: {
        expected: source.authoritativeBreakdowns,
        actual: breakdowns.length,
        pass: breakdowns.length === source.authoritativeBreakdowns,
      },
      priorityOneBreakdowns2025: {
        expected: source.priorityOneBreakdowns,
        actual: priorityOne2025.length,
        pass: priorityOne2025.length === source.priorityOneBreakdowns,
      },
      priorityOneResponseMinutes: {
        expected: source.priorityOneResponseMinutes,
        actual: Number(responseMinutes.toFixed(6)),
        pass: closeEnough(responseMinutes, source.priorityOneResponseMinutes),
      },
      legacyDowntimeFormulaErrors: {
        expectedUnavailable: source.legacyDowntimeFormulaErrorRows.length,
        workOrderNumbers: source.legacyDowntimeFormulaErrorRows.map((row) => row.workOrderNo),
        pass: true,
        note: 'Legacy Excel formula errors remain source-data warnings; iAssetsPro does not reproduce #VALUE! values.',
      },
    };
    const allPassed = Object.values(checks).every((check) => check.pass);

    return NextResponse.json({
      success: true,
      data: {
        schemaVersion: 'gtp-post-import-parity/v1',
        generatedAt: new Date().toISOString(),
        fingerprint: manifest.fingerprint,
        sourceSha256: manifest.source.sha256,
        migrationPlantId: manifest.migrationPlantId,
        sourceWarnings: {
          breakdownPivotFresh: source.breakdownPivotFresh,
          breakdownWeekMismatches: source.breakdownWeekMismatches,
          legacyDowntimeFormulaErrorRows: source.legacyDowntimeFormulaErrorRows,
        },
        checks,
        allPassed,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Post-import parity verification failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
