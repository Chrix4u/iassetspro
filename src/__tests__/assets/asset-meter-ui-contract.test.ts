import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  try { return readFileSync(resolve(process.cwd(), path), 'utf8'); } catch { return ''; }
}

const panelSource = source('src/components/assets/AssetMetersPanel.tsx');
const pmFormSource = source('src/components/modules/pm/PmAssignmentFormDialog.tsx');

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

  it('records a new authoritative reading against a specific asset meter', () => {
    expect(panelSource).toContain('api.patch');
    expect(panelSource).toContain('readingDate');
    expect(panelSource).toContain('Record Reading');
  });

  it('lets the PM author add a missing meter without leaving the assignment flow', () => {
    expect(pmFormSource).toContain('AssetMetersPanel');
    expect(pmFormSource).toContain('Add Meter');
  });
});
