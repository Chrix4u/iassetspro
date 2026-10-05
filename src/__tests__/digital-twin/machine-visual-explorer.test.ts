import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const explorer = fs.readFileSync('src/components/digital-twin/MachineVisualExplorer.tsx', 'utf8');
const schema = fs.readFileSync('prisma/schema.prisma', 'utf8');
const migration = fs.readFileSync('prisma/migrations/20260927161000_component_visuals/migration.sql', 'utf8');
const generator = fs.readFileSync('scripts/generate-uat-machine-visuals.ts', 'utf8');
const aiClient = fs.readFileSync('src/lib/ai-client.ts', 'utf8');

describe('deep machine visual explorer', () => {
  it('persists visuals independently from component maintenance notes', () => {
    expect(schema).toContain('model ComponentVisual');
    expect(schema).toContain('visualType');
    expect(schema).toContain('hotspotData');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "component_visuals"');
    expect(migration).toContain('component_visuals_target_check');
  });

  it('supports machine-to-part drilling and engineering 2D navigation', () => {
    expect(explorer).toContain('Machine hierarchy');
    expect(explorer).toContain('Deep visual explorer');
    expect(explorer).toContain('EngineeringSchematic');
    expect(explorer).toContain('AI Realistic');
    expect(explorer).toContain('Engineering 2D');
    expect(explorer).toContain('expandedIds');
    expect(explorer).toContain('aria-expanded={expanded}');
    expect(explorer).toContain('onToggle={toggleExpanded}');
    expect(explorer).toContain('Diagram');
    expect(explorer).toContain('Exploded');
    expect(explorer).toContain('Drill into parts');
    expect(explorer).toContain('setSelectedId(item.id)');
    expect(explorer).toContain('ProgrammaticEngineeringView');
    expect(explorer).toContain('deterministic engineering fallback');
    expect(explorer).toContain("childNodes={drillChildren}");
    expect(explorer).toContain('loadAllMachineComponents');
    expect(explorer).toContain("&limit=100&page=' + page");
    expect(explorer).toContain('response.pagination?.totalPages');
    expect(explorer).toContain('Math.min(reportedTotalPages, 1000)');
  });

  it('surfaces component maintenance intelligence inside the drill-down', () => {
    expect(explorer).toContain("api.get('/api/component-registry/' + encodeURIComponent(selectedId))");
    expect(explorer).toContain('Maintenance intelligence');
    expect(explorer).toContain('Preventive maintenance');
    expect(explorer).toContain('Store-linked spares');
    expect(explorer).toContain('Required tools');
    expect(explorer).toContain('Recent maintenance & work orders');
    expect(explorer).toContain('maintenanceHistory');
    expect(explorer).toContain('workOrderComponents');
    expect(explorer).toContain('Loading component maintenance links...');
  });

  it('keeps all three desktop explorer panes independently scrollable beneath sticky asset tabs', () => {
    expect(explorer).toContain('xl:h-[calc(100dvh-5rem)]');
    expect(explorer).toContain('xl:grid-cols-[260px_minmax(0,1fr)_290px] xl:items-stretch');
    expect(explorer).toContain('xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:overflow-hidden');
    expect(explorer).toContain('xl:h-auto xl:min-h-0 xl:flex-1');
    expect(explorer).toContain('xl:h-full xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain');
    expect(explorer).toContain('space-y-4 xl:h-full xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain xl:pr-1');
  });

  it('guides uncommissioned machines into the existing hierarchy workflow', () => {
    expect(explorer).toContain('No component hierarchy yet');
    expect(explorer).toContain('Commission hierarchy');
    expect(explorer).toContain('onCommissionHierarchy');
    expect(explorer).toContain('The asset-level Diagram, Engineering 2D and Exploded views remain available.');
  });

  it('has zoom controls and part-level AI generation', () => {
    expect(explorer).toContain('Math.min(4');
    expect(explorer).toContain('setPointerCapture');
    expect(explorer).toContain('cursor-grab active:cursor-grabbing touch-none');
    expect(explorer).toContain('translate(${pan.x}px, ${pan.y}px) scale(${zoom})');
    expect(explorer).toContain('resetViewport');
    expect(explorer).toContain("api.post('/api/component-visuals/generate'");
    expect(explorer).toContain('componentId: selectedId');
    expect(explorer).toContain('Generate AI visual');
    expect(explorer).toContain('not an OEM drawing or verified as-built photograph');
  });

  it('uses an explicit image provider and normalizes provider image payloads', () => {
    expect(aiClient).toContain('No active AI image provider is configured');
    expect(aiClient).toContain("provider === 'custom'");
    expect(aiClient).toContain('providerDef.imageUrl');
    expect(aiClient).toContain('item.b64_json');
  });

  it('commissions realistic RP-01 visuals through every hierarchy level', () => {
    expect(generator).toContain("assetTag: 'UAT-RP-001'");
    expect(generator).toContain("componentType === 'assembly' ? 1");
    expect(generator).toContain("visualTypes = ['ai_realistic', 'technical_2d']");
    expect(generator).toContain("target.zoomLevel >= 3");
    expect(generator).toContain("visualType === 'technical_2d'");
    expect(generator).toContain("visualType: 'exploded'");
  });
});
