import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const assetForm = readFileSync('src/components/modules/AssetPages.tsx', 'utf8');
const machineFields = readFileSync('src/components/assets/MachineCommissioningFields.tsx', 'utf8');

describe('create/edit machine modal responsive layout', () => {
  it('uses a wider dialog with one fixed header and footer for both create and edit', () => {
    expect(assetForm).toContain('size="extra-wide"');
    expect(assetForm).toContain('desktopMaxWidth="sm:max-w-[94vw] xl:max-w-[68rem]"');
    expect(assetForm).toContain("title={editId ? 'Edit Asset' : 'Create Asset'}");
    expect(assetForm).toContain('footer={');
    expect(assetForm).toContain('data-testid="asset-create-form"');
    expect(assetForm).toContain("onClick={handleSave} disabled={saving}");
  });

  it('stacks fields on phones and shows even two/three-column rows only when space allows', () => {
    const formBlock = assetForm.split('data-testid="asset-create-form"')[1]?.split('{/* Delete Confirmation Dialog */}')[0] ?? '';
    expect(formBlock.match(/grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2"/g)).toHaveLength(4);
    expect(formBlock.match(/grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"/g)).toHaveLength(3);
    expect(formBlock).not.toContain('grid grid-cols-3 gap-3');
    expect(formBlock).toContain('DatePicker className="min-w-0 space-y-1.5"');
    expect(formBlock).toContain('<Input className="h-11 w-full min-w-0" type="number"');
  });

  it('gives inspection parameters a predictable grid instead of wrapping fixed-width controls', () => {
    expect(machineFields).toContain('sm:grid-cols-[minmax(0,1fr)_9rem_auto]');
    expect(machineFields).not.toContain('min-w-[10rem] flex-1');
  });

  it('keeps meter names, types, units and readings aligned with equal label heights', () => {
    expect(machineFields).toContain('sm:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1.15fr)_minmax(0,0.75fr)_minmax(0,1.3fr)_auto]');
    expect(machineFields.match(/<Label className="flex min-h-10 items-end leading-tight">/g)).toHaveLength(4);
    expect(machineFields).toContain('className="justify-self-end self-end"');
  });
});
