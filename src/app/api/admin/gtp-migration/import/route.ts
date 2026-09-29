import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
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

type ProposedRow = {
  legacyRowNumber: number | null;
  legacyWorkOrderNo: string;
  sourceType: string | null;
  sourceStatus: string | null;
  assetId: string | null;
  assetName: string | null;
  assetResolution?: string | null;
  reportedAt: string | null;
  workStartedAt: string | null;
  workCompletedAt: string | null;
  trade: string | null;
  legacyPeople?: Record<string, string | null>;
  proposedMaintenanceRequest: {
    requestNumber: string;
    title: string;
    priority: string;
    assetId: string | null;
    assetName: string | null;
    status: string;
    workflowStatus: string;
    createdAt: string | null;
  };
  proposedWorkOrder: {
    woNumber: string;
    title: string;
    type: string;
    priority: string;
    status: string;
    assetId: string | null;
    assetName: string | null;
    tradeActivity: string | null;
    actualStart: string | null;
    actualEnd: string | null;
  };
};

type ApprovedManifest = GtpManifestCore & {
  generatedAt: string;
  fingerprint: string;
  approval: { algorithm: 'HMAC-SHA256'; signature: string } | null;
  safeToInsert: boolean;
  executionReady?: boolean;
  blockers: string[];
  executionBlockers?: string[];
};

const allowsNullAsset = (resolution: string | null | undefined) =>
  resolution === 'non_equipment' || resolution === 'historical_unassigned';

const historicalAssetLabel = (resolution: string | null | undefined) =>
  resolution === 'non_equipment'
    ? 'Non-equipment work'
    : resolution === 'historical_unassigned'
      ? 'Unassigned historical work'
      : null;

const asDate = (value: string | null | undefined): Date | undefined => {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Manifest contains an invalid timestamp');
  return date;
};

function parseManifest(raw: string): ApprovedManifest {
  const manifest = JSON.parse(raw) as ApprovedManifest;
  if (!manifest || typeof manifest !== 'object') throw new Error('Invalid manifest');
  if (manifest.schemaVersion !== GTP_MANIFEST_SCHEMA) throw new Error('Unsupported GTP manifest schema');
  if (!Array.isArray(manifest.rows) || !manifest.source?.sha256 || !manifest.fingerprint || !manifest.migrationPlantId) {
    throw new Error('Manifest is incomplete');
  }
  return manifest;
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session || !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Administrator access required' }, { status: 403 });
    }

    const formData = await request.formData();
    const manifestPart = formData.get('manifest');
    const workbook = formData.get('file');
    const confirmedFingerprint = String(formData.get('fingerprint') || '').trim();

    if (!(workbook instanceof File)) {
      return NextResponse.json({ success: false, error: 'Original GTP workbook is required' }, { status: 400 });
    }

    const manifestRaw = manifestPart instanceof File
      ? await manifestPart.text()
      : typeof manifestPart === 'string' ? manifestPart : '';
    if (!manifestRaw) {
      return NextResponse.json({ success: false, error: 'Approved preview manifest is required' }, { status: 400 });
    }

    const manifest = parseManifest(manifestRaw);
    const core: GtpManifestCore = {
      schemaVersion: manifest.schemaVersion,
      source: manifest.source,
      reconciliation: manifest.reconciliation,
      migrationActorUserId: manifest.migrationActorUserId,
      migrationPlantId: manifest.migrationPlantId,
      identityConvention: manifest.identityConvention,
      counts: manifest.counts,
      rows: manifest.rows,
    };
    const calculatedFingerprint = fingerprintManifestCore(core);

    if (calculatedFingerprint !== manifest.fingerprint || confirmedFingerprint !== manifest.fingerprint) {
      return NextResponse.json({ success: false, error: 'Manifest fingerprint verification failed' }, { status: 409 });
    }
    if (!manifest.approval || manifest.approval.algorithm !== 'HMAC-SHA256'
      || !verifyManifestSignature(manifest.fingerprint, manifest.approval.signature)) {
      return NextResponse.json({ success: false, error: 'Manifest approval signature is missing or invalid' }, { status: 409 });
    }
    if (!manifest.safeToInsert || manifest.executionReady !== true
      || manifest.blockers?.length || manifest.executionBlockers?.length) {
      return NextResponse.json({ success: false, error: 'Manifest is not approved for write execution' }, { status: 409 });
    }
    if (manifest.migrationActorUserId !== session.userId) {
      return NextResponse.json({ success: false, error: 'Manifest was approved by a different administrator session' }, { status: 403 });
    }

    const workbookBuffer = Buffer.from(await workbook.arrayBuffer());
    const workbookSha256 = createHash('sha256').update(workbookBuffer).digest('hex');
    if (workbookSha256 !== manifest.source.sha256 || workbook.size !== manifest.source.sizeBytes) {
      return NextResponse.json({ success: false, error: 'Workbook does not match the approved manifest' }, { status: 409 });
    }

    const rows = manifest.rows as ProposedRow[];
    if (manifest.counts.rows !== rows.length
      || manifest.counts.maintenanceRequests !== rows.length
      || manifest.counts.workOrders !== rows.length) {
      return NextResponse.json({ success: false, error: 'Manifest counts do not match its proposed rows' }, { status: 409 });
    }
    if (!rows.length || rows.some((row) => !row.assetId && !allowsNullAsset(row.assetResolution))) {
      return NextResponse.json({ success: false, error: 'Every resolved equipment-backed import row must bind to a real Asset' }, { status: 409 });
    }

    for (const row of rows) {
      if (row.proposedMaintenanceRequest.requestNumber !== `GTP-MR-${row.legacyWorkOrderNo}`
        || row.proposedWorkOrder.woNumber !== `GTP-WO-${row.legacyWorkOrderNo}`) {
        return NextResponse.json({ success: false, error: 'Manifest contains a non-canonical historical identity' }, { status: 409 });
      }
    }

    const migrationPlant = await db.plant.findFirst({
      where: { id: manifest.migrationPlantId, isActive: true },
      select: { id: true },
    });
    if (!migrationPlant) {
      return NextResponse.json({ success: false, error: 'Approved migration plant no longer exists or is inactive' }, { status: 409 });
    }

    const assetIds = [...new Set(rows.map((row) => row.assetId!).filter(Boolean))];
    const assets = await db.asset.findMany({
      where: { id: { in: assetIds }, isActive: true },
      select: { id: true, name: true, plantId: true },
    });
    const assetById = new Map(assets.map((asset) => [asset.id, asset]));
    if (assetIds.some((id) => !assetById.has(id))) {
      return NextResponse.json({ success: false, error: 'One or more approved Assets no longer exist or are inactive' }, { status: 409 });
    }
    if (assets.some((asset) => asset.plantId !== manifest.migrationPlantId)) {
      return NextResponse.json({ success: false, error: 'Approved Assets no longer belong to the signed migration plant' }, { status: 409 });
    }

    const woNumbers = rows.map((row) => row.proposedWorkOrder.woNumber);
    const requestNumbers = rows.map((row) => row.proposedMaintenanceRequest.requestNumber);
    const [existingWos, existingMrs] = await Promise.all([
      db.workOrder.findMany({ where: { woNumber: { in: woNumbers } }, select: { woNumber: true } }),
      db.maintenanceRequest.findMany({ where: { requestNumber: { in: requestNumbers } }, select: { requestNumber: true } }),
    ]);
    if (existingWos.length || existingMrs.length) {
      return NextResponse.json({ success: false, error: 'Historical identities already exist; import remains idempotently blocked' }, { status: 409 });
    }

    const imported = await db.$transaction(async (tx) => {
      const result: Array<{ maintenanceRequestId: string; workOrderId: string; requestNumber: string; woNumber: string }> = [];

      for (const row of rows) {
        const asset = row.assetId ? assetById.get(row.assetId) : null;
        if (row.assetId && !asset) throw new Error('Approved Asset disappeared during import');
        if (!asset && !allowsNullAsset(row.assetResolution)) {
          throw new Error('Resolved equipment-backed historical row has no approved Asset');
        }

        const duplicateWo = await tx.workOrder.findUnique({ where: { woNumber: row.proposedWorkOrder.woNumber }, select: { id: true } });
        const duplicateMr = await tx.maintenanceRequest.findUnique({ where: { requestNumber: row.proposedMaintenanceRequest.requestNumber }, select: { id: true } });
        if (duplicateWo || duplicateMr) throw new Error('Historical identity collision detected during transaction');

        const provenance = JSON.stringify({
          source: 'GTP historical workbook',
          legacyRowNumber: row.legacyRowNumber,
          legacyWorkOrderNo: row.legacyWorkOrderNo,
          legacyPeople: row.legacyPeople || {},
          manifestFingerprint: manifest.fingerprint,
          migrationPlantId: manifest.migrationPlantId,
          assetResolution: row.assetResolution || null,
          sourceAssetName: row.assetName || null,
        });

        const mr = await tx.maintenanceRequest.create({
          data: {
            requestNumber: row.proposedMaintenanceRequest.requestNumber,
            title: row.proposedMaintenanceRequest.title,
            description: provenance,
            priority: row.proposedMaintenanceRequest.priority || 'medium',
            category: row.trade || undefined,
            status: row.proposedMaintenanceRequest.status || 'converted',
            workflowStatus: row.proposedMaintenanceRequest.workflowStatus || 'closed',
            assetId: asset?.id,
            assetName: asset?.name || row.assetName || historicalAssetLabel(row.assetResolution),
            requestedBy: session.userId,
            plantId: manifest.migrationPlantId,
            createdAt: asDate(row.proposedMaintenanceRequest.createdAt || row.reportedAt),
          },
        });

        const wo = await tx.workOrder.create({
          data: {
            woNumber: row.proposedWorkOrder.woNumber,
            title: row.proposedWorkOrder.title,
            description: provenance,
            type: row.proposedWorkOrder.type || 'corrective',
            priority: row.proposedWorkOrder.priority || 'medium',
            status: row.proposedWorkOrder.status || 'closed',
            maintenanceRequestId: mr.id,
            assetId: asset?.id,
            assetName: asset?.name || row.assetName || historicalAssetLabel(row.assetResolution),
            plantId: manifest.migrationPlantId,
            plannerId: session.userId,
            tradeActivity: row.proposedWorkOrder.tradeActivity || row.trade || undefined,
            actualStart: asDate(row.proposedWorkOrder.actualStart || row.workStartedAt),
            actualEnd: asDate(row.proposedWorkOrder.actualEnd || row.workCompletedAt),
            notes: provenance,
            createdAt: asDate(row.reportedAt),
          },
        });

        await tx.maintenanceRequest.update({ where: { id: mr.id }, data: { workOrderId: wo.id } });
        await tx.auditLog.create({
          data: {
            userId: session.userId,
            action: 'historical_import',
            entityType: 'work_order',
            entityId: wo.id,
            newValues: JSON.stringify({
              requestNumber: mr.requestNumber,
              woNumber: wo.woNumber,
              legacyWorkOrderNo: row.legacyWorkOrderNo,
              manifestFingerprint: manifest.fingerprint,
              sourceSha256: manifest.source.sha256,
            }),
            plantId: manifest.migrationPlantId,
          },
        });
        result.push({ maintenanceRequestId: mr.id, workOrderId: wo.id, requestNumber: mr.requestNumber, woNumber: wo.woNumber });
      }
      return result;
    });

    return NextResponse.json({
      success: true,
      imported: imported.length,
      fingerprint: manifest.fingerprint,
      sourceSha256: manifest.source.sha256,
      records: imported,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Historical import failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
