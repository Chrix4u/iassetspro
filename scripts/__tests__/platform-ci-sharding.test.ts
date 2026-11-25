import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
const e2e = ci.slice(ci.indexOf('  e2e-tests:'), ci.indexOf('  required-ci-gate:'));
const gate = ci.slice(ci.indexOf('  required-ci-gate:'));

describe('isolated parallel platform browser validation', () => {
  it('runs all three shards rather than omitting browser coverage', () => {
    expect(e2e).toContain('fail-fast: false');
    expect(e2e).toContain('shard: [1, 2, 3]');
    expect(e2e).toContain('bun run test:e2e --project=chromium --shard=${{ matrix.shard }}/3');
    expect(e2e).not.toContain('continue-on-error: true');
  });

  it('seeds independent service containers and uses the exact build artifact per shard', () => {
    expect(e2e).toContain('services:');
    expect(e2e).toContain('image: postgres:16-alpine');
    expect(e2e).toContain('image: redis:7-alpine');
    expect(e2e).toContain('bunx prisma migrate deploy');
    expect(e2e).toContain('run: bun run seed');
    expect(e2e).toContain('name: build-output');
    expect(e2e).toContain('name: playwright-results-${{ matrix.shard }}');
    expect(e2e).toContain('name: playwright-html-report-${{ matrix.shard }}');
  });

  it('requires aggregate matrix success before release', () => {
    expect(gate).toContain('needs: [lint, typecheck, unit-tests, build, container-build, repairs-uat, e2e-tests]');
    expect(gate).toContain('E2E: ${{ needs.e2e-tests.result }}');
    expect(gate).toContain('[[ "$result" == "success" ]]');
  });
});
