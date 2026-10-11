import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('MachineVisualExplorer selection mode contract', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/components/digital-twin/MachineVisualExplorer.tsx'),
    'utf8',
  );

  it('exposes the current component and hierarchy path to an optional selection consumer', () => {
    expect(source).toContain('export type MachineExplorerSelection = {');
    expect(source).toContain('component: MachineComponent | null;');
    expect(source).toContain('path: MachineComponent[];');
    expect(source).toContain('onSelectionChange?: (selection: MachineExplorerSelection) => void;');
    expect(source).toContain('if (loading) return;');
    expect(source).toContain('onSelectionChange?.({ component: selected, path });');
  });

  it('supports a compact selection-mode viewport without changing normal asset-detail usage', () => {
    expect(source).toContain('selectionMode?: boolean;');
    expect(source).toContain("selectionMode ? 'xl:h-[min(72vh,760px)]' : 'xl:h-[calc(100dvh-5rem)]'");
  });
});
