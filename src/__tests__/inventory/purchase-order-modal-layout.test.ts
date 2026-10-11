import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('purchase order modal layout', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/components/modules/InventoryPages.tsx'),
    'utf8',
  );

  it('uses the wide responsive dialog preset for the create PO form', () => {
    expect(source).toContain('<ResponsiveDialog open={createOpen} onOpenChange={handleDialogClose} size="wide">');
  });

  it('lets the item selector shrink without pushing fixed quantity/cost controls outside the modal', () => {
    expect(source).toContain('sm:grid-cols-[minmax(0,1fr)_80px_100px_32px]');
    expect(source).toContain('<div className="space-y-1 min-w-0">');
  });
});
