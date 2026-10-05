import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const panel = fs.readFileSync('src/components/digital-twin/ComponentInfoPanel.tsx', 'utf8');
const store = fs.readFileSync('src/stores/digitalTwinStore.ts', 'utf8');
const maintenance = fs.readFileSync('src/components/modules/MaintenancePages.tsx', 'utf8');
const diagrams = fs.readFileSync('src/components/digital-twin/SystemDiagramPage.tsx', 'utf8');
const mappingEditor = fs.readFileSync('src/components/digital-twin/ComponentMappingEditor.tsx', 'utf8');
const mappingService = fs.readFileSync('src/services/componentMapping.service.ts', 'utf8');

describe('digital twin component panel live maintenance context', () => {
  it('resolves a selected mesh through the component mapping layer', () => {
    expect(store).toContain('modelId?: string');
    expect(panel).toContain("mappingType: 'component'");
    expect(panel).toContain('/api/mesh-mappings?');
    expect(panel).toContain('/api/component-registry/');
    expect(panel).toContain('mappedComponent');
  });

  it('uses live component-linked maintenance resources instead of demo rows', () => {
    expect(panel).toContain('componentSpareParts');
    expect(panel).toContain('componentTools');
    expect(panel).toContain('componentHistory');
    expect(panel).toContain('inventory?.currentStock');
    expect(panel).toContain("field(tool, 'status'");
    expect(panel).not.toContain('Bearing Assembly');
    expect(panel).not.toContain('Seal Kit - Primary');
    expect(panel).not.toContain('Vibration Analyzer');
  });

  it('routes quick actions into standard workflows with context', () => {
    expect(panel).toContain("navigate('maintenance-work-orders', params)");
    expect(panel).toContain("navigate('maintenance-requests', params)");
    expect(panel).toContain("navigate('system-diagrams', params)");
    expect(panel).toContain("params.componentId = mappedComponentId");
    expect(panel).toContain("params.assetId = selectedAssetId");

    expect(maintenance).toContain("if (pageParams?.create === 'true')");
    expect(maintenance).toContain("if (pageParams.create === 'true')");
    expect(maintenance).toContain('initialAssetId={pageParams?.assetId}');
    expect(maintenance).toContain('initialComponentId={pageParams?.componentId}');
    expect(maintenance).toContain('componentIds: initialComponentId ? [initialComponentId]');
    expect(diagrams).toContain("params.set('assetId', diagramAssetId)");
  });

  it('keeps mesh mapping service aligned with the current PostgreSQL schema', () => {
    expect(mappingService).toContain('meshName: string');
    expect(mappingService).toContain('targetId: string');
    expect(mappingService).toContain('meshPath: meshPath || meshName');
    expect(mappingService).not.toContain('meshId: string');
    expect(mappingService).not.toContain('componentId?: string');
    expect(mappingService).not.toContain('confidence?: number');
    expect(mappingEditor).toContain("api.post('/api/mesh-mappings', { modelId, ...addForm })");
  });
});
