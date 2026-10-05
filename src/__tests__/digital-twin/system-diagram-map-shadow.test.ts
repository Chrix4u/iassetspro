import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync('src/components/digital-twin/SystemDiagramPage.tsx', 'utf8');

describe('System Diagram map namespace', () => {
  it('keeps the Lucide map icon from shadowing the built-in Map constructor', () => {
    expect(source).toContain('Map as MapIcon');
    expect(source).toContain('<MapIcon className=\"h-3.5 w-3.5\" />');
    expect(source).toContain('new Map<string, number>()');
    expect(source).toContain('new Map<string, string[]>()');
    expect(source).not.toMatch(/\n\s*Map, AlertTriangle/);
  });
});
