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
    expect(explorer).toContain('Diagram');
    expect(explorer).toContain('Exploded');
    expect(explorer).toContain('Drill into parts');
    expect(explorer).toContain('setSelectedId(item.id)');
  });

  it('has zoom controls and part-level AI generation', () => {
    expect(explorer).toContain('Math.min(4');
    expect(explorer).toContain("api.post('/api/component-visuals/generate'");
    expect(explorer).toContain('componentId: selectedId');
    expect(explorer).toContain('Generate AI visual');
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
