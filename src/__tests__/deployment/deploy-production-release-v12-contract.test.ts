import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('production release cleanup contract', () => {
  it('removes only deployment-owned regular temp files', () => {
    const script = read('scripts/deploy-production-release.sh');
    expect(script).toContain("find /tmp -mindepth 1 -maxdepth 1 -type f -name 'iassetspro-*' -delete || true");
  });

  it('does not use the old broad rm glob that collides with validation worktree directories', () => {
    const script = read('scripts/deploy-production-release.sh');
    expect(script).not.toContain('rm -f /tmp/iassetspro-* || true');
  });
});
