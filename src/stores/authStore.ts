import { create } from 'zustand';
import type { User } from '@/types';
import { api } from '@/lib/api';

// --- localStorage keys ---
const LS_TOKEN = 'eam_token';
const LS_USER_ID = 'eam_user_id';
const LS_PERMISSIONS = 'user_permissions';
const LS_ROLES = 'user_roles';
const LS_PLANT_ID = 'user_plant_id';
const LS_PLANT_ACCESS = 'user_plant_access';
const LS_AUTH_SNAPSHOT = 'eam_auth_snapshot';

export type AuthVerification = 'none' | 'verified' | 'cached';

interface CachedAuthSnapshot {
  user: User;
  permissions: string[];
  verifiedAt: string;
}

/** Persist auth-related data to localStorage so client-side guards can read it. */
function persistAuthData(user: User, permissions: string[]): void {
  localStorage.setItem(LS_USER_ID, user.id);
  localStorage.setItem(LS_PERMISSIONS, JSON.stringify(permissions));
  localStorage.setItem(LS_ROLES, JSON.stringify((user.roles || []).map(r => r.slug)));
  localStorage.setItem(LS_PLANT_ID, user.plantId || '');
  localStorage.setItem(LS_PLANT_ACCESS, JSON.stringify(user.plantAccess || []));
  const snapshot: CachedAuthSnapshot = {
    user,
    permissions,
    verifiedAt: new Date().toISOString(),
  };
  localStorage.setItem(LS_AUTH_SNAPSHOT, JSON.stringify(snapshot));
}

function readCachedAuthSnapshot(): CachedAuthSnapshot | null {
  try {
    const raw = localStorage.getItem(LS_AUTH_SNAPSHOT);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedAuthSnapshot> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.user || typeof parsed.user !== 'object' || typeof parsed.user.id !== 'string' || !parsed.user.id) return null;
    if (!Array.isArray(parsed.permissions) || !parsed.permissions.every(permission => typeof permission === 'string')) return null;
    if (typeof parsed.verifiedAt !== 'string' || !parsed.verifiedAt) return null;

    // The identity snapshot must agree with the separately persisted actor id.
    // This prevents a stale/corrupt snapshot from silently changing the actor
    // that owns queued offline field work.
    const persistedUserId = localStorage.getItem(LS_USER_ID);
    if (persistedUserId && persistedUserId !== parsed.user.id) return null;

    return parsed as CachedAuthSnapshot;
  } catch {
    return null;
  }
}

/** Clear all auth-related localStorage entries. */
function clearAuthData(): void {
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_USER_ID);
  localStorage.removeItem(LS_PERMISSIONS);
  localStorage.removeItem(LS_ROLES);
  localStorage.removeItem(LS_PLANT_ID);
  localStorage.removeItem(LS_PLANT_ACCESS);
  localStorage.removeItem(LS_AUTH_SNAPSHOT);
}

function cachedSessionState(snapshot: CachedAuthSnapshot) {
  return {
    user: snapshot.user,
    permissions: snapshot.permissions,
    role: snapshot.user.roles?.[0]?.slug || null,
    isAuthenticated: true,
    authVerification: 'cached' as const,
    isLoading: false,
  };
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  permissions: string[];
  role: string | null;
  isLoading: boolean;
  authVerification: AuthVerification;
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
  hasPermission: (slug: string) => boolean;
  hasAnyPermission: (slugs: string[]) => boolean;
  isAdmin: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  permissions: [],
  role: null,
  isLoading: false,
  authVerification: 'none',

  login: async (username: string, password: string): Promise<{ ok: boolean; error?: string }> => {
    set({ isLoading: true });
    try {
      const res = await api.post<{ user: User; token: string; permissions: string[] }>('/api/auth/login', { username, password });
      if (res.success && res.data) {
        localStorage.setItem(LS_TOKEN, res.data.token);
        persistAuthData(res.data.user, res.data.permissions);
        set({
          user: res.data.user,
          permissions: res.data.permissions,
          role: res.data.user.roles?.[0]?.slug || null,
          isAuthenticated: true,
          authVerification: 'verified',
          isLoading: false,
        });
        return { ok: true };
      }
      set({ isLoading: false });
      return { ok: false, error: res.error || 'Invalid credentials' };
    } catch (err: unknown) {
      set({ isLoading: false });
      return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
    }
  },

  logout: async () => {
    await api.post('/api/auth/logout');
    clearAuthData();
    set({
      user: null,
      isAuthenticated: false,
      permissions: [],
      role: null,
      authVerification: 'none',
      isLoading: false,
    });
  },

  fetchMe: async () => {
    const token = localStorage.getItem(LS_TOKEN);
    if (!token) {
      set({
        user: null,
        isAuthenticated: false,
        permissions: [],
        role: null,
        authVerification: 'none',
        isLoading: false,
      });
      return;
    }

    set({ isLoading: true });
    try {
      const res = await api.get<{ user: User; permissions: string[] }>('/api/auth/me');
      if (res.success && res.data) {
        persistAuthData(res.data.user, res.data.permissions);
        set({
          user: res.data.user,
          permissions: res.data.permissions,
          role: res.data.user.roles?.[0]?.slug || null,
          isAuthenticated: true,
          authVerification: 'verified',
          isLoading: false,
        });
        return;
      }

      // Only an explicit auth rejection proves the stored token is no longer
      // valid. Network failures, timeouts, and server outages must not destroy
      // the last verified local identity needed for offline field work.
      if (res.status === 401 || res.status === 403) {
        clearAuthData();
        set({
          user: null,
          isAuthenticated: false,
          permissions: [],
          role: null,
          authVerification: 'none',
          isLoading: false,
        });
        return;
      }

      const cached = readCachedAuthSnapshot();
      if (cached) {
        set(cachedSessionState(cached));
      } else {
        set({
          user: null,
          isAuthenticated: false,
          permissions: [],
          role: null,
          authVerification: 'none',
          isLoading: false,
        });
      }
    } catch {
      const cached = readCachedAuthSnapshot();
      if (cached) {
        set(cachedSessionState(cached));
      } else {
        // Preserve the token on transient failure so a later online retry can
        // re-verify it. Without a verified snapshot we still fail closed and
        // do not create an authenticated local session.
        set({
          user: null,
          isAuthenticated: false,
          permissions: [],
          role: null,
          authVerification: 'none',
          isLoading: false,
        });
      }
    }
  },

  hasPermission: (slug: string) => {
    const { permissions } = get();
    return Array.isArray(permissions) && permissions.includes(slug);
  },

  hasAnyPermission: (slugs: string[]) => {
    const { permissions } = get();
    return Array.isArray(permissions) && slugs.some(s => permissions.includes(s));
  },

  isAdmin: () => {
    const { role } = get();
    return role === 'admin';
  },
}));
