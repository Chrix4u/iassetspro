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

  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
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
    return () => window.removeEventListener(OFFLINE_CACHE_STATE_EVENT, handleCacheState);
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
