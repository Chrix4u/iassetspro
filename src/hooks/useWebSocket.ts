'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/authStore';

interface UseWebSocketReturn {
  connected: boolean;
  on: (event: string, handler: (...args: unknown[]) => void) => () => void;
  off: (event: string, handler?: (...args: unknown[]) => void) => void;
  emit: (event: string, ...args: unknown[]) => void;
}

const notificationSocketUrl = process.env.NEXT_PUBLIC_NOTIFICATION_SOCKET_URL?.trim();
const notificationHealthUrl = process.env.NEXT_PUBLIC_NOTIFICATION_HEALTH_URL?.trim();

/**
 * Check an explicitly configured notification-service health endpoint.
 *
 * When no health URL is configured we allow a connection attempt to the
 * explicitly configured socket URL. When no socket URL is configured at all,
 * the hook remains disabled and callers fall back to their REST polling path.
 */
async function checkServiceHealth(): Promise<boolean> {
  if (!notificationHealthUrl) return true;

  try {
    const res = await fetch(notificationHealthUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Optional WebSocket hook for real-time notifications.
 *
 * Production no longer guesses internal Webuzo/PM2 ports. A socket connection
 * is attempted only when NEXT_PUBLIC_NOTIFICATION_SOCKET_URL is explicitly
 * configured at build time. Notification consumers already provide REST
 * polling, so an unconfigured or unavailable socket service degrades cleanly
 * without generating repeated /health or Socket.IO 404s.
 */
export function useWebSocket(): UseWebSocketReturn {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef<Map<string, Set<(...args: unknown[]) => void>>>(new Map());
  const mountedRef = useRef(true);
  const healthTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectingRef = useRef(false);

  const connectSocket = useCallback((userId: string) => {
    if (!notificationSocketUrl || connectingRef.current || socketRef.current?.connected) return;
    connectingRef.current = true;

    const socket = io(notificationSocketUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 5000,
      reconnectionDelayMax: 30000,
      timeout: 10000,
      withCredentials: true,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      if (!mountedRef.current) return;
      connectingRef.current = false;
      setConnected(true);
      socket.emit('auth', { userId });
      socket.emit('subscribe:notifications', userId);

      for (const [event, handlers] of handlersRef.current) {
        for (const handler of handlers) {
          socket.on(event, handler);
        }
      }
    });

    socket.on('disconnect', () => {
      if (!mountedRef.current) return;
      setConnected(false);
    });

    socket.on('connect_error', () => {
      if (!mountedRef.current) return;
      connectingRef.current = false;
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    });
  }, []);

  const cleanupSocket = useCallback(() => {
    if (socketRef.current) {
      for (const [event, handlers] of handlersRef.current) {
        for (const handler of handlers) {
          socketRef.current!.off(event, handler);
        }
      }
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    connectingRef.current = false;
    setConnected(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    // No explicit real-time service configured: remain in polling mode.
    if (!notificationSocketUrl || !isAuthenticated || !user?.id) {
      return () => {
        mountedRef.current = false;
        cleanupSocket();
      };
    }

    const userId = user.id;

    const tryConnect = async () => {
      if (!mountedRef.current) return;
      const healthy = await checkServiceHealth();
      if (!mountedRef.current) return;

      if (healthy) {
        connectSocket(userId);
      } else {
        healthTimerRef.current = setTimeout(tryConnect, 30_000);
      }
    };

    void tryConnect();

    return () => {
      mountedRef.current = false;
      if (healthTimerRef.current) {
        clearTimeout(healthTimerRef.current);
        healthTimerRef.current = null;
      }
      cleanupSocket();
    };
  }, [isAuthenticated, user?.id, connectSocket, cleanupSocket]);

  const on = useCallback((event: string, handler: (...args: unknown[]) => void) => {
    if (!handlersRef.current.has(event)) {
      handlersRef.current.set(event, new Set());
    }
    handlersRef.current.get(event)!.add(handler);
    socketRef.current?.on(event, handler);
    return () => {
      handlersRef.current.get(event)?.delete(handler);
      if (handlersRef.current.get(event)?.size === 0) {
        handlersRef.current.delete(event);
      }
      socketRef.current?.off(event, handler);
    };
  }, []);

  const off = useCallback((event: string, handler?: (...args: unknown[]) => void) => {
    if (handler) {
      handlersRef.current.get(event)?.delete(handler);
      socketRef.current?.off(event, handler);
    } else {
      handlersRef.current.delete(event);
      socketRef.current?.removeAllListeners(event);
    }
  }, []);

  const emit = useCallback((event: string, ...args: unknown[]) => {
    socketRef.current?.emit(event, ...args);
  }, []);

  return { connected, on, off, emit };
}
