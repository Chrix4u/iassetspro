import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('GTP Visual Explorer default mode contract', () => {
  it('opens on an immediately useful engineering view when no realistic asset image exists', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/components/digital-twin/MachineVisualExplorer.tsx'),
      'utf8',
    );

    expect(source).toContain("useState(asset.imageUrl ? 'realistic' : 'diagram')");
    expect(source).toContain("setMode(asset.imageUrl ? 'realistic' : 'diagram')");
    expect(source).toContain("value="diagram"");
    expect(source).toContain("EngineeringSchematic");
  });
});
