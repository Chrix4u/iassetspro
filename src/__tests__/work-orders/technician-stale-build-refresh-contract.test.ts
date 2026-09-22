import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) =>
  fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('technician stale-build refresh contract', () => {
  it('embeds the exact Git SHA in the deployed standalone build', () => {
    const ci = read('.github/workflows/ci.yml');
    const buildAnchor = ci.indexOf('- name: Build production application');
    expect(buildAnchor).toBeGreaterThan(-1);

    const buildSlice = ci.slice(buildAnchor, buildAnchor + 300);
    expect(buildSlice).toContain('NEXT_PUBLIC_BUILD_VERSION: ${{ github.sha }}');
    expect(buildSlice).toContain('run: bun run build');
  });

  it('exposes the deployed build SHA through the public health endpoint', () => {
    const health = read('src/app/api/health/route.ts');

    expect(health).toContain("buildVersion: process.env.NEXT_PUBLIC_BUILD_VERSION || 'unknown'");
    expect(health).toContain("'Cache-Control': 'no-store'");
  });

  it('versions the service worker and Cache Storage by deployed build SHA', () => {
    const bootstrap = read('src/components/core/OfflineStorageBootstrap.tsx');
    const worker = read('public/sw.js');

    expect(bootstrap).toContain('const workerUrl = `/sw.js?v=${encodeURIComponent(CLIENT_BUILD_VERSION)}`');
    expect(bootstrap).toContain('navigator.serviceWorker.register(workerUrl');
    expect(worker).toContain("new URL(self.location.href).searchParams.get('v')");
    expect(worker).toContain('const CACHE_NAME = `${CACHE_PREFIX}${WORKER_BUILD_VERSION}`');
  });

  it('detects a newer deployed build without auto-reloading unsaved technician work', () => {
    const bootstrap = read('src/components/core/OfflineStorageBootstrap.tsx');

    expect(bootstrap).toContain("const CLIENT_BUILD_VERSION = process.env.NEXT_PUBLIC_BUILD_VERSION || 'local'");
    expect(bootstrap).toContain("fetch('/api/health'");
    expect(bootstrap).toContain("cache: 'no-store'");
    expect(bootstrap).toContain('BUILD_VERSION_CHECK_INTERVAL_MS = 60_000');
    expect(bootstrap).toContain("document.addEventListener('visibilitychange', handleVisibility)");
    expect(bootstrap).toContain("data-testid=\"app-update-banner\"");
    expect(bootstrap).toContain('onClick={() => window.location.reload()}');
    expect(bootstrap).not.toContain('if (deployed !== CLIENT_BUILD_VERSION) window.location.reload()');
  });
});
