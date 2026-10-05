import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync('src/components/digital-twin/WorkInstructionPanel.tsx', 'utf8');

describe('Work Instruction difficulty icon', () => {
  it('uses the Lucide Zap import without a conflicting local declaration', () => {
    expect(source).toMatch(/\n\s*Zap,\n/);
    expect(source).toContain('<Zap className=\"h-3 w-3\" />');
    expect(source).not.toContain('function Zap(');
  });
});
