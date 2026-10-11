import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('PM schedule exact hierarchy targeting contract', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/components/modules/MaintenancePages.tsx'),
    'utf8',
  );

  it('uses server-side asset search and paginates through all accessible matches', () => {
    expect(source).toContain("import { MachineVisualExplorer, type MachineExplorerSelection } from '@/components/digital-twin/MachineVisualExplorer';");
    expect(source).toContain('const fetchPmAssetOptions = useCallback(async (query: string) => {');
    expect(source).toContain("api.get(`/api/assets?search=${encodeURIComponent(query)}&page=${page}&limit=100`)");
    expect(source).toContain('while (page <= totalPages)');
    expect(source).toContain('onValueChange={handlePmAssetChange}');
    expect(source).toContain("setFormComponentId('');");
  });

  it('keeps the main PM form bounded and moves hierarchy selection into the visual explorer', () => {
    expect(source).toContain('size="extra-wide"');
    expect(source).toContain('Choose PM Target');
    expect(source).toContain('size="explorer"');
    expect(source).toContain('<MachineVisualExplorer');
    expect(source).toContain('selectionMode');
    expect(source).toContain('onSelectionChange={setTargetDraftSelection}');
    expect(source).toContain("setFormComponentId(targetDraftSelection.component?.id || '');");
    expect(source).toContain('Confirm Selection');
  });

  it('adds a universally available View action and fresh read-only detail dialog', () => {
    expect(source).toContain('const openPmScheduleView = async (item: any) => {');
    expect(source).toContain("api.get(`/api/pm-schedules/${item.id}`)");
    expect(source).toContain('<DropdownMenuItem onClick={() => openPmScheduleView(s)}><Eye');
    expect(source).toContain("title={viewItem ? `PM Schedule · ${viewItem.title}` : 'PM Schedule'}");
    expect(source).toContain('PM Target');
    expect(source).toContain('Auto-generate Work Order');
  });
});
