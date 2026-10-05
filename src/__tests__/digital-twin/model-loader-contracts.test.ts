import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync('src/components/digital-twin/ModelLoader.tsx', 'utf8');

describe('ModelLoader GLTF lifecycle contracts', () => {
  it('keeps the concrete GLTFLoader type through load callbacks', () => {
    expect(source).toContain('const gltfLoader = new GLTFLoader();');
    expect(source).toContain('gltfLoader.load(');
    expect(source).not.toContain('let loader: THREE.Loader | null = null;');
  });

  it('releases cache references on both cached and network-loaded lifecycle paths', () => {
    expect(source.match(/releaseToCache\(modelUrl\);/g)?.length).toBe(2);
    expect(source).toContain('return () => {\n        cancelled = true;\n        releaseToCache(modelUrl);\n      };');
  });

  it('cleans the fallback progress timer and does not call unsupported LoadingManager APIs', () => {
    expect(source).toContain('let progressInterval: ReturnType<typeof setInterval> | undefined;');
    expect(source).toContain('if (progressInterval) {\n        clearInterval(progressInterval);\n      }');
    expect(source).toContain('The cancelled flag');
    expect(source).not.toContain('.manager?.forEach');
  });
});
