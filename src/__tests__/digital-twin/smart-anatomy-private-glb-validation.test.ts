import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { inspectSelfContainedGlb, MAX_PRIVATE_CAD_UPLOAD_BYTES } from '@/lib/smart-anatomy/validate-glb';

const pump = () => readFileSync('public/smart-anatomy-demos/original-centrifugal-pump.glb');
const gearbox = () => readFileSync('public/smart-anatomy-demos/original-conveyor-gearbox.glb');

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
        buffers: [{ uri }],
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

  it('rejects invalid JSON chunks and malformed glTF version', () => {
    const json = Buffer.from(pump());
    json.writeUInt32LE(0x20202020, 16);
    expect(() => inspectSelfContainedGlb(json)).toThrow('JSON chunk');
  });
});
