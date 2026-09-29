import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const route = fs.readFileSync('src/app/api/admin/gtp-migration/audit/route.ts', 'utf8');
const page = fs.readFileSync('src/components/modules/GtpMigrationPage.tsx', 'utf8');
const app = fs.readFileSync('src/components/EAMApp.tsx', 'utf8');
const sidebar = fs.readFileSync('src/components/shared/Sidebar.tsx', 'utf8');
const access = fs.readFileSync('src/lib/page-access.ts', 'utf8');

describe('GTP migration reconciliation console', () => {
  it('uses the canonical request-session auth helper', () => {
    expect(route).toContain("import { getSession, isAdmin } from '@/lib/auth'");
    expect(route).toContain('const session = getSession(request)');
    expect(route).not.toContain('getSessionAsync(request)');
  });

  it('is admin-only and dry-run only', () => {
    expect(route).toContain('isAdmin(session)');
    expect(route).toContain('dryRun: true');
    expect(route).toContain('importLocked: true');
    expect(route).not.toContain('db.workOrder.create');
    expect(route).not.toContain('db.maintenanceRequest.create');
    expect(page).toContain('Historical import execution is gated');
  });

  it('validates the authoritative workbook structure', () => {
    for (const sheet of ['JobRecords', 'Machines', 'Trade', 'NewOder']) {
      expect(route).toContain("'" + sheet + "'");
    }
    expect(route).toContain('bookVBA: true');
    expect(route).toContain('/\\.(xlsm|xlsx)$/i');
  });

  it('accepts dry-run reconciliation overrides without enabling historical writes', () => {
    expect(route).toContain("formData.get('overrides')");
    expect(route).toContain("action: 'asset' | 'non_equipment'");
    expect(route).toContain('db.asset.findMany');
    expect(route).toContain('APP-ASSET:');
    expect(route).toContain('NON-EQUIPMENT:');
    expect(route).not.toContain('db.asset.update');
    expect(route).not.toContain('db.workOrder.create');
    expect(page).toContain('Apply Resolutions & Re-audit');
    expect(page).toContain('Map to existing Asset');
    expect(page).toContain('Non-equipment work');
    expect(page).toContain('Unassigned historical work');
    expect(route).toContain("'historical_unassigned'");
    expect(route).toContain('historicalUnassignedRows');
    expect(page).toContain('legacy Asset identity is intentionally preserved as unknown');
    expect(route).toContain('provenance reason of at least 8 characters');
    expect(route).toContain('reconciliationReason');
    expect(page).toContain('Resolution reason / provenance');
    expect(page).toContain('signed into the approved manifest');
    expect(page).toContain('minimum 8 characters');
    expect(page).toContain('AsyncSearchableSelect');
  });


  it('supports provenance-backed reported-time correction in dry-run only', () => {
    expect(route).toContain("formData.get('reportedTimeCorrections')");
    expect(route).toContain('Reported time can only be corrected when the legacy row is missing it');
    expect(route).toContain('reportedTimeCorrectionsApplied');
    expect(route).not.toContain('db.workOrder.update');
    expect(route).not.toContain('db.maintenanceRequest.update');
    expect(page).toContain('Missing Reported Time');
    expect(page).toContain('Apply Time Corrections & Re-audit');
    expect(page).toContain('Reason / provenance');
    expect(page).toContain('type="datetime-local"');
  });


  it('separates workbook readiness from tenant Asset-link readiness', () => {
    expect(route).toContain("assetTag: { in: directEquipmentCodes }");
    expect(route).toContain("specification: { contains: '\"legacyCode\"' }");
    expect(route).toContain('resolveLegacyMetadataAsset');
    expect(route).toContain('tenantReadiness');
    expect(route).toContain('unlinkedEquipmentCodes');
    expect(route).toContain('migrationPlantId');
    expect(route).toContain('plantScopeBlockers');
    expect(route).toContain('must be split before import');
    expect(route).toContain("'asset_tag_match'");
    expect(route).toContain("'admin_asset_override'");
    expect(route).toContain("'non_equipment'");
    expect(route).not.toContain('db.asset.create');
    expect(page).toContain('iAssetsPro Asset Linkage');
    expect(page).toContain('Tenant-ready rows');
    expect(page).toContain('Asset-link blocked');
    expect(page).toContain('Unlinked legacy equipment codes');
  });


  it('maps unlinked legacy equipment codes to existing tenant Assets in dry-run only', () => {
    expect(route).toContain("formData.get('equipmentMappings')");
    expect(route).toContain("resolution: 'legacy_code_mapping'");
    expect(route).toContain('legacyCodeMappedRows');
    expect(route).not.toContain('db.asset.create');
    expect(route).not.toContain('db.asset.update');
    expect(page).toContain('Apply Equipment Mappings & Re-audit');
    expect(page).toContain('Map each legacy machine code to an existing Asset');
    expect(page).toContain('Map to existing Asset...');
    expect(route).toContain("resolution: 'legacy_metadata_match'");
    expect(route).toContain('legacyMetadataMatchedRows');
    expect(page).toContain('Legacy metadata matches');
    expect(route).toContain("resolution: 'duplicate_variant_unconfirmed'");
    expect(page).toContain('Duplicate Machine Variant Asset Confirmation');
    expect(page).toContain('Confirm exact Asset...');
  });

  it('surfaces advisory historical evidence for blank machine-code reconciliation', () => {
    expect(route).toContain('EVIDENCE_STOP_WORDS');
    expect(route).toContain('evidenceSimilarity');
    expect(route).toContain('shared.length < 2');
    expect(route).toContain('.slice(0, 3)');
    expect(route).toContain('legacyAssets.length === 1');
    expect(route).toContain('matchScore: Math.min(0.99');
    expect(page).toContain('Historical evidence suggestions');
    expect(page).toContain('% match');
    expect(page).toContain('supporting historical row');
    expect(page).toContain('Evidence only — this legacy code does not resolve uniquely to one current Asset.');
    expect(page).toContain('Suggestions are advisory only. Confirm the physical Asset before applying a mapping.');
    expect(page).toContain("setRowOverride(row.rowNumber, { action: 'asset', assetId: suggestion.assetId! })");
  });

  it('builds a zero-write transactional import preview with idempotency checks', () => {
    expect(route).toContain("formData.get('preview')");
    expect(route).toContain("createHash('sha256')");
    expect(route).toContain('previewFingerprint');
    expect(route).toContain('sourceSha256');
    expect(route).toContain("GTP-MR-");
    expect(route).toContain("GTP-WO-");
    expect(route).toContain('db.workOrder.findMany');
    expect(route).toContain('db.maintenanceRequest.findMany');
    expect(route).toContain('sourceIdentityCollisions');
    expect(route).toContain('idempotencyCollisions');
    expect(route).not.toContain('db.workOrder.create');
    expect(route).not.toContain('db.maintenanceRequest.create');
    expect(page).toContain('Generate Transactional Import Preview');
    expect(page).toContain('Preview only — no records will be written');
    expect(page).toContain('Preview fingerprint');
    expect(page).toContain('Generate a signed transactional preview; execution remains locked until all approval gates are satisfied.');
    expect(page).toContain('Historical import execution is ready');
    expect(page).toContain('Historical Import Receipt');
    expect(page).toContain('already been imported in this session');
  });

  it('builds a downloadable approved preview manifest without enabling writes', () => {
    expect(route).toContain("schemaVersion: 'gtp-historical-import-preview/v1'");
    expect(route).toContain('manifestCore');
    expect(route).toContain('approvedManifest');
    expect(route).toContain('manifest: approvedManifest');
    expect(route).not.toContain('db.workOrder.create');
    expect(route).not.toContain('db.maintenanceRequest.create');
    expect(page).toContain('Download Approved Preview Manifest');
    expect(page).toContain('downloadPreviewManifest');
    expect(page).toContain('gtp-approved-preview-');
  });

  it('keeps normal dry-run audit separate from transactional preview mode', () => {
    expect(page).toContain('onClick={() => void runAudit()}');
    expect(page).toContain('onClick={() => void runAudit(true)}');
    expect(page).not.toContain('onClick={runAudit}');
  });

  it('surfaces reconciliation findings', () => {
    expect(route).toContain('duplicateMachines');
    expect(route).toContain('blankMachineCodeRows');
    expect(route).toContain('tradeNormalizations');
    expect(route).toContain('blockedRows');
    expect(page).toContain('Machine Master Conflicts');
    expect(page).toContain('Rows With No Machine Code');
    expect(page).toContain('Trade Normalization');
    expect(page).toContain('Data Quality Findings');
  });

  it('registers the admin settings page', () => {
    expect(app).toContain("'settings-gtp-migration': 'GTP Data Migration'");
    expect(app).toContain("import('./modules/GtpMigrationPage')");
    expect(sidebar).toContain("{ page: 'settings-gtp-migration', label: 'GTP Data Migration'");
    expect(access).toContain("'settings-gtp-migration': ['system_settings.view']");
    expect(access).toContain("'settings-gtp-migration': 'core'");
  });
});