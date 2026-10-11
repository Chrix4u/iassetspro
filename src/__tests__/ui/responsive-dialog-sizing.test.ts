import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ResponsiveDialog form-aware sizing contract', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/components/shared/ResponsiveDialog.tsx'),
    'utf8',
  );

  it('provides literal default, wide, extra-wide, and explorer desktop sizes', () => {
    expect(source).toContain("export type ResponsiveDialogSize = 'default' | 'wide' | 'extra-wide' | 'explorer'");
    expect(source).toContain("wide: 'sm:max-w-3xl'");
    expect(source).toContain("'extra-wide': 'sm:max-w-5xl'");
    expect(source).toContain("explorer: 'sm:max-w-[96vw] 2xl:max-w-[90rem]'");
  });

  it('keeps legacy width props compatible while allowing the explicit size preset', () => {
    expect(source).toContain('size?: ResponsiveDialogSize;');
    expect(source).toContain('desktopMaxWidth ?? (size ? RESPONSIVE_DIALOG_SIZE_CLASSES[size]');
    expect(source).toContain('extraLarge ? "sm:max-w-4xl" : large ? "sm:max-w-2xl" : RESPONSIVE_DIALOG_SIZE_CLASSES.default');
  });

  it('contains dialog bodies horizontally and scrolls the body instead of widening the dialog', () => {
    expect(source).toContain('w-[calc(100vw-2rem)] min-w-0 max-h-[90vh] overflow-hidden');
    expect(source).toContain('responsive-dialog-body flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden');
    expect(source).toContain('responsive-dialog-body flex-1 min-w-0 overflow-y-auto overflow-x-hidden');
  });
});
