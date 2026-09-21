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

/** Persist auth-related data to localStorage so client-side guards can read it. */
function persistAuthData(user: User, permissions: string[]): void {
  localStorage.setItem(LS_USER_ID, user.id);
  localStorage.setItem(LS_PERMISSIONS, JSON.stringify(permissions));
  localStorage.setItem(LS_ROLES, JSON.stringify((user.roles || []).map(r => r.slug)));
  localStorage.setItem(LS_PLANT_ID, user.plantId || '');
  localStorage.setItem(LS_PLANT_ACCESS, JSON.stringify(user.plantAccess || []));
}

/** Clear all auth-related localStorage entries */
function clearAuthData(): void {
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_USER_ID);
  localStorage.removeItem(LS_PERMISSIONS);
  localStorage.removeItem(LS_ROLES);
  localStorage.removeItem(LS_PLANT_ID);
  localStorage.removeItem(LS_PLANT_ACCESS);
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  permissions: string[];
  role: string | null;
  isLoading: boolean;
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
          isLoading: false,
        });
        return { ok: true };
      }
      set({ isLoading: false });
      return { ok: false, error: res.error || 'Invalid credentials' };
    } catch (err: any) {
      set({ isLoading: false });
      return { ok: false, error: err?.message || 'Network error' };
    }
  },

  logout: async () => {
    await api.post('/api/auth/logout');
    clearAuthData();
    set({ user: null, isAuthenticated: false, permissions: [], role: null });
  },

  fetchMe: async () => {
    const token = localStorage.getItem(LS_TOKEN);
    if (!token) {
      set({
        user: null,
        isAuthenticated: false,
        permissions: [],
        role: null,
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
          isLoading: false,
        });
      } else {
        clearAuthData();
        set({
          user: null,
          isAuthenticated: false,
          permissions: [],
          role: null,
          isLoading: false,
        });
      }
    } catch {
      clearAuthData();
      set({
        user: null,
        isAuthenticated: false,
        permissions: [],
        role: null,
        isLoading: false,
      });
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