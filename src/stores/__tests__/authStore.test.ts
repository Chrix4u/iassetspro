import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/types';

const getMock = vi.fn();
const postMock = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    get: getMock,
    post: postMock,
  },
}));

import { useAuthStore } from '@/stores/authStore';

const user: User = {
  id: 'user-1',
  username: 'tech.one',
  email: 'tech@example.com',
  fullName: 'Tech One',
  department: 'Engineering',
  plantId: 'plant-a',
  status: 'active',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  roles: [{
    id: 'role-tech',
    name: 'Technician',
    slug: 'technician',
    level: 10,
    isSystem: true,
  }],
  plantAccess: [{
    id: 'plant-a',
    code: 'PA',
    name: 'Plant A',
    isActive: true,
  }],
};

const permissions = ['work_orders.view', 'work_orders.execute'];

function resetStore() {
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    permissions: [],
    role: null,
    isLoading: false,
    authVerification: 'none',
  });
}

describe('authStore offline cold-start behavior', () => {
  beforeEach(() => {
    localStorage.clear();
    getMock.mockReset();
    postMock.mockReset();
    resetStore();
  });

  it('persists a verified user snapshot after successful login', async () => {
    postMock.mockResolvedValue({
      success: true,
      status: 200,
      data: { user, token: 'token-1', permissions },
    });

    const result = await useAuthStore.getState().login('tech.one', 'secret');

    expect(result).toEqual({ ok: true });
    expect(useAuthStore.getState().authVerification).toBe('verified');
    const snapshot = JSON.parse(localStorage.getItem('eam_auth_snapshot') || 'null');
    expect(snapshot.user.id).toBe(user.id);
    expect(snapshot.permissions).toEqual(permissions);
    expect(typeof snapshot.verifiedAt).toBe('string');
  });

  it('hydrates the last verified identity when auth verification is unavailable', async () => {
    postMock.mockResolvedValue({
      success: true,
      status: 200,
      data: { user, token: 'token-1', permissions },
    });
    await useAuthStore.getState().login('tech.one', 'secret');
    resetStore();

    getMock.mockResolvedValue({
      success: false,
      error: 'Network error. Please check your connection.',
    });

    await useAuthStore.getState().fetchMe();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.authVerification).toBe('cached');
    expect(state.user?.id).toBe(user.id);
    expect(state.permissions).toEqual(permissions);
    expect(localStorage.getItem('eam_token')).toBe('token-1');
  });

  it('also preserves cached identity during a transient server failure', async () => {
    postMock.mockResolvedValue({
      success: true,
      status: 200,
      data: { user, token: 'token-1', permissions },
    });
    await useAuthStore.getState().login('tech.one', 'secret');
    resetStore();

    getMock.mockResolvedValue({ success: false, status: 503, error: 'Service unavailable' });
    await useAuthStore.getState().fetchMe();

    expect(useAuthStore.getState().authVerification).toBe('cached');
    expect(useAuthStore.getState().user?.id).toBe(user.id);
  });

  it('clears cached identity and token on explicit authentication rejection', async () => {
    postMock.mockResolvedValue({
      success: true,
      status: 200,
      data: { user, token: 'token-1', permissions },
    });
    await useAuthStore.getState().login('tech.one', 'secret');
    resetStore();

    getMock.mockResolvedValue({ success: false, status: 401, error: 'Authentication required' });
    await useAuthStore.getState().fetchMe();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.authVerification).toBe('none');
    expect(state.user).toBeNull();
    expect(localStorage.getItem('eam_token')).toBeNull();
    expect(localStorage.getItem('eam_auth_snapshot')).toBeNull();
  });

  it('fails closed without a valid snapshot but preserves the token for later re-verification', async () => {
    localStorage.setItem('eam_token', 'token-1');
    localStorage.setItem('eam_user_id', user.id);
    localStorage.setItem('eam_auth_snapshot', '{corrupt');
    getMock.mockResolvedValue({ success: false, error: 'Network error' });

    await useAuthStore.getState().fetchMe();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.authVerification).toBe('none');
    expect(state.user).toBeNull();
    expect(localStorage.getItem('eam_token')).toBe('token-1');
  });

  it('logout clears the cached snapshot even if the server logout call is unavailable', async () => {
    postMock
      .mockResolvedValueOnce({ success: true, status: 200, data: { user, token: 'token-1', permissions } })
      .mockResolvedValueOnce({ success: false, error: 'Network error' });
    await useAuthStore.getState().login('tech.one', 'secret');

    await useAuthStore.getState().logout();

    expect(localStorage.getItem('eam_auth_snapshot')).toBeNull();
    expect(localStorage.getItem('eam_token')).toBeNull();
    expect(useAuthStore.getState().authVerification).toBe('none');
  });
});
