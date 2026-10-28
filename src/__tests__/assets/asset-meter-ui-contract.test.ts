import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  try { return readFileSync(resolve(process.cwd(), path), 'utf8'); } catch { return ''; }
}

const panelSource = source('src/components/assets/AssetMetersPanel.tsx');
const pmFormSource = source('src/components/modules/pm/PmAssignmentFormDialog.tsx');
const pmPlannerSource = source('src/components/modules/pm/PmAssignmentTaskPlanner.tsx');
const pmRowSource = source('src/components/modules/pm/PmAssignmentTaskCard.tsx');
const assetDetailSource = source('src/components/modules/AssetDetailPage.tsx');

describe('first-class asset meter UI contract', () => {
  it('manages meter definitions directly on the selected asset', () => {
    expect(panelSource).toContain('/api/assets/');
    expect(panelSource).toContain('/meters');
    expect(panelSource).toContain('Add Meter');
    expect(panelSource).toContain('Meter name');
    expect(panelSource).toContain('Unit');
    expect(panelSource).toContain('Initial reading');
    expect(panelSource).toContain('Current Reading');
  });

  it('provides a permission-gated Meters tab on Asset Details for meter administration', () => {
    expect(assetDetailSource).toContain('AssetMetersPanel');
    expect(assetDetailSource).toContain("id: 'meters'");
    expect(assetDetailSource).toContain('value="meters"');
    expect(assetDetailSource).toContain("hasPermission('meters.view')");
    expect(assetDetailSource).toContain("hasPermission('meters.create')");
    expect(assetDetailSource).toContain("hasPermission('meters.update')");
  });

  it('records a new authoritative reading against a specific asset meter', () => {
    expect(panelSource).toContain('api.patch');
    expect(panelSource).toContain('readingDate');
    expect(panelSource).toContain('Record Reading');
  });

  it('keeps meter administration on the asset instead of embedding it in PM assignment authoring', () => {
    expect(pmFormSource).not.toContain('AssetMetersPanel');
    expect(pmFormSource).not.toContain('Add Meter');
    expect(pmFormSource).not.toContain('Manage Meter');
    expect(pmPlannerSource).toContain('/api/assets/');
    expect(pmPlannerSource).toContain('/meters');
    expect(pmRowSource).toContain('assetMeterId');
  });

  it('fails closed for meter master mutations while preserving read-only UBM selection', () => {
    expect(panelSource).toContain('canCreate');
    expect(panelSource).toContain('canRecordReading');
    expect(panelSource).toContain('{canCreate && (');
    expect(panelSource).toContain('{canRecordReading && (');
    expect(pmRowSource).toContain('Current');
    expect(pmRowSource).toContain('meter.unit');
  });
});
