'use client';

import { useEffect } from 'react';
import { createLogger } from '@/lib/logger';
import { OfflineQueueStorage } from '@/lib/offline-queue-storage';

const logger = createLogger('offlineStorageBootstrap');

/**
 * Initializes the shared offline storage as soon as the app hydrates.
 *
 * This deliberately has no UI. Its job is to make legacy localStorage →
 * IndexedDB migration a platform concern rather than waiting for a technician
 * to open a specific Repairs screen.
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
  }, []);

  return null;
}
