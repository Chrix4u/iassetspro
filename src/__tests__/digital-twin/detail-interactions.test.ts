import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const interactiveMesh = fs.readFileSync(
  'src/components/digital-twin/InteractiveMesh.tsx',
  'utf8',
);
const annotationLayer = fs.readFileSync(
  'src/components/digital-twin/AnnotationLayer.tsx',
  'utf8',
);

describe('digital twin detail interactions', () => {
  it('routes click, right-click, and long-press through the existing mesh selection model', () => {
    expect(interactiveMesh).toContain('const openComponentDetails = useCallback');
    expect(interactiveMesh).toContain(
      'selectMesh(binding.meshName, binding.assetId)',
    );
    expect(interactiveMesh).toContain('openComponentDetails();');
    expect(interactiveMesh).not.toContain('Context menu placeholder');
  });

  it('opens annotation-linked mesh details against the current scene asset', () => {
    expect(annotationLayer).toContain(
      'const sceneAssetId = useStoreSelector((s) => s.currentScene?.assetId ?? null)',
    );
    expect(annotationLayer).toContain(
      'selectMesh(annotation.meshName!, sceneAssetId)',
    );
    expect(annotationLayer).not.toContain(
      'Double-click could open a detail view (placeholder)',
    );
  });
});
