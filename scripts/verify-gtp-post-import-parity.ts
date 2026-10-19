import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/lib/db';
import {
  GTP_MANIFEST_SCHEMA,
  fingerprintManifestCore,
  verifyManifestSignature,
  type GtpManifestCore,
} from '../src/lib/gtp-migration-manifest';

type ApprovedManifest = GtpManifestCore & {
  fingerprint: string;
  approval: {
    algorithm: string;
    signature: string;
  };
};

type AuditEvidence = {
  sourceSha256?: string;
  manifestFingerprint?: string;
  migrationPlantId?: string;
};

const PARITY_SCHEMA = 'gtp-post-import-parity/v2';
const RESPONSE_TOLERANCE_MINUTES = 0.01;

function resolveManifestPath(): string {
  const flagIndex = process.argv.indexOf('--manifest');
  const fromFlag = flagIndex >= 0 ? process.argv[flagIndex + 1] : undefined;
  const candidate = fromFlag || process.env.GTP_MANIFEST_PATH;
  if (!candidate) {
    throw new Error('Usage: bunx tsx scripts/verify-gtp-post-import-parity.ts --manifest <approved-manifest.json>');
  }
  return path.resolve(candidate);
}

function loadAndVerifyManifest(manifestPath: string): ApprovedManifest {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as ApprovedManifest;
  if (!manifest || typeof manifest !== 'object') throw new Error('Invalid GTP manifest');
  if (manifest.schemaVersion !== GTP_MANIFEST_SCHEMA) throw new Error('Unsupported GTP manifest schema');
  if (!Array.isArray(manifest.rows) || !manifest.source?.sha256 || !manifest.migrationPlantId
    || !manifest.fingerprint || !manifest.workbookParity) {
    throw new Error('GTP manifest is incomplete');
  }
  if (!/^[a-f0-9]{64}$/i.test(manifest.source.sha256) || !/^[a-f0-9]{64}$/i.test(manifest.fingerprint)) {
    throw new Error('GTP manifest source SHA or fingerprint is invalid');
  }
  if (!manifest.approval || manifest.approval.algorithm !== 'HMAC-SHA256' || !manifest.approval.signature) {
    throw new Error('GTP manifest approval signature is missing or unsupported');
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
  if (calculatedFingerprint !== manifest.fingerprint) {
    throw new Error('GTP manifest fingerprint verification failed');
  }
  if (!verifyManifestSignature(manifest.fingerprint, manifest.approval.signature)) {
    throw new Error('GTP manifest approval signature verification failed');
  }

  const countsAreConsistent = manifest.counts.rows === manifest.rows.length
    && manifest.counts.workOrders === manifest.rows.length
    && manifest.counts.maintenanceRequests === manifest.rows.length
    && manifest.workbookParity.authoritativeJobRecords === manifest.rows.length;
  if (!countsAreConsistent) {
    throw new Error('Signed GTP manifest counts are internally inconsistent');
  }

  return manifest;
}

function parseAuditEvidence(raw: string | null): AuditEvidence | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AuditEvidence;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

const closeEnough = (actual: number, expected: number) =>
  Math.abs(actual - expected) < RESPONSE_TOLERANCE_MINUTES;

async function verifyPostImportParity(manifest: ApprovedManifest) {
  const candidateAudits = await db.auditLog.findMany({
    where: {
      action: 'historical_import',
      entityType: 'work_order',
      plantId: manifest.migrationPlantId,
      newValues: { contains: manifest.source.sha256 },
    },
    select: { id: true, entityId: true, newValues: true, plantId: true },
  });

  const exactAudits = candidateAudits.filter((row) => {
    const evidence = parseAuditEvidence(row.newValues);
    return evidence?.sourceSha256 === manifest.source.sha256
      && evidence.manifestFingerprint === manifest.fingerprint
      && evidence.migrationPlantId === manifest.migrationPlantId;
  });
  const auditRowCount = exactAudits.length;
  const workOrderIds = [...new Set(exactAudits.map((row) => row.entityId).filter(Boolean))];

  const workOrders = workOrderIds.length > 0
    ? await db.workOrder.findMany({
        where: { id: { in: workOrderIds }, plantId: manifest.migrationPlantId },
        select: {
          id: true,
          woNumber: true,
          type: true,
          priority: true,
          createdAt: true,
          actualStart: true,
          maintenanceRequestId: true,
          plantId: true,
        },
      })
    : [];
  const workOrderCount = workOrders.length;

  const maintenanceRequestIds = [...new Set(
    workOrders
      .map((row) => row.maintenanceRequestId)
      .filter((value): value is string => Boolean(value)),
  )];
  const maintenanceRequests = maintenanceRequestIds.length > 0
    ? await db.maintenanceRequest.findMany({
        where: { id: { in: maintenanceRequestIds }, plantId: manifest.migrationPlantId },
        select: { id: true, requestNumber: true, workOrderId: true, plantId: true },
      })
    : [];
  const maintenanceRequestCount = maintenanceRequests.length;

  const maintenanceRequestById = new Map(maintenanceRequests.map((row) => [row.id, row]));
  const linkedPairs = workOrders.filter((workOrder) => {
    if (!workOrder.maintenanceRequestId) return false;
    const maintenanceRequest = maintenanceRequestById.get(workOrder.maintenanceRequestId);
    return maintenanceRequest?.workOrderId === workOrder.id;
  }).length;

  const breakdowns = workOrders.filter((row) => row.type === 'breakdown');
  const breakdownCount = breakdowns.length;
  const priorityOneRows = breakdowns.filter((row) =>
    row.priority === 'critical' && row.createdAt.getUTCFullYear() === 2025);
  const priorityOneBreakdowns = priorityOneRows.length;
  const priorityOneResponseMinutes = Number(priorityOneRows.reduce((sum, row) => {
    if (!row.actualStart) return sum;
    const minutes = (row.actualStart.getTime() - row.createdAt.getTime()) / 60000;
    return sum + (Number.isFinite(minutes) && minutes >= 0 ? minutes : 0);
  }, 0).toFixed(6));

  const expected = {
    workOrderCount: manifest.counts.workOrders,
    maintenanceRequestCount: manifest.counts.maintenanceRequests,
    auditRowCount: manifest.counts.workOrders,
    linkedPairs: manifest.counts.workOrders,
    breakdownCount: manifest.workbookParity.authoritativeBreakdowns,
    priorityOneBreakdowns: manifest.workbookParity.priorityOneBreakdowns,
    priorityOneResponseMinutes: manifest.workbookParity.priorityOneResponseMinutes,
  };
  const actual = {
    workOrderCount,
    maintenanceRequestCount,
    auditRowCount,
    linkedPairs,
    breakdownCount,
    priorityOneBreakdowns,
    priorityOneResponseMinutes,
  };
  const checks = {
    uniqueAuditWorkOrders: workOrderIds.length === auditRowCount,
    workOrderCount: workOrderCount === expected.workOrderCount,
    maintenanceRequestCount: maintenanceRequestCount === expected.maintenanceRequestCount,
    auditRowCount: auditRowCount === expected.auditRowCount,
    linkedPairs: linkedPairs === expected.linkedPairs,
    breakdownCount: breakdownCount === expected.breakdownCount,
    priorityOneBreakdowns: priorityOneBreakdowns === expected.priorityOneBreakdowns,
    priorityOneResponseMinutes: closeEnough(
      priorityOneResponseMinutes,
      expected.priorityOneResponseMinutes,
    ),
  };
  const pass = Object.values(checks).every(Boolean);

  return {
    schemaVersion: PARITY_SCHEMA,
    pass,
    sourceSha256: manifest.source.sha256,
    manifestFingerprint: manifest.fingerprint,
    migrationPlantId: manifest.migrationPlantId,
    expected,
    actual,
    checks,
  };
}

async function main() {
  const manifestPath = resolveManifestPath();
  const manifest = loadAndVerifyManifest(manifestPath);
  const result = await verifyPostImportParity(manifest);
  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ schemaVersion: PARITY_SCHEMA, pass: false, error: message }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
