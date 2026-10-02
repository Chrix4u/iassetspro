import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const GTP_MANIFEST_SCHEMA = 'gtp-historical-import-preview/v1';

export type GtpManifestCore = {
  schemaVersion: string;
  source: { fileName: string; sizeBytes: number; sha256: string };
  reconciliation: {
    overrides: unknown[];
    reportedTimeCorrections: unknown[];
    equipmentMappings: unknown[];
  };
  migrationActorUserId: string;
  migrationPlantId: string;
  identityConvention: { maintenanceRequest: string; workOrder: string };
  counts: { rows: number; maintenanceRequests: number; workOrders: number };
  workbookParity?: {
    authoritativeJobRecords: number;
    authoritativeBreakdowns: number;
    priorityOneBreakdowns: number;
    priorityOneResponseMinutes: number;
    breakdownPivotFresh: boolean;
    breakdownWeekMismatches: Array<{ week: string; source: number; cachedPivot: number }>;
    legacyDowntimeFormulaErrorRows: Array<{ rowNumber: number; workOrderNo: string; equipmentDescription: string; value: string }>;
    [key: string]: unknown;
  };
  rows: unknown[];
};

export function fingerprintManifestCore(core: GtpManifestCore): string {
  return createHash('sha256').update(JSON.stringify(core)).digest('hex');
}

export function signManifestFingerprint(fingerprint: string): string | null {
  const key = process.env.GTP_MIGRATION_SIGNING_KEY;
  if (!key) return null;
  return createHmac('sha256', key).update(fingerprint).digest('hex');
}

export function verifyManifestSignature(fingerprint: string, signature: string): boolean {
  const expected = signManifestFingerprint(fingerprint);
  if (!expected || !/^[a-f0-9]{64}$/i.test(signature) || expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
}
