import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('authenticated RWOP resource request boundaries', () => {
  const apiClient = read('src/lib/api.ts');
  const authStore = read('src/stores/authStore.ts');
  const rootPage = read('src/app/page.tsx');
  const maintenance = read('src/components/modules/MaintenancePages.tsx');

  it('fails closed when any protected API reports an expired/missing bearer session', () => {
    expect(apiClient).toContain("AUTH_SESSION_EXPIRED_EVENT = 'iassetspro:auth-session-expired'");
    expect(apiClient).toContain('function notifySessionExpired');
    expect(apiClient).toContain('clearClientAuthStorage();');
    expect(apiClient).toContain("normalized === 'authentication required'");
    expect(apiClient).toContain("normalized === 'not authenticated'");
    expect(apiClient).toContain("normalized === 'invalid or expired session'");
    expect(apiClient).toContain('notifySessionExpired(endpoint, res.status, error);');
  });

  it('never leaves Zustand authenticated after the persisted token disappears or restoration fails', () => {
    expect(authStore).toContain('if (!token) {');
    expect(authStore).toContain('isAuthenticated: false');
    expect(authStore).toContain('user: null');
    expect(authStore).toContain('permissions: []');
    expect(authStore).toContain('role: null');
  });

  it('unmounts the protected app shell when an API discovers session expiry', () => {
    expect(rootPage).toContain('AUTH_SESSION_EXPIRED_EVENT');
    expect(rootPage).toContain("window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired)");
    expect(rootPage).toContain('void fetchMe();');
    expect(rootPage).toContain('if (!isAuthenticated || !user)');
  });

  it('uses the already-authorized WO payload as the personal-tool read baseline', () => {
    expect(maintenance).toContain('const hydratePersonalToolsFromWO');
    expect(maintenance).toContain('const raw = workOrder?.personalTools');
    expect(maintenance).toContain('hydratePersonalToolsFromWO(res.data)');
    expect(maintenance).not.toContain('fetchPersonalTools');
    expect(maintenance).not.toContain('api.get<PersonalTool[]>(`/api/work-orders/${id}/personal-tools`)');
  });

  it('uses least-privilege inventory/tool lookups and forbids obsolete broad selector calls', () => {
    expect(maintenance).toContain("api.get('/api/tools?mode=lookup&limit=100')");
    expect(maintenance).toContain("api.get('/api/inventory?mode=lookup&limit=100')");
    expect(maintenance).not.toContain("api.get('/api/tools?status=available&limit=100')");
    expect(maintenance).not.toContain("api.get('/api/inventory')");
  });
});
