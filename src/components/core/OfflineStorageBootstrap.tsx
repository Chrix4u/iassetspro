'use client';

import { useEffect, useMemo, useState } from 'react';
import { createLogger } from '@/lib/logger';
import { OfflineQueueStorage } from '@/lib/offline-queue-storage';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useAuthStore } from '@/stores/authStore';
import {
  OFFLINE_CACHE_STATE_EVENT,
  type OfflineCacheStateEventDetail,
} from '@/lib/api';

const logger = createLogger('offlineStorageBootstrap');
const CLIENT_BUILD_VERSION = process.env.NEXT_PUBLIC_BUILD_VERSION || 'local';
const BUILD_VERSION_CHECK_INTERVAL_MS = 60_000;

function isComparableBuildVersion(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value !== 'unknown'
    && value !== 'local';
}

export async function registerCoreServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    process.env.NODE_ENV === 'development'
  ) {
    return null;
  }

  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

  // Do not rely on the browser's periodic service-worker update interval. Check
  // on each app bootstrap so a newly deployed shell/cache version is discovered
  // promptly; the worker's skipWaiting/claim flow then evicts the prior cache.
  await registration.update().catch(() => undefined);
  return registration;
}

/**
 * Mount the replay engine only after the auth store has established a current
 * user. This avoids treating the login screen as a sync failure while still
 * making replay a platform concern instead of a particular Repairs page.
 */
export function OfflineReplayRuntime() {
  useOfflineSync();
  return null;
}

/**
 * Initializes shared offline platform services as soon as the app hydrates and
 * keeps an explicit, persistent indicator whenever any work-order section is
 * being displayed from a cached snapshot rather than a live server response.
 */
export function OfflineStorageBootstrap() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [cachedEndpoints, setCachedEndpoints] = useState<Record<string, string>>({});
  const [serverBuildVersion, setServerBuildVersion] = useState<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let disposed = false;

    const checkBuildVersion = async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      try {
        const response = await fetch('/api/health', {
          method: 'GET',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) return;
        const payload = await response.json() as { buildVersion?: unknown };
        const deployed = payload?.buildVersion;
        if (!isComparableBuildVersion(deployed) || disposed) return;

        setServerBuildVersion(deployed);
        if (deployed !== CLIENT_BUILD_VERSION) {
          setUpdateAvailable(true);
        }
      } catch {
        // Version checks are advisory. Network/auth/business flows must not be
        // disrupted if the public health probe is temporarily unavailable.
      }
    };

    void checkBuildVersion();
    const buildTimer = window.setInterval(() => void checkBuildVersion(), BUILD_VERSION_CHECK_INTERVAL_MS);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void checkBuildVersion();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    void OfflineQueueStorage.getBackend()
      .then((backend) => {
        logger.info('Offline storage initialized', { backend });
      })
      .catch((error: unknown) => {
        logger.error('Offline storage initialization failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      });

    void registerCoreServiceWorker()
      .then((registration) => {
        if (registration) {
          logger.info('CORE service worker registered', { scope: registration.scope });
        }
      })
      .catch((error: unknown) => {
        logger.error('CORE service worker registration failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      });

    const handleCacheState = (event: Event) => {
      const detail = (event as CustomEvent<OfflineCacheStateEventDetail>).detail;
      if (!detail?.endpoint) return;

      setCachedEndpoints((previous) => {
        if (detail.cached) {
          return {
            ...previous,
            [detail.endpoint]: detail.cachedAt || new Date().toISOString(),
          };
        }

        if (!(detail.endpoint in previous)) return previous;
        const next = { ...previous };
        delete next[detail.endpoint];
        return next;
      });
    };

    window.addEventListener(OFFLINE_CACHE_STATE_EVENT, handleCacheState);
    return () => {
      disposed = true;
      window.clearInterval(buildTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener(OFFLINE_CACHE_STATE_EVENT, handleCacheState);
    };
  }, []);

  const oldestCachedAt = useMemo(() => {
    const timestamps = Object.values(cachedEndpoints)
      .map((value) => Date.parse(value))
      .filter(Number.isFinite);
    if (timestamps.length === 0) return null;
    return new Date(Math.min(...timestamps)).toLocaleString();
  }, [cachedEndpoints]);

  const staleSectionCount = Object.keys(cachedEndpoints).length;

  return (
    <>
      {isAuthenticated ? <OfflineReplayRuntime /> : null}
      {updateAvailable ? (
        <div
          role="status"
          aria-live="polite"
          data-testid="app-update-banner"
          className="fixed left-1/2 top-4 z-[110] flex w-[min(94vw,46rem)] -translate-x-1/2 items-center justify-between gap-3 rounded-xl border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-950 shadow-lg dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100"
        >
          <div className="min-w-0">
            <strong>A newer iAssetsPro version is available.</strong>{' '}
            Refresh to load the latest workflow and authorization fixes.
            {serverBuildVersion ? (
              <span className="ml-1 text-xs opacity-70">
                ({CLIENT_BUILD_VERSION.slice(0, 8)} → {serverBuildVersion.slice(0, 8)})
              </span>
            ) : null}
          </div>
          <button
            type="button"
            className="shrink-0 rounded-md border border-sky-400 bg-white px-3 py-1.5 font-medium text-sky-800 hover:bg-sky-100 dark:bg-sky-900 dark:text-sky-100"
            onClick={() => window.location.reload()}
          >
            Refresh now
          </button>
        </div>
      ) : null}
      {staleSectionCount > 0 ? (
        <div
          role="status"
          aria-live="polite"
          data-testid="offline-cached-data-banner"
          className="fixed bottom-4 left-1/2 z-[100] w-[min(94vw,44rem)] -translate-x-1/2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-lg dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
        >
          <strong>Cached work-order data is being shown.</strong>{' '}
          {staleSectionCount} section{staleSectionCount === 1 ? '' : 's'} may be stale
          {oldestCachedAt ? ` (oldest snapshot ${oldestCachedAt})` : ''}. Live server data will replace each
          section after it refreshes successfully.
        </div>
      ) : null}
    </>
  );
}
