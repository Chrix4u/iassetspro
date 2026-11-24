import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { inspectSelfContainedGlb, MAX_PRIVATE_CAD_UPLOAD_BYTES } from '@/lib/smart-anatomy/validate-glb';

const pump = () => readFileSync('public/smart-anatomy-demos/original-centrifugal-pump.glb');
const gearbox = () => readFileSync('public/smart-anatomy-demos/original-conveyor-gearbox.glb');

function fixture(json: unknown): Buffer {
  const source = Buffer.from(JSON.stringify(json), 'utf8');
  const padded = Buffer.alloc(Math.ceil(source.length / 4) * 4, 0x20);
  source.copy(padded);
  const bytes = Buffer.alloc(20 + padded.length);
  bytes.write('glTF', 0);
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(padded.length, 12);
  bytes.write('JSON', 16);
  padded.copy(bytes, 20);
  return bytes;
}

describe('Smart Anatomy private CAD binary validation', () => {
  it('accepts self-contained original GLB geometry and counts real meshes', () => {
    expect(inspectSelfContainedGlb(pump()).meshCount).toBe(30);
    expect(inspectSelfContainedGlb(gearbox()).meshCount).toBe(20);
  });
  it('rejects files without a valid binary signature and declared file size', () => {
    const bad = Buffer.from(pump()); bad[0] = 0;
    expect(() => inspectSelfContainedGlb(bad)).toThrow('glTF Binary');
    const mismatch = Buffer.from(pump()); mismatch.writeUInt32LE(1, 8);
    expect(() => inspectSelfContainedGlb(mismatch)).toThrow('length');
  });
  it('rejects oversized models and unsupported compressed or empty input', () => {
    expect(MAX_PRIVATE_CAD_UPLOAD_BYTES).toBe(25 * 1024 * 1024);
    expect(() => inspectSelfContainedGlb(new Uint8Array(30))).toThrow('glTF Binary');
    expect(() => inspectSelfContainedGlb(new Uint8Array(MAX_PRIVATE_CAD_UPLOAD_BYTES + 1))).toThrow('25 MB');
  });
  it('rejects external network/file references even in valid glTF JSON', () => {
    const makeFixture = (uri: string) => {
      const data = Buffer.from(JSON.stringify({
        asset: { version: '2.0' },
        nodes: [{ mesh: 0 }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
        accessors: [{ count: 3 }],
        buffers: [{ uri, byteLength: 3 }],
      }), 'utf8');
      const padded = Buffer.alloc(Math.ceil(data.length / 4) * 4, 0x20);
      data.copy(padded);
      const buffer = Buffer.alloc(20 + padded.length);
      buffer.write('glTF', 0);
      buffer.writeUInt32LE(2, 4);
      buffer.writeUInt32LE(buffer.length, 8);
      buffer.writeUInt32LE(padded.length, 12);
      buffer.write('JSON', 16);
      padded.copy(buffer, 20);
      return buffer;
    };
    expect(() => inspectSelfContainedGlb(makeFixture('https://evil.example/model.bin')))
      .toThrow('external URLs');
    expect(() => inspectSelfContainedGlb(makeFixture('file:///etc/passwd')))
      .toThrow('external URLs');
    expect(inspectSelfContainedGlb(makeFixture('data:application/octet-stream;base64,AAAA')).meshCount)
      .toBe(1);
  });

  it('refuses GLBs that require decoder services not installed in the on-prem viewer', () => {
    for (const extension of [
      'KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu',
    ]) {
      const json = {
        asset: {version:'2.0'},
        nodes: [{mesh:0}],
        meshes: [{primitives:[{attributes:{POSITION:0}}]}],
        accessors: [{count:3}],
        extensionsUsed: [extension],
        extensionsRequired: [extension],
      };
      expect(() => inspectSelfContainedGlb(fixture(json)))
        .toThrow('unsupported compressed extension ' + extension);
    }
    // An optional, non-required extension with standard geometry fallback
    // remains permissible and never triggers an unknown network decoder.
    expect(inspectSelfContainedGlb(fixture({
      asset:{version:'2.0'},nodes:[{mesh:0}],
      meshes:[{primitives:[{attributes:{POSITION:0}}]}],
      accessors:[{count:3}],extensionsUsed:['KHR_mesh_quantization'],
      extensionsRequired:['KHR_mesh_quantization'],
    })).meshCount).toBe(1);
  });

  it('rejects tampered BIN chunk sizes and unsupported extra chunks', () => {
    const wrong = Buffer.from(pump());
    const jsonLength = wrong.readUInt32LE(12);
    const binStart = 20 + jsonLength;
    wrong.writeUInt32LE(wrong.readUInt32LE(binStart) + 4, binStart);
    expect(() => inspectSelfContainedGlb(wrong)).toThrow('binary chunk layout');

    const wrongType = Buffer.from(gearbox());
    const secondChunk = 20 + wrongType.readUInt32LE(12);
    wrongType.write('EVIL', secondChunk + 4);
    expect(() => inspectSelfContainedGlb(wrongType)).toThrow('binary chunk layout');
  });

  it('validates binary buffer offsets rather than trusting JSON alone', () => {
    const valid = Buffer.from(pump());
    const json = JSON.parse(valid.subarray(20, 20 + valid.readUInt32LE(12)).toString());
    expect(json.bufferViews.length).toBeGreaterThan(0);
    json.bufferViews[0].byteOffset = json.buffers[0].byteLength + 1;
    expect(() => inspectSelfContainedGlb(fixture(json))).toThrow('buffer');
  });

  it('rejects cycles and out-of-bounds child references at intake', () => {
    const json = {
      asset: {version:'2.0'}, nodes: [{mesh:0,children:[1]}, {children:[0]}],
      meshes: [{primitives:[{attributes:{POSITION:0}}]}],
      accessors:[{count:3}],
    };
    expect(() => inspectSelfContainedGlb(fixture(json))).toThrow('cyclic scene');
    json.nodes[1].children = [999];
    expect(() => inspectSelfContainedGlb(fixture(json))).toThrow('child index');
  });

  it('rejects invalid JSON chunks and malformed glTF version', () => {
    const json = Buffer.from(pump());
    json.writeUInt32LE(0x20202020, 16);
    expect(() => inspectSelfContainedGlb(json)).toThrow('JSON chunk');
  });
});
