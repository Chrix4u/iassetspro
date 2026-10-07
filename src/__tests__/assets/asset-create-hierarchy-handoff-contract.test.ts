import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const assetPages = fs.readFileSync('src/components/modules/AssetPages.tsx', 'utf8');
const assetDetail = fs.readFileSync('src/components/modules/AssetDetailPage.tsx', 'utf8');

describe('asset creation to hierarchy commissioning handoff', () => {
  it('submits asset creation in the plant selected in the form, not a stale global plant context', () => {
    expect(assetPages).toContain("api.post('/api/assets', payload, { headers: { 'x-plant-id': form.plantId } })");
  });

  it('opens the new asset directly on its hierarchy/components workspace and switches plant context when needed', () => {
    expect(assetPages).toContain("navigate('assets-machines', { id: createdAssetId, tab: 'components' })");
    expect(assetPages).toContain("localStorage.setItem('user_plant_id', form.plantId)");
    expect(assetPages).toContain('window.location.reload()');
  });

  it('uses hierarchy language rather than calling every node a component', () => {
    expect(assetDetail).toContain('Register New Hierarchy Item');
    expect(assetDetail).toContain('Add Hierarchy Item');
    expect(assetDetail).toContain('Register Item');
    expect(assetDetail).toContain('<SelectItem value="assembly">Assembly</SelectItem>');
    expect(assetDetail).toContain('<SelectItem value="subassembly">Sub-Assembly</SelectItem>');
    expect(assetDetail).toContain('<SelectItem value="component">Component</SelectItem>');
    expect(assetDetail).toContain('<SelectItem value="part">Part</SelectItem>');
  });
});
