import fs from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  fingerprintManifestCore,
  signManifestFingerprint,
  verifyManifestSignature,
} from '@/lib/gtp-migration-manifest';

const auditRoute = fs.readFileSync('src/app/api/admin/gtp-migration/audit/route.ts', 'utf8');
const importRoute = fs.readFileSync('src/app/api/admin/gtp-migration/import/route.ts', 'utf8');

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
      identityConvention: { maintenanceRequest: 'GTP-MR-{legacyWorkOrderNo}', workOrder: 'GTP-WO-{legacyWorkOrderNo}' },
      counts: { rows: 0, maintenanceRequests: 0, workOrders: 0 },
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
    expect(importRoute).toContain("rows.some((row) => !row.assetId)");
    expect(importRoute).toContain('db.$transaction');
    expect(importRoute).toContain('tx.maintenanceRequest.create');
    expect(importRoute).toContain('tx.workOrder.create');
    expect(importRoute).toContain("action: 'historical_import'");
  });

  it('refuses non-canonical or already-imported identities', () => {
    expect(importRoute).toContain('GTP-MR-');
    expect(importRoute).toContain('GTP-WO-');
    expect(importRoute).toContain('Historical identities already exist');
    expect(importRoute).toContain('Historical identity collision detected during transaction');
  });
});
