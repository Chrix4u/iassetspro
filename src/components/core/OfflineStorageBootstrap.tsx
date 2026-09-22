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

  useEffect(() => {
    void OfflineQueueStorage.getBackend()
      .then((backend) => {
        logger.info('Offline storage initialized', { backend });
      })
      .catch((error: unknown) => {
        logger.error('Offline storage initialization failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      });

    const hadServiceWorkerController =
      'serviceWorker' in navigator && Boolean(navigator.serviceWorker.controller);
    let reloadingForNewShell = false;

    const handleControllerChange = () => {
      // A first-ever service-worker install should not reload the login/app shell.
      // When an already-controlled tab receives a newer worker, however, the JS
      // currently executing in memory may still call obsolete API routes. Reload
      // exactly once so the tab switches to the newly deployed application code.
      if (!hadServiceWorkerController || reloadingForNewShell) return;
      reloadingForNewShell = true;
      window.location.reload();
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    }

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

    // Long-lived plant-floor tabs may stay open across multiple deployments.
    // Ask the browser to check for a new worker periodically instead of waiting
    // for its implementation-defined update interval.
    const serviceWorkerUpdateTimer = window.setInterval(() => {
      if (!('serviceWorker' in navigator)) return;
      void navigator.serviceWorker.getRegistration('/')
        .then((registration) => registration?.update())
        .catch(() => undefined);
    }, 5 * 60 * 1000);

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
      window.clearInterval(serviceWorkerUpdateTimer);
      window.removeEventListener(OFFLINE_CACHE_STATE_EVENT, handleCacheState);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      }
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
