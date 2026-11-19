import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source=(name:string)=>readFileSync(name,'utf8');

describe('Smart Anatomy imported CAD-to-registered-component workflow',()=>{
  it('keeps exact CAD source paths through scene normalization into mesh selection',()=>{
    expect(source('src/lib/digital-twin/normalize-scene.ts')).toContain('meshPath: asOptionalString(binding.meshPath)');
    expect(source('src/components/digital-twin/ModelLoader.tsx')).toContain('matchImportedMeshBinding(');
    expect(source('src/components/digital-twin/ModelLoader.tsx')).toContain('onAnatomyManifest?.(anatomyManifest)');
    expect(source('src/components/digital-twin/SceneTreePanel.tsx')).toContain('buildImportedAnatomyTree(anatomyMeshes)');
  });

  it('permits engineer-authorized machine component linking without creating extra hierarchy tables',()=>{
    const explorer=source('src/components/digital-twin/MachineVisualExplorer.tsx');
    expect(explorer).toContain("hasPermission('digital_twin.manage')");
    expect(explorer).toContain("'/api/mesh-bindings?'+query");
    expect(explorer).toContain("componentId:anatomyTargetId");
    expect(explorer).toContain("meshName:mesh.path,meshPath:mesh.path");
    expect(explorer).toContain('anatomyRevision={anatomyRevision}');
    expect(explorer).toContain('onAnatomySelection={onAnatomySelection}');
    expect(explorer).toContain('onComponentSelect={handle3DComponentSelect}');
  });

  it('prevents ambiguous CAD path collisions on create and edit, preserving plant scope',()=>{
    const create=source('src/app/api/mesh-bindings/route.ts');
    const edit=source('src/app/api/mesh-bindings/[id]/route.ts');
    expect(create).toContain('meshPath.length > 600');
    expect(create).toContain('...(meshPath ? [{ meshPath }] : [])');
    expect(create).toContain('component.assetId !== assetId');
    expect(create).toContain('reviewedCadMappingsAreFrozen(model)');
    expect(edit).toContain('id:{not:existing.id}');
    expect(edit).toContain('meshPath:newPath');
    expect(edit).toContain('component.assetId !== targetAssetId');
    expect(edit).toContain('canAccessPlantStrict');
    expect(edit).toContain('reviewedCadMappingsAreFrozen(existing.model)');
  });

  it('does not inherit previous asset permissions when selecting unbound visual-only meshes',()=>{
    const viewer=source('src/components/digital-twin/DigitalTwinViewer.tsx');
    expect(viewer).toContain("selectMesh(meshName, assetId || '')");
    expect(viewer).toContain('setInfoPanelOpen(Boolean(assetId))');
    expect(source('src/components/digital-twin/SceneTreePanel.tsx'))
      .toContain("onMeshSelect(node.meshName, node.assetId || '')");
  });
});
