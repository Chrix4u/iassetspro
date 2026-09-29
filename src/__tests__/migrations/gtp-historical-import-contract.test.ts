import fs from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  fingerprintManifestCore,
  signManifestFingerprint,
  verifyManifestSignature,
} from '@/lib/gtp-migration-manifest';

const auditRoute = fs.readFileSync('src/app/api/admin/gtp-migration/audit/route.ts', 'utf8');
const importRoute = fs.readFileSync('src/app/api/admin/gtp-migration/import/route.ts', 'utf8');
const parityRoute = fs.readFileSync('src/app/api/admin/gtp-migration/parity/route.ts', 'utf8');

describe('signed GTP historical import gate', () => {
  const previousKey = process.env.GTP_MIGRATION_SIGNING_KEY;

  afterEach(() => {
    if (previousKey === undefined) delete process.env.GTP_MIGRATION_SIGNING_KEY;
    else process.env.GTP_MIGRATION_SIGNING_KEY = previousKey;
  });

  it('fingerprints and signs the exact canonical manifest core', () => {
    process.env.GTP_MIGRATION_SIGNING_KEY = 'test-only-signing-key';
    const core = {
      schemaVersion: 'gtp-historical-import-preview/v1',
      source: { fileName: 'gtp.xlsm', sizeBytes: 123, sha256: 'a'.repeat(64) },
      reconciliation: { overrides: [], reportedTimeCorrections: [], equipmentMappings: [] },
      migrationActorUserId: 'admin-1',
      migrationPlantId: 'plant-1',
      identityConvention: { maintenanceRequest: 'GTP-MR-{legacyWorkOrderNo}', workOrder: 'GTP-WO-{legacyWorkOrderNo}' },
      counts: { rows: 0, maintenanceRequests: 0, workOrders: 0 },
      workbookParity: {
        authoritativeJobRecords: 2807,
        authoritativeBreakdowns: 411,
        priorityOneBreakdowns: 236,
        priorityOneResponseMinutes: 308180,
        breakdownPivotFresh: false,
        breakdownWeekMismatches: [{ week: '32', source: 6, cachedPivot: 7 }],
        legacyDowntimeFormulaErrorRows: [],
      },
      rows: [],
    };
    const fingerprint = fingerprintManifestCore(core);
    const signature = signManifestFingerprint(fingerprint);
    expect(fingerprint).toHaveLength(64);
    expect(signature).toHaveLength(64);
    expect(verifyManifestSignature(fingerprint, signature!)).toBe(true);
    expect(verifyManifestSignature('b'.repeat(64), signature!)).toBe(false);
  });

  it('keeps preview generation zero-write while adding execution approval', () => {
    expect(auditRoute).toContain('signManifestFingerprint');
    expect(auditRoute).toContain('approvalSignature');
    expect(auditRoute).toContain('executionReady');
    expect(auditRoute).toContain('GTP_MIGRATION_SIGNING_KEY');
    expect(auditRoute).not.toContain('db.workOrder.create');
    expect(auditRoute).not.toContain('db.maintenanceRequest.create');
  });

  it('requires workbook, fingerprint, signed manifest, asset binding and transaction', () => {
    expect(importRoute).toContain("formData.get('manifest')");
    expect(importRoute).toContain("formData.get('file')");
    expect(importRoute).toContain("formData.get('fingerprint')");
    expect(importRoute).toContain('verifyManifestSignature');
    expect(importRoute).toContain('workbookSha256 !== manifest.source.sha256');
    expect(importRoute).toContain('manifest.migrationActorUserId !== session.userId');
    expect(importRoute).toContain('manifest.migrationPlantId');
    expect(importRoute).toContain('Approved migration plant no longer exists or is inactive');
    expect(importRoute).toContain('Approved Assets no longer belong to the signed migration plant');
    expect(importRoute).toContain("resolution === 'historical_unassigned'");
    expect(importRoute).toContain('Every resolved equipment-backed import row must bind to a real Asset');
    expect(importRoute).toContain("'Non-equipment work'");
    expect(importRoute).toContain("'Unassigned historical work'");
    expect(importRoute).toContain('assetResolution: row.assetResolution || null');
    expect(importRoute).toContain('reconciliationReason: row.reconciliationReason || null');
    expect(importRoute).toContain('db.$transaction');
    expect(importRoute).toContain('tx.maintenanceRequest.create');
    expect(importRoute).toContain('tx.workOrder.create');
    expect(importRoute).toContain("action: 'historical_import'");
  });

  it('verifies audit rows and bidirectional MR/WO links before commit', () => {
    expect(importRoute).toContain('auditInsert.count !== rows.length');
    expect(importRoute).toContain('Historical audit-log batch insert was incomplete');
    expect(importRoute).toContain('verifiedMrs');
    expect(importRoute).toContain('verifiedWos');
    expect(importRoute).toContain('verifiedAudits');
    expect(importRoute).toContain('Historical import commit verification count mismatch');
    expect(importRoute).toContain('Historical maintenance request is missing its work-order link');
    expect(importRoute).toContain('Historical MR/WO relationship verification failed');
    expect(importRoute).toContain("transactionIsolation: 'Serializable'");
    expect(importRoute).toContain('linkedPairs: imported.length');
  });

  it('uses a bounded serializable batch transaction for full-workbook execution', () => {
    expect(importRoute).toContain('createManyAndReturn');
    expect(importRoute).toContain('tx.maintenanceRequest.createManyAndReturn');
    expect(importRoute).toContain('tx.workOrder.createManyAndReturn');
    expect(importRoute).toContain('tx.auditLog.createMany');
    expect(importRoute).toContain('LINK_CHUNK_SIZE = 500');
    expect(importRoute).toContain('Prisma.TransactionIsolationLevel.Serializable');
    expect(importRoute).toContain('timeout: 120_000');
    expect(importRoute).toContain('maxWait: 10_000');
    expect(importRoute).toContain('Historical identity collision detected during transaction');
    expect(importRoute).toContain("error.code === 'P2034'");
    expect(importRoute).toContain("error.code === 'P2002'");
    expect(importRoute).toContain('status: prismaConflict || stateConflict ? 409 : 500');
    expect(importRoute).not.toContain('for (const row of rows) {\n        const asset =');
    expect(importRoute).not.toContain('tx.maintenanceRequest.create({');
    expect(importRoute).not.toContain('tx.workOrder.create({');
    expect(importRoute).not.toContain('tx.auditLog.create({');
    expect(importRoute).not.toContain('tx.workOrder.findUnique');
    expect(importRoute).not.toContain('tx.maintenanceRequest.findUnique');
  });

  it('binds post-import parity to the signed workbook baseline', () => {
    expect(auditRoute).toContain('workbookParity,');
    expect(importRoute).toContain('workbookParity: manifest.workbookParity');
    expect(parityRoute).toContain('fingerprintManifestCore');
    expect(parityRoute).toContain('verifyManifestSignature');
    expect(parityRoute).toContain('source.authoritativeJobRecords');
    expect(parityRoute).toContain('source.authoritativeBreakdowns');
    expect(parityRoute).toContain('source.priorityOneBreakdowns');
    expect(parityRoute).toContain('source.priorityOneResponseMinutes');
    expect(parityRoute).toContain("schemaVersion: 'gtp-post-import-parity/v1'");
    expect(parityRoute).toContain('allPassed');
  });

  it('refuses non-canonical or already-imported identities', () => {
    expect(importRoute).toContain('GTP-MR-');
    expect(importRoute).toContain('GTP-WO-');
    expect(importRoute).toContain('Historical identities already exist');
    expect(importRoute).toContain('Historical identity collision detected during transaction');
  });
});