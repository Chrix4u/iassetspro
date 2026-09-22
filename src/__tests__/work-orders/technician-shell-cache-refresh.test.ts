import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('technician shell cache refresh', () => {
  it('rotates the app-shell cache with each deployed build', () => {
    const sw = read('public/sw.js');
    expect(sw).toContain("new URL(self.location.href).searchParams.get('v')");
    expect(sw).toContain("const CACHE_NAME = `${CACHE_PREFIX}${WORKER_BUILD_VERSION}`");
    expect(sw).toContain("name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME");
  });

  it('checks for a new service worker on bootstrap and long-lived tabs', () => {
    const bootstrap = read('src/components/core/OfflineStorageBootstrap.tsx');
    expect(bootstrap).toContain('const workerUrl = `/sw.js?v=${encodeURIComponent(CLIENT_BUILD_VERSION)}`');
    expect(bootstrap).toContain("navigator.serviceWorker.register(workerUrl, { scope: '/' })");
    expect(bootstrap).toContain('await registration.update()');
    expect(bootstrap).toContain("navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)");
    expect(bootstrap).toContain('setUpdateAvailable(true)');
    expect(bootstrap).toContain('data-testid="app-update-banner"');
    expect(bootstrap).toContain('onClick={() => window.location.reload()}');
    expect(bootstrap).toContain("navigator.serviceWorker.getRegistration('/')");
    expect(bootstrap).toContain('5 * 60 * 1000');
  });

  it('never caches API responses', () => {
    const sw = read('public/sw.js');
    expect(sw).toContain("if (url.pathname.startsWith('/api/')) return");
  });
});
