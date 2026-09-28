import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const route = fs.readFileSync('src/app/api/admin/gtp-migration/audit/route.ts', 'utf8');
const page = fs.readFileSync('src/components/modules/GtpMigrationPage.tsx', 'utf8');
const app = fs.readFileSync('src/components/EAMApp.tsx', 'utf8');
const sidebar = fs.readFileSync('src/components/shared/Sidebar.tsx', 'utf8');
const access = fs.readFileSync('src/lib/page-access.ts', 'utf8');

describe('GTP migration reconciliation console', () => {
  it('is admin-only and dry-run only', () => {
    expect(route).toContain('isAdmin(session)');
    expect(route).toContain('dryRun: true');
    expect(route).toContain('importLocked: true');
    expect(route).not.toContain('db.workOrder.create');
    expect(route).not.toContain('db.maintenanceRequest.create');
    expect(page).toContain('Historical import is locked');
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
    expect(route).toContain("where: { assetTag: { in: directEquipmentCodes } }");
    expect(route).toContain('tenantReadiness');
    expect(route).toContain('unlinkedEquipmentCodes');
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