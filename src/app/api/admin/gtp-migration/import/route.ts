import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
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
  reconciliationReason?: string | null;
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
      // Revalidate mutable database state inside the same serializable transaction
      // that performs the import. This closes the gap between preview/request-time
      // validation and the actual historical write.
      const [txPlant, txAssets, txExistingWos, txExistingMrs] = await Promise.all([
        tx.plant.findFirst({
          where: { id: manifest.migrationPlantId, isActive: true },
          select: { id: true },
        }),
        assetIds.length
          ? tx.asset.findMany({
              where: { id: { in: assetIds }, isActive: true },
              select: { id: true, name: true, plantId: true },
            })
          : Promise.resolve([]),
        tx.workOrder.findMany({ where: { woNumber: { in: woNumbers } }, select: { woNumber: true } }),
        tx.maintenanceRequest.findMany({ where: { requestNumber: { in: requestNumbers } }, select: { requestNumber: true } }),
      ]);

      if (!txPlant) throw new Error('Approved migration plant changed before transaction execution');
      const txAssetById = new Map(txAssets.map((asset) => [asset.id, asset]));
      if (assetIds.some((id) => !txAssetById.has(id))) {
        throw new Error('One or more approved Assets changed before transaction execution');
      }
      if (txAssets.some((asset) => asset.plantId !== manifest.migrationPlantId)) {
        throw new Error('Approved Asset plant scope changed before transaction execution');
      }
      if (txExistingWos.length || txExistingMrs.length) {
        throw new Error('Historical identity collision detected during transaction');
      }

      const prepared = rows.map((row) => {
        const asset = row.assetId ? txAssetById.get(row.assetId) : null;
        if (!asset && !allowsNullAsset(row.assetResolution)) {
          throw new Error('Resolved equipment-backed historical row has no approved Asset');
        }
        const provenance = JSON.stringify({
          source: 'GTP historical workbook',
          legacyRowNumber: row.legacyRowNumber,
          legacyWorkOrderNo: row.legacyWorkOrderNo,
          legacyPeople: row.legacyPeople || {},
          manifestFingerprint: manifest.fingerprint,
          migrationPlantId: manifest.migrationPlantId,
          assetResolution: row.assetResolution || null,
          reconciliationReason: row.reconciliationReason || null,
          sourceAssetName: row.assetName || null,
        });
        const resolvedAssetName = asset?.name || row.assetName || historicalAssetLabel(row.assetResolution);

        return { row, asset, provenance, resolvedAssetName };
      });

      const createdMrs = await tx.maintenanceRequest.createManyAndReturn({
        data: prepared.map(({ row, asset, provenance, resolvedAssetName }) => ({
          requestNumber: row.proposedMaintenanceRequest.requestNumber,
          title: row.proposedMaintenanceRequest.title,
          description: provenance,
          priority: row.proposedMaintenanceRequest.priority || 'medium',
          category: row.trade || undefined,
          status: row.proposedMaintenanceRequest.status || 'converted',
          workflowStatus: row.proposedMaintenanceRequest.workflowStatus || 'closed',
          assetId: asset?.id,
          assetName: resolvedAssetName,
          requestedBy: session.userId,
          plantId: manifest.migrationPlantId,
          createdAt: asDate(row.proposedMaintenanceRequest.createdAt || row.reportedAt),
        })),
        select: { id: true, requestNumber: true },
      });
      if (createdMrs.length !== rows.length) throw new Error('Historical maintenance-request batch insert was incomplete');

      const mrByRequestNumber = new Map(createdMrs.map((mr) => [mr.requestNumber, mr]));
      const createdWos = await tx.workOrder.createManyAndReturn({
        data: prepared.map(({ row, asset, provenance, resolvedAssetName }) => {
          const mr = mrByRequestNumber.get(row.proposedMaintenanceRequest.requestNumber);
          if (!mr) throw new Error('Created historical maintenance request could not be resolved');
          return {
            woNumber: row.proposedWorkOrder.woNumber,
            title: row.proposedWorkOrder.title,
            description: provenance,
            type: row.proposedWorkOrder.type || 'corrective',
            priority: row.proposedWorkOrder.priority || 'medium',
            status: row.proposedWorkOrder.status || 'closed',
            maintenanceRequestId: mr.id,
            assetId: asset?.id,
            assetName: resolvedAssetName,
            plantId: manifest.migrationPlantId,
            plannerId: session.userId,
            tradeActivity: row.proposedWorkOrder.tradeActivity || row.trade || undefined,
            actualStart: asDate(row.proposedWorkOrder.actualStart || row.workStartedAt),
            actualEnd: asDate(row.proposedWorkOrder.actualEnd || row.workCompletedAt),
            notes: provenance,
            createdAt: asDate(row.reportedAt),
          };
        }),
        select: { id: true, woNumber: true, maintenanceRequestId: true },
      });
      if (createdWos.length !== rows.length) throw new Error('Historical work-order batch insert was incomplete');

      // Preserve the legacy MR -> WO direct pointer used by conversion guards and
      // reporting. Chunk the set-based update to keep each SQL statement compact.
      const linkRows = createdWos
        .filter((wo): wo is typeof wo & { maintenanceRequestId: string } => Boolean(wo.maintenanceRequestId))
        .map((wo) => ({ maintenanceRequestId: wo.maintenanceRequestId, workOrderId: wo.id }));
      const LINK_CHUNK_SIZE = 500;
      for (let offset = 0; offset < linkRows.length; offset += LINK_CHUNK_SIZE) {
        const chunk = linkRows.slice(offset, offset + LINK_CHUNK_SIZE);
        const values = Prisma.join(
          chunk.map((link) => Prisma.sql`(${link.maintenanceRequestId}, ${link.workOrderId})`),
        );
        await tx.$executeRaw(Prisma.sql`
          UPDATE "maintenance_requests" AS mr
          SET "workOrderId" = links.work_order_id
          FROM (VALUES ${values}) AS links(maintenance_request_id, work_order_id)
          WHERE mr.id = links.maintenance_request_id
        `);
      }

      const preparedByWoNumber = new Map(prepared.map((item) => [item.row.proposedWorkOrder.woNumber, item]));
      await tx.auditLog.createMany({
        data: createdWos.map((wo) => {
          const item = preparedByWoNumber.get(wo.woNumber);
          if (!item) throw new Error('Created historical work order could not be matched for audit');
          const mr = mrByRequestNumber.get(item.row.proposedMaintenanceRequest.requestNumber);
          if (!mr) throw new Error('Created historical maintenance request could not be matched for audit');
          return {
            userId: session.userId,
            action: 'historical_import',
            entityType: 'work_order',
            entityId: wo.id,
            newValues: JSON.stringify({
              requestNumber: mr.requestNumber,
              woNumber: wo.woNumber,
              legacyWorkOrderNo: item.row.legacyWorkOrderNo,
              manifestFingerprint: manifest.fingerprint,
              sourceSha256: manifest.source.sha256,
              migrationPlantId: manifest.migrationPlantId,
              assetResolution: item.row.assetResolution || null,
            }),
            plantId: manifest.migrationPlantId,
          };
        }),
      });

      const woByMaintenanceRequestId = new Map(
        createdWos
          .filter((wo): wo is typeof wo & { maintenanceRequestId: string } => Boolean(wo.maintenanceRequestId))
          .map((wo) => [wo.maintenanceRequestId, wo]),
      );

      return createdMrs.map((mr) => {
        const wo = woByMaintenanceRequestId.get(mr.id);
        if (!wo) throw new Error('Historical work-order relationship was not created');
        return {
          maintenanceRequestId: mr.id,
          workOrderId: wo.id,
          requestNumber: mr.requestNumber,
          woNumber: wo.woNumber,
        };
      });
    }, {
      maxWait: 10_000,
      timeout: 120_000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
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
