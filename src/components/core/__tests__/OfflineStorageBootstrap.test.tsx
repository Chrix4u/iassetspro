import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const mocks = vi.hoisted(() => ({
  useOfflineSync: vi.fn(),
  auth: { isAuthenticated: false },
}));

vi.mock('@/hooks/useOfflineSync', () => ({
  useOfflineSync: mocks.useOfflineSync,
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: { isAuthenticated: boolean }) => unknown) =>
    selector({ isAuthenticated: mocks.auth.isAuthenticated }),
}));

vi.mock('@/lib/offline-queue-storage', () => ({
  OfflineQueueStorage: {
    getBackend: vi.fn().mockResolvedValue('indexeddb'),
  },
}));

vi.mock('@/lib/api', () => ({
  OFFLINE_CACHE_STATE_EVENT: 'iassetspro:offline-cache-state',
}));

import { OfflineStorageBootstrap } from '@/components/core/OfflineStorageBootstrap';

describe('OfflineStorageBootstrap global replay mounting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.isAuthenticated = false;
  });

  it('does not mount replay before authentication is established', () => {
    renderToStaticMarkup(<OfflineStorageBootstrap />);
    expect(mocks.useOfflineSync).not.toHaveBeenCalled();
  });

  it('mounts the shared replay runtime once for an authenticated app session', () => {
    mocks.auth.isAuthenticated = true;
    renderToStaticMarkup(<OfflineStorageBootstrap />);
    expect(mocks.useOfflineSync).toHaveBeenCalledTimes(1);
  });
});
