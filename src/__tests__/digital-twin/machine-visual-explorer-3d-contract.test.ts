import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = fs.readFileSync('prisma/schema.prisma', 'utf8');
const meshRoute = fs.readFileSync('src/app/api/mesh-bindings/route.ts', 'utf8');
const meshDetailRoute = fs.readFileSync('src/app/api/mesh-bindings/[id]/route.ts', 'utf8');
const digitalTwinRoute = fs.readFileSync('src/app/api/digital-twins/route.ts', 'utf8');
const interactiveMesh = fs.readFileSync('src/components/digital-twin/InteractiveMesh.tsx', 'utf8');
const viewer = fs.readFileSync('src/components/digital-twin/DigitalTwinViewer.tsx', 'utf8');
const explorer = fs.readFileSync('src/components/digital-twin/MachineVisualExplorer.tsx', 'utf8');

describe('visual machine explorer 3D component targeting contract', () => {
  it('stores an optional exact component on each 3D mesh binding', () => {
    expect(schema).toContain('componentId   String?');
    expect(schema).toContain('@relation("MeshBoundComponent", fields: [componentId], references: [id], onDelete: SetNull)');
    expect(schema).toMatch(/meshBindings\s+AssetMeshBinding\[\]\s+@relation\("MeshBoundComponent"\)/);
    expect(schema).toContain('@@index([componentId])');
  });

  it('validates and returns component-aware mesh bindings', () => {
    expect(meshRoute).toContain('componentId');
    expect(meshRoute).toContain('component.assetId !== assetId');
    expect(meshRoute).toContain("error: 'Bound component must belong to the selected machine asset'");
    expect(meshRoute).toContain('component: { select: { id: true, componentCode: true, name: true, componentType: true, assetId: true } }');
    expect(meshDetailRoute).toContain("'componentId'");
    expect(meshDetailRoute).toContain('component.assetId !== targetAssetId');
  });

  it('scopes digital twin lookup to the selected machine asset', () => {
    expect(digitalTwinRoute).toContain("const assetId = searchParams.get('assetId');");
    expect(digitalTwinRoute).toContain('if (assetId) where.assetId = assetId;');
  });

  it('hands an exact component selection from the 3D viewer back to its caller', () => {
    expect(interactiveMesh).toContain('componentId?: string | null;');
    expect(viewer).toContain('onComponentSelect?: (componentId: string, meshName: string) => void;');
    expect(viewer).toContain('selectedBinding?.componentId');
    expect(viewer).toContain("if (!selectedBinding?.componentId || !onComponentSelect) {\n      lastComponentSelectionRef.current = null;");
    expect(viewer).toContain('onComponentSelect(selectedBinding.componentId, selectedBinding.meshName)');
  });

  it('adds a 3D Model mode to MachineVisualExplorer and drives existing component selection', () => {
    expect(explorer).toContain('value="model3d"');
    expect(explorer).toContain('3D Model');
    expect(explorer).toContain('<DigitalTwinViewer');
    expect(explorer).toContain('onComponentSelect={handle3DComponentSelect}');
    expect(explorer).toContain('setSelectedId(componentId)');
  });
});
