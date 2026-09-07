'use client';

import { useEffect } from 'react';
import { createLogger } from '@/lib/logger';
import { OfflineQueueStorage } from '@/lib/offline-queue-storage';

const logger = createLogger('offlineStorageBootstrap');

export async function registerCoreServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    process.env.NODE_ENV !== 'production'
  ) {
    return null;
  }

  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

/**
 * Initializes shared offline platform services as soon as the app hydrates.
 *
 * This deliberately has no UI. It makes storage migration and service-worker
 * registration platform concerns rather than waiting for a technician to open
 * a specific Repairs screen.
 */
export function OfflineStorageBootstrap() {
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
  }, []);

  return null;
}
