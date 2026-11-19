import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const workflow=readFileSync('.github/workflows/ci.yml','utf8');
const installer=readFileSync('scripts/smart-anatomy/install-ci-chromium.sh','utf8');

describe('Playwright CI browser installation reliability',()=>{
  it('runs the pinned browser-only installer in both required UAT jobs',()=>{
    expect(workflow.match(/run: bash scripts\/smart-anatomy\/install-ci-chromium.sh/g)).toHaveLength(2);
    expect(workflow).not.toContain('playwright install --with-deps chromium');
    expect(workflow).toContain('name: Repairs UAT (Playwright)');
    expect(workflow).toContain('name: E2E Tests (Playwright)');
  });
  it('fails closed on installation errors rather than skipping UAT',()=>{
    expect(installer).toContain('set -euo pipefail');
    expect(installer).toContain('bunx playwright install chromium');
    expect(installer).toContain('exit 1');
    expect(installer).toContain('RUNNER_OS');
    expect(installer).not.toContain('apt-get');
  });
});
