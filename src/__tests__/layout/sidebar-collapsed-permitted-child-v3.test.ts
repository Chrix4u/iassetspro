import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sidebar = readFileSync(
  join(process.cwd(), 'src', 'components', 'shared', 'Sidebar.tsx'),
  'utf8',
);

describe('collapsed sidebar permission routing', () => {
  it('navigates group icons to the first visible child rather than the first configured child', () => {
    expect(sidebar).toContain('const firstVisibleChild = group.children!.find(childVisible)');
    expect(sidebar).toContain('if (firstVisibleChild) navigate(firstVisibleChild.page)');
    expect(sidebar).not.toContain('const firstChild = group.children![0]');
  });

  it('keeps child visibility permission and module gated', () => {
    expect(sidebar).toContain('pageHasPermission(child.page, hasPermission, adm)');
    expect(sidebar).toContain('pageModuleIsEnabled(child.page, enabledModules)');
    expect(sidebar).toContain('child.moduleCode && !moduleCodeEnabled(child.moduleCode)');
  });
});
