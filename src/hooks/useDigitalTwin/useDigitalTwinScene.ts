'use client';

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useDigitalTwinStore, type LiveReading, type MeshHealthEntry } from '@/stores/digitalTwinStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { api } from '@/lib/api';
import { parseIoTHealthUpdate, parseIoTReadingUpdate } from './digital-twin-realtime-payloads';

// ============================================================================
// Types
// ============================================================================

/** Configuration options for the scene hook */
export interface UseDigitalTwinSceneOptions {
  /** Interval in milliseconds for IoT data polling (default: 15000 = 15s). Set to 0 to disable. */
  iotPollInterval?: number;
  /** Whether to subscribe to WebSocket real-time updates (default: true) */
  enableRealtime?: boolean;
}

/** Return type for useDigitalTwinScene */
export interface UseDigitalTwinSceneReturn {
  /** Current scene data */
  scene: ReturnType<typeof useDigitalTwinStore.getState>['currentScene'];
  /** Whether the scene is currently loading */
  isLoading: boolean;
  /** Error message if scene loading failed */
  error: string | null;
  /** Manually trigger a scene refresh */
  refresh: () => Promise<void>;
  /** Whether the IoT polling is currently active */
  isPolling: boolean;
  /** Number of IoT data refreshes completed */
  refreshCount: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_IOT_POLL_INTERVAL = 15_000; // 15 seconds

// ============================================================================
// Hook
// ============================================================================

/**
 * useDigitalTwinScene
 *
 * Wraps the digital twin Zustand store to provide:
 * - Scene loading with error handling
 * - Auto-refresh IoT data on a configurable polling interval
 * - WebSocket subscription for real-time IoT updates
 *
 * @param sceneId  - The digital twin scene/asset ID to load (null to idle)
 * @param options  - Configuration for polling and realtime
 */
export function useDigitalTwinScene(
  sceneId: string | null,
  options: UseDigitalTwinSceneOptions = {},
): UseDigitalTwinSceneReturn {
  const { iotPollInterval = DEFAULT_IOT_POLL_INTERVAL, enableRealtime = true } = options;

  // Store state
  const scene = useDigitalTwinStore((s) => s.currentScene);
  const isLoadingScene = useDigitalTwinStore((s) => s.isLoadingScene);
  const sceneError = useDigitalTwinStore((s) => s.sceneError);
  const updateHealthMap = useDigitalTwinStore((s) => s.updateHealthMap);
  const updateLiveReading = useDigitalTwinStore((s) => s.updateLiveReading);
  const loadScene = useDigitalTwinStore((s) => s.loadScene);
  const iotOverlayEnabled = useDigitalTwinStore((s) => s.iotOverlayEnabled);

  // Local state
  const [isPolling, setIsPolling] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);

  // Refs for cleanup
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // WebSocket connection
  const { connected, on, off } = useWebSocket();

  // ──────────────────────────────────────────────────────────────────────
  // IoT Data Fetcher
  // ──────────────────────────────────────────────────────────────────────

  const fetchIoTData = useCallback(async () => {
    const state = useDigitalTwinStore.getState();
    const assetId = state.currentScene?.assetId;
    if (!assetId || !state.iotOverlayEnabled) return;

    try {
      // Fetch latest readings from IoT monitoring API
      const res = await api.get<{
        devicesWithReadings: Array<{
          id: string;
          name: string;
          deviceCode: string;
          assetId: string;
          lastReading: number | null;
          status: string;
          unit: string;
          readings: Array<{ id: string; value: number; timestamp: string }>;
          rules: Array<{ id: string; threshold: number; severity: string }>;
        }>;
      }>('/api/iot/monitoring/summary');

      if (res.success && res.data?.devicesWithReadings) {
        const healthMap: Record<string, MeshHealthEntry> = {};
        const readingsMap: Record<string, LiveReading> = {};

        for (const device of res.data.devicesWithReadings) {
          if (device.assetId !== assetId) continue;

          // Use deviceCode or device name as mesh identifier
          const meshKey = device.deviceCode || device.name;

          // Derive health from status
          const status: MeshHealthEntry['status'] =
            device.status === 'online'
              ? 'healthy'
              : device.status === 'warning'
                ? 'warning'
                : device.status === 'error'
                  ? 'critical'
                  : 'unknown';

          healthMap[meshKey] = {
            score: device.status === 'online' ? 100 : device.status === 'warning' ? 60 : device.status === 'error' ? 20 : 50,
            status,
          };

          // Take the latest reading
          const latest = device.readings?.[0];
          if (latest) {
            readingsMap[meshKey] = {
              value: latest.value,
              unit: device.unit || '',
              timestamp: latest.timestamp,
            };
          }
        }

        if (mountedRef.current) {
          // CRITICAL: React.startTransition does NOT prevent Error #185 for
          // Zustand set() calls. These are async callback completions (fetch
          // results), so they fire outside React's render phase. However, if
          // multiple microtasks queue up, they can interleave with renders.
          // Using setTimeout(0) ensures the store update fires in a fresh
          // macrotask, completely outside any ongoing React render cycle.
          const healthMapSnapshot = healthMap;
          const readingsSnapshot = readingsMap;
          setTimeout(() => {
            if (!mountedRef.current) return;
            updateHealthMap(healthMapSnapshot);
            for (const [key, reading] of Object.entries(readingsSnapshot)) {
              updateLiveReading(key, reading);
            }
            setRefreshCount((c) => c + 1);
          }, 0);
        }
      }
    } catch {
      // Silent failure for IoT polling — don't disrupt the viewer
    }
  }, [updateHealthMap, updateLiveReading]);

  // ──────────────────────────────────────────────────────────────────────
  // Refresh function
  // ──────────────────────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    if (!sceneId) return;
    await loadScene(sceneId);
    if (useDigitalTwinStore.getState().iotOverlayEnabled) {
      await fetchIoTData();
    }
  }, [sceneId, loadScene, fetchIoTData]);

  // ──────────────────────────────────────────────────────────────────────
  // Scene loading effect
  // ──────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!sceneId) {
      // When sceneId is null, do nothing (parent manages idle state)
      return;
    }

    mountedRef.current = true;
    loadScene(sceneId);
  }, [sceneId, loadScene]);

  // ──────────────────────────────────────────────────────────────────────
  // IoT Polling effect
  // ──────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (iotPollInterval <= 0) return;

    // Only poll when the overlay is enabled and a scene is loaded
    if (!iotOverlayEnabled || !sceneId) return;

    // Initial fetch
    fetchIoTData();
    setIsPolling(true);

    pollTimerRef.current = setInterval(() => {
      if (useDigitalTwinStore.getState().iotOverlayEnabled) {
        fetchIoTData();
      }
    }, iotPollInterval);

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      setIsPolling(false);
    };
  }, [sceneId, iotPollInterval, fetchIoTData, iotOverlayEnabled]);

  // ──────────────────────────────────────────────────────────────────────
  // WebSocket real-time subscription
  // ──────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!enableRealtime || !sceneId) return;

    const assetId = useDigitalTwinStore.getState().currentScene?.assetId;

    const handleIoTUpdate = (...args: unknown[]) => {
      const data = parseIoTReadingUpdate(args[0]);
      if (!data) return;
      // Only process updates for our asset
      if (data.assetId && data.assetId !== assetId) return;

      // CRITICAL: React.startTransition does NOT prevent Error #185 for
      // Zustand set() calls. Use setTimeout(0) to defer outside any
      // potential React render cycle.
      setTimeout(() => {
        if (!mountedRef.current) return;
        updateLiveReading(data.deviceId, {
          value: data.value,
          unit: data.unit,
          timestamp: data.timestamp,
        });
      }, 0);
    };

    const handleHealthUpdate = (...args: unknown[]) => {
      const data = parseIoTHealthUpdate(args[0]);
      if (!data) return;
      if (data.assetId && data.assetId !== assetId) return;
      // CRITICAL: React.startTransition does NOT prevent Error #185 for
      // Zustand set() calls. Use setTimeout(0) to defer outside any
      // potential React render cycle.
      setTimeout(() => {
        if (!mountedRef.current) return;
        updateHealthMap(data.healthMap);
      }, 0);
    };

    if (connected) {
      on('iot:reading-update', handleIoTUpdate);
      on('iot:health-update', handleHealthUpdate);
    }

    return () => {
      off('iot:reading-update', handleIoTUpdate);
      off('iot:health-update', handleHealthUpdate);
    };
  }, [enableRealtime, sceneId, connected, on, off, updateHealthMap, updateLiveReading]);

  // ──────────────────────────────────────────────────────────────────────
  // Cleanup on unmount
  // ──────────────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  return {
    scene,
    isLoading: isLoadingScene,
    error: sceneError,
    refresh,
    isPolling,
    refreshCount,
  };
}
