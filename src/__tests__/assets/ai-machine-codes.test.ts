import { describe, expect, it } from 'vitest';
import { normalizeAiMachineCode, aiAssemblyCode, aiComponentCode, aiPartCode } from '@/lib/ai-asset-codes';

describe('AI machine draft internal-code derivation', () => {
  it('normalizes a user-selected machine code and derives deterministic hierarchy codes', () => {
    const root = normalizeAiMachineCode('st-001', 'unused');
    expect(root).toBe('ST-001');
    expect(aiAssemblyCode(root, 0)).toBe('ST-001-A01');
    expect(aiComponentCode(root, 0, 0)).toBe('ST-001-A01-C01');
    expect(aiPartCode(root, 0, 0, 0)).toBe('ST-001-A01-C01-P01');
    expect(aiPartCode(root, 1, 2, 3)).toBe('ST-001-A02-C03-P04');
    expect(normalizeAiMachineCode('', 'AI-LAT-001')).toBe('AI-LAT-001');
  });

  it('rejects malformed code patterns instead of generating unsafe or colliding path fragments', () => {
    for (const code of ['A', 'ST 001', 'ST--001', '-ST001', 'ST001-', 'ST/001', 'ST_001', 'ST😃', 'A'.repeat(41)]) {
      expect(() => normalizeAiMachineCode(code, 'fallback'), code).toThrow();
    }
    expect(() => normalizeAiMachineCode(55, 'fallback')).toThrow();
    expect(() => aiAssemblyCode('ST-001', -1)).toThrow();
    expect(() => aiPartCode('ST-001', 0, 0, 1000)).toThrow();
  });

  it('keeps separate namespaces across assemblies, components and spare parts', () => {
    const root = 'ST-001';
    const paths = new Set<string>();
    for (let a = 0; a < 3; a++) {
      paths.add(aiAssemblyCode(root, a));
      for (let c = 0; c < 3; c++) {
        paths.add(aiComponentCode(root, a, c));
        for (let p = 0; p < 2; p++) paths.add(aiPartCode(root, a, c, p));
      }
    }
    expect(paths.size).toBe(3 + 9 + 18);
  });
});
