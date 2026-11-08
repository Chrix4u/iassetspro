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

  it('keeps drill controls available in Diagram and the other visual modes', () => {
    expect(explorer).toContain('const renderDrillOverlay = () => (');
    expect(explorer).toMatch(/<TabsContent value="diagram"[\s\S]*?\{renderDrillOverlay\(\)\}/);
    expect((explorer.match(/\{renderDrillOverlay\(\)\}/g) || []).length).toBe(2);
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
    expect(explorer).toContain('xl:h-auto xl:max-h-none xl:min-h-0 xl:flex-1');
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

  it('keeps diagram clicks selectable while reserving pointer capture for real drag gestures', () => {
    const pointerDownIndex = explorer.indexOf('onPointerDown:');
    const pointerMoveIndex = explorer.indexOf('onPointerMove:');
    const captureIndex = explorer.indexOf('setPointerCapture');

    expect(explorer).toContain('onClick={() => onSelect(component.id)}');
    expect(explorer).toContain('<g onClick={() => onSelect(null)}');
    expect(explorer).toContain('dragging: false');
    expect(explorer).toContain('Math.hypot(deltaX, deltaY) < 5');
    expect(pointerDownIndex).toBeGreaterThanOrEqual(0);
    expect(pointerMoveIndex).toBeGreaterThan(pointerDownIndex);
    expect(captureIndex).toBeGreaterThan(pointerMoveIndex);
  });

  it('keeps long breadcrumbs, nodes and drill-down labels readable on narrow screens', () => {
    expect(explorer).toContain('wrapSchematicLabel(asset.name, 28)');
    expect(explorer).toContain('wrapSchematicLabel(component.name, 27)');
    expect(explorer).toContain('rootNameLines.map(');
    expect(explorer).toContain('pos.names.map(');
    expect(explorer).toContain('max-w-full whitespace-normal break-words');
    expect(explorer).toContain('min-w-0 flex-1 whitespace-normal break-words');
    expect(explorer).not.toContain("component.name.slice(0, 24) + '…'");
  });

  it('exposes diagram fit and zoom controls plus touch pinch/pan without hijacking page scroll', () => {
    expect(explorer).toContain('aria-label="Diagram zoom controls"');
    expect(explorer).toContain('aria-label="Fit diagram to screen"');
    expect(explorer).toContain('aria-label="Zoom in diagram"');
    expect(explorer).toContain('aria-label="Zoom out diagram"');
    expect(explorer).toContain('touchPointersRef.current.set(event.pointerId');
    expect(explorer).toContain('touchPointersRef.current.size >= 2');
    expect(explorer).toContain('pinchRef.current');
    expect(explorer).toContain('if (!event.ctrlKey) return;');
    expect(explorer).toContain('onWheel:');
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
