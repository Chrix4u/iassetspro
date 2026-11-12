import { create } from 'zustand';
import { api } from '@/lib/api';
import { normalizeDayFirstDateFormat } from '@/lib/date-display';

// ============================================================================
// Types
// ============================================================================

export interface UserPreferences {
  display: {
    defaultPage: string;
    itemsPerPage: number;
    compactMode: boolean;
  };
  notifications: {
    soundEnabled: boolean;
    desktopNotifications: boolean;
  };
  dateTime: {
    dateFormat: string;
    timezone: string;
  };
}

// Default preferences
const DEFAULT_PREFERENCES: UserPreferences = {
  display: {
    defaultPage: 'dashboard',
    itemsPerPage: 25,
    compactMode: false,
  },
  notifications: {
    soundEnabled: true,
    desktopNotifications: false,
  },
  dateTime: {
    dateFormat: 'DD/MM/YYYY',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  },
};

// ============================================================================
// localStorage persistence helpers
// ============================================================================

const LS_KEY = 'eam_user_preferences';

function loadFromStorage(): UserPreferences {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw);
    return {
      display: { ...DEFAULT_PREFERENCES.display, ...parsed.display },
      notifications: { ...DEFAULT_PREFERENCES.notifications, ...parsed.notifications },
      dateTime: { ...DEFAULT_PREFERENCES.dateTime, ...parsed.dateTime, dateFormat: normalizeDayFirstDateFormat(parsed.dateTime?.dateFormat) },
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function saveToStorage(prefs: UserPreferences): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(prefs));
    localStorage.setItem('iassetspro_date_display_format', normalizeDayFirstDateFormat(prefs.dateTime.dateFormat));
  } catch {
    // Silently fail
  }
}

// ============================================================================
// Store interface
// ============================================================================

interface PreferencesState {
  preferences: UserPreferences;
  isLoaded: boolean;
  isSaving: boolean;
  fetchPreferences: () => Promise<void>;
  savePreferences: (prefs: Partial<UserPreferences>) => Promise<boolean>;
  updatePreferences: (prefs: Partial<UserPreferences>) => void;
  resetPreferences: () => void;
}

// ============================================================================
// Zustand Store
// ============================================================================

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  preferences: loadFromStorage(),
  isLoaded: false,
  isSaving: false,

  fetchPreferences: async () => {
    try {
      const res = await api.get<UserPreferences>('/api/user/preferences');
      if (res.success && res.data) {
        const merged: UserPreferences = {
          display: { ...DEFAULT_PREFERENCES.display, ...res.data.display },
          notifications: { ...DEFAULT_PREFERENCES.notifications, ...res.data.notifications },
          dateTime: { ...DEFAULT_PREFERENCES.dateTime, ...res.data.dateTime, dateFormat: normalizeDayFirstDateFormat(res.data.dateTime?.dateFormat) },
        };
        saveToStorage(merged);
        set({ preferences: merged, isLoaded: true });
      } else {
        set({ isLoaded: true });
      }
    } catch {
      set({ isLoaded: true });
    }
  },

  savePreferences: async (prefs: Partial<UserPreferences>) => {
    set({ isSaving: true });
    try {
      // Merge with current preferences
      const current = get().preferences;
      const merged: UserPreferences = {
        display: { ...current.display, ...prefs.display },
        notifications: { ...current.notifications, ...prefs.notifications },
        dateTime: { ...current.dateTime, ...prefs.dateTime, dateFormat: normalizeDayFirstDateFormat(prefs.dateTime?.dateFormat ?? current.dateTime.dateFormat) },
      };

      const res = await api.put('/api/user/preferences', merged);
      if (res.success) {
        saveToStorage(merged);
        set({ preferences: merged, isSaving: false });
        return true;
      }
      set({ isSaving: false });
      return false;
    } catch {
      set({ isSaving: false });
      return false;
    }
  },

  updatePreferences: (prefs: Partial<UserPreferences>) => {
    const current = get().preferences;
    const merged: UserPreferences = {
      display: { ...current.display, ...prefs.display },
      notifications: { ...current.notifications, ...prefs.notifications },
      dateTime: { ...current.dateTime, ...prefs.dateTime, dateFormat: normalizeDayFirstDateFormat(prefs.dateTime?.dateFormat ?? current.dateTime.dateFormat) },
    };
    saveToStorage(merged);
    set({ preferences: merged });
  },

  resetPreferences: () => {
    saveToStorage(DEFAULT_PREFERENCES);
    set({ preferences: DEFAULT_PREFERENCES });
  },
}));
