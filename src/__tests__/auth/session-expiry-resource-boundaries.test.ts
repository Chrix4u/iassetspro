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

  it('expires the SPA session only for HTTP 401 authentication failures', () => {
    expect(apiClient).toContain("AUTH_SESSION_EXPIRED_EVENT = 'iassetspro:auth-session-expired'");
    expect(apiClient).toContain('function notifySessionExpired');
    expect(apiClient).toContain('clearClientAuthStorage();');
    expect(apiClient).toContain('return status === 401;');
    expect(apiClient).not.toContain("normalized === 'authentication required'");
    expect(apiClient).toContain('notifySessionExpired(endpoint, res.status, error);');
  });

  it('does not reinterpret an authorization 403 as a dead bearer session', () => {
    expect(apiClient).toContain('A 403 means');
    expect(apiClient).toContain('Never clear a valid persisted session');
  });

  it('never leaves Zustand authenticated after the persisted token disappears or restoration fails', () => {
    expect(authStore).toContain('if (!token) {');
    expect(authStore).toContain('isAuthenticated: false');
    expect(authStore).toContain('user: null');
    expect(authStore).toContain('permissions: []');
    expect(authStore).toContain('role: null');
  });

  it('preserves a valid persisted session when /auth/me fails for a non-401 reason', () => {
    const fetchMeStart = authStore.indexOf('fetchMe: async () => {');
    const fetchMeEnd = authStore.indexOf('hasPermission:', fetchMeStart);
    const fetchMe = authStore.slice(fetchMeStart, fetchMeEnd);

    expect(fetchMe).toContain('else if (res.status === 401)');
    expect(fetchMe).toContain('set({ isLoading: false });');
    expect(fetchMe).toContain('Preserve the current authenticated snapshot during transient network');
    expect(fetchMe).not.toContain('} catch {\n      clearAuthData();');
  });

  it('unmounts the protected app shell when an API discovers session expiry', () => {
    expect(rootPage).toContain('AUTH_SESSION_EXPIRED_EVENT');
    expect(rootPage).toContain("window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired)");
    expect(rootPage).toContain('void fetchMe();');
    expect(rootPage).toContain('if (!isAuthenticated || !user)');
  });

  it('uses the authorized WO payload as the personal-tool read baseline', () => {
    expect(maintenance).toContain('const hydratePersonalToolsFromWO');
    expect(maintenance).toContain('const raw = workOrder?.personalTools');
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
