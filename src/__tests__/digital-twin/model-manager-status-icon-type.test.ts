import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync('src/components/digital-twin/ModelManagerPanel.tsx', 'utf8');

describe('Model Manager status icon typing', () => {
  it('uses LucideIcon so status icons accept normal Lucide props', () => {
    expect(source).toContain('type LucideIcon');
    expect(source).toContain('icon: LucideIcon; color: string; bg: string');
    expect(source).not.toContain('icon: React.ElementType; color: string; bg: string');
  });
});
