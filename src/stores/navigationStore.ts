// No React import needed — startTransition does not affect Zustand set() calls
import { create } from 'zustand';
import type { PageName } from '@/types';
import { api } from '@/lib/api';

interface NavigationState {
  currentPage: PageName;
  pageParams: Record<string, string>;
  sidebarOpen: boolean;
  mobileSidebarOpen: boolean;
  enabledModules: Set<string> | null; // null = not loaded yet; non-core modules fail closed
  fetchModules: () => Promise<void>;
  refreshModules: () => Promise<void>; // force re-fetch, bypasses cache
  navigate: (page: PageName, params?: Record<string, string>, replace?: boolean) => void;
  goBack: () => void;
  toggleSidebar: () => void;
  toggleMobileSidebar: () => void;
  setMobileSidebarOpen: (open: boolean) => void;
}

// ============================================================================
// Browser history integration
// ============================================================================

function pushNavState(page: PageName, params: Record<string, string>, replace = false) {
  const url = buildUrl(page, params);
  const state = { [HISTORY_STATE_KEY]: true, page, params };

  if (replace) {
    window.history.replaceState(state, '', url);
  } else {
    window.history.pushState(state, '', url);
  }
}

function buildUrl(page: PageName, params: Record<string, string>): string {
  const base = `#/${page}`;
  const qs = new URLSearchParams(params).toString();
  return qs ? `${base}?${qs}` : base;
}

function parseHash(): { page: PageName; params: Record<string, string> } | null {
  const hash = window.location.hash; // e.g. #/dashboard?id=123
  if (!hash || hash === '#' || hash === '#/') {
    return null;
  }
  // Remove leading #/
  const path = hash.replace(/^#\/?/, '');
  const [pagePart, queryPart] = path.split('?');
  const page = pagePart as PageName;
  const params: Record<string, string> = {};
  if (queryPart) {
    const qs = new URLSearchParams(queryPart);
    qs.forEach((v, k) => { params[k] = v; });
  }
  return { page, params };
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  currentPage: 'dashboard',
  pageParams: {},
  sidebarOpen: true,
  mobileSidebarOpen: false,
  enabledModules: null,

  fetchModules: async () => {
    // Avoid duplicate fetches if already loaded
    if (get().enabledModules !== null) return;
    await get().refreshModules();
  },

  refreshModules: async () => {
    // Force re-fetch from API (bypasses cache). Module provisioning belongs to
    // deployment/admin workflows; ordinary users must not call admin-only setup routes.
    try {
      const res = await api.get<any[]>('/api/modules');
      if (res.success && Array.isArray(res.data)) {
        const enabled = new Set<string>();
        res.data.forEach((m: any) => {
          const code = String(m.code || '').toLowerCase();
          if (!code) return;
          // Only the platform kernel is unconditional. Every business
          // module — even legacy records marked isCore — must respect company
          // licensing/activation so disabled modules cannot leak UI.
          if (code === 'core') {
            enabled.add(code);
            return;
          }

          if (m.isSystemLicensed === true && m.isEnabled === true && m.isActive === true) {
            enabled.add(code);
          }
        });
        // Empty is a valid, fail-closed state: only core remains visible.
        set({ enabledModules: enabled });
      }
    } catch {
      // Fail closed on module-state errors. Keep null so non-core UI stays hidden.
    }
  },

  navigate: (page, params = {}, replace = false) => {
    set({ currentPage: page, pageParams: params, mobileSidebarOpen: false });
    pushNavState(page, params, replace);
  },

  goBack: () => {
    // Always use browser history.back() — the popstate guard will
    // prevent closing the tab/webview by pushing forward to dashboard.
    window.history.back();
  },

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  toggleMobileSidebar: () => set((s) => ({ mobileSidebarOpen: !s.mobileSidebarOpen })),

  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
}));

// ============================================================================
// Global popstate listener + history guard for mobile/webview
// ============================================================================

const HISTORY_STATE_KEY = 'eam_nav';

if (typeof window !== 'undefined') {
  // Flag to detect when we just recovered from a guard entry.
  // This prevents the "back to previous page" loop after guard recovery.
  let guardRecoveryPending = false;

  window.addEventListener('popstate', (event) => {
    // If we just pushed forward after hitting the guard, the browser may
    // fire popstate again as it reconciles. Ignore it and stay put.
    if (guardRecoveryPending) {
      guardRecoveryPending = false;
      // Re-push to ensure we stay on dashboard
      window.history.pushState(
        { [HISTORY_STATE_KEY]: true, page: 'dashboard', params: {} },
        '',
        buildUrl('dashboard', {})
      );
      return;
    }

    // Normal app navigation — state has our marker and a page.
    // CRITICAL: React.startTransition does NOT prevent Error #185 for Zustand
    // set() calls — it only affects React's own setState. Using setTimeout(0)
    // defers to the next macrotask, ensuring the store update fires outside
    // any ongoing React render cycle.
    if (event.state?.[HISTORY_STATE_KEY] && event.state?.page) {
      const { page, params } = event.state;
      setTimeout(() => {
        useNavigationStore.setState({
          currentPage: page as PageName,
          pageParams: params || {},
        });
      }, 0);
      return;
    }

    // Guard entry or external navigation — we've hit the bottom of app history.
    // Push forward to dashboard to prevent the tab/webview from closing.
    // This is critical for mobile browsers and webviews where pressing back
    // at the root would close the entire tab.
    // CRITICAL: Use setTimeout(0) instead of startTransition — see above.
    setTimeout(() => {
      useNavigationStore.setState({
        currentPage: 'dashboard',
        pageParams: {},
      });
    }, 0);
    window.history.pushState(
      { [HISTORY_STATE_KEY]: true, page: 'dashboard', params: {} },
      '',
      buildUrl('dashboard', {})
    );
    guardRecoveryPending = true;
  });

  // On initial load, restore from URL hash if present.
  // CRITICAL: This setTimeout(0) defers the setState to the next macrotask,
  // ensuring it fires OUTSIDE any ongoing React render cycle. Without this
  // deferral, the synchronous setState during module initialization can
  // interleave with React's concurrent rendering, causing Error #185.
  // This is especially important when the store module is first imported
  // during a render (e.g., during page navigation with dynamic imports).
  setTimeout(() => {
    const initial = parseHash();
    const initPage: PageName = initial?.page || 'dashboard';
    const initParams = initial?.params || {};

    useNavigationStore.setState({
      currentPage: initPage,
      pageParams: initParams,
    });

    // Replace current history entry with proper app state
    pushNavState(initPage, initParams, true);

    // Push a guard entry so there's always a "previous" entry to go back to.
    // This prevents the browser/webview from closing when the user presses
    // the back button while on the first app page (e.g., dashboard).
    window.history.pushState(null, '', window.location.href);
  }, 0);
}
