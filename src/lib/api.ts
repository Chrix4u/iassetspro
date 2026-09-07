// API wrapper with auth headers, timeout, and AbortController support
import React from 'react';
import { OfflineSyncService } from '@/services/offlineSync.service';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
const DEFAULT_TIMEOUT_MS = 15_000; // 15 second default timeout

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  status?: number;
  kpis?: any;
  pagination?: any;
  _diag?: any;
  /** True when a supported field mutation was safely persisted to the local offline queue. */
  offlineQueued?: boolean;
  /** Local queue record id for an offline mutation. */
  offlineRecordId?: string;
  // Preserve structured domain metadata returned by APIs (for example
  // readiness blockers, active-session conflicts, validation details).
  [key: string]: any;
}

export interface OfflineMutationDescriptor {
  operation: 'create' | 'update' | 'delete';
  entityType: string;
  entityId: string;
  data: Record<string, unknown>;
}

function parseJsonBody(body: BodyInit | null | undefined): Record<string, unknown> | null {
  if (typeof body !== 'string') return null;
  try {
    const parsed = JSON.parse(body) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function ensureIdempotencyKey(
  data: Record<string, unknown>,
  prefix: string,
): Record<string, unknown> {
  if (typeof data.idempotencyKey === 'string' && data.idempotencyKey.trim()) return data;
  return {
    ...data,
    idempotencyKey: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  };
}

/**
 * Translate only the field mutations explicitly supported by /api/sync/offline.
 * Lifecycle mutations are intentionally excluded: Start/Hold/Resume/Complete
 * remain online, server-authoritative work-order transitions.
 */
export function buildOfflineMutationDescriptor(
  endpoint: string,
  method: string | undefined,
  body: BodyInit | null | undefined,
): OfflineMutationDescriptor | null {
  const normalizedMethod = (method || 'GET').toUpperCase();
  const path = endpoint.split('?')[0];
  const payload = parseJsonBody(body);
  if (!payload) return null;

  let match = /^\/api\/work-orders\/([^/]+)\/comments$/.exec(path);
  if (normalizedMethod === 'POST' && match) {
    return {
      operation: 'create',
      entityType: 'work_order_comment',
      entityId: decodeURIComponent(match[1]),
      data: ensureIdempotencyKey(payload, `comment-${match[1]}`),
    };
  }

  match = /^\/api\/work-orders\/([^/]+)\/tasks\/([^/]+)$/.exec(path);
  if (normalizedMethod === 'PATCH' && match) {
    return {
      operation: 'update',
      entityType: 'work_order_task',
      entityId: decodeURIComponent(match[1]),
      data: ensureIdempotencyKey(
        {
          ...payload,
          taskId: decodeURIComponent(match[2]),
        },
        `task-${match[1]}-${match[2]}`,
      ),
    };
  }

  match = /^\/api\/work-orders\/([^/]+)\/measurements$/.exec(path);
  if (normalizedMethod === 'POST' && match) {
    const measurementData: Record<string, unknown> = {
      parameterKey: payload.parameterKey,
      value: payload.value,
      unit: payload.unit,
    };
    if (typeof payload.componentId === 'string' && payload.componentId) {
      measurementData.componentId = payload.componentId;
    }
    if (typeof payload.acceptableMin === 'number') measurementData.minThreshold = payload.acceptableMin;
    if (typeof payload.acceptableMax === 'number') measurementData.maxThreshold = payload.acceptableMax;

    return {
      operation: 'create',
      entityType: 'work_order_measurement',
      entityId: decodeURIComponent(match[1]),
      data: ensureIdempotencyKey(measurementData, `measurement-${match[1]}`),
    };
  }

  match = /^\/api\/work-orders\/([^/]+)\/team-member-requests$/.exec(path);
  if (normalizedMethod === 'POST' && match) {
    return {
      operation: 'create',
      entityType: 'work_order_assistance',
      entityId: decodeURIComponent(match[1]),
      data: ensureIdempotencyKey(payload, `assistance-${match[1]}`),
    };
  }

  return null;
}

function buildOfflineSyntheticData(
  descriptor: OfflineMutationDescriptor,
  recordId: string,
  recordTimestamp: string,
): Record<string, unknown> {
  if (descriptor.entityType !== 'work_order_measurement') {
    return { queueRecordId: recordId };
  }

  const value = descriptor.data.value;
  const minThreshold = typeof descriptor.data.minThreshold === 'number'
    ? descriptor.data.minThreshold
    : null;
  const maxThreshold = typeof descriptor.data.maxThreshold === 'number'
    ? descriptor.data.maxThreshold
    : null;
  const numericValue = typeof value === 'number' ? value : 0;
  const isAlarm =
    (minThreshold != null && numericValue < minThreshold) ||
    (maxThreshold != null && numericValue > maxThreshold);

  return {
    id: recordId,
    componentId: typeof descriptor.data.componentId === 'string' ? descriptor.data.componentId : '',
    parameterKey: typeof descriptor.data.parameterKey === 'string' ? descriptor.data.parameterKey : '',
    value: numericValue,
    unit: typeof descriptor.data.unit === 'string' ? descriptor.data.unit : '',
    quality: 100,
    minThreshold,
    maxThreshold,
    isAlarm,
    source: 'offline_pending',
    recordedAt: recordTimestamp,
    recordedById: null,
    recordedBy: null,
    component: null,
    pendingSync: true,
  };
}

function queueOfflineMutationIfSupported<T>(
  endpoint: string,
  options: RequestInit,
): ApiResponse<T> | null {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' || navigator.onLine !== false) {
    return null;
  }

  const descriptor = buildOfflineMutationDescriptor(endpoint, options.method, options.body);
  if (!descriptor) return null;

  const record = OfflineSyncService.queueOperation(
    descriptor.operation,
    descriptor.entityType,
    descriptor.entityId,
    descriptor.data,
  );

  return {
    success: true,
    status: 202,
    offlineQueued: true,
    offlineRecordId: record.id,
    data: buildOfflineSyntheticData(descriptor, record.id, record.timestamp) as T,
  };
}

export function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('eam_token');
  const plantId = localStorage.getItem('user_plant_id');
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (plantId) headers['x-plant-id'] = plantId;
  return headers;
}

export async function apiFetch<T = any>(
  endpoint: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<ApiResponse<T>> {
  const { timeout = DEFAULT_TIMEOUT_MS, signal: externalSignal, ...restOptions } = options;
  const isFormData = restOptions.body instanceof FormData;

  const offlineResponse = queueOfflineMutationIfSupported<T>(endpoint, restOptions);
  if (offlineResponse) return offlineResponse;

  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...getAuthHeaders(),
    ...(restOptions.headers as Record<string, string> || {}),
  };

  // Create AbortController — respects both external signal and timeout
  const controller = new AbortController();
  const { signal } = controller;

  // If external signal is provided, abort when it fires
  if (externalSignal) {
    if (externalSignal.aborted) {
      return { success: false, error: 'Request was aborted' };
    }
    externalSignal.addEventListener('abort', () => controller.abort(externalSignal.reason));
  }

  // Set up timeout
  const timeoutId = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), timeout);

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...restOptions,
      headers,
      signal,
    });

    clearTimeout(timeoutId);

    // Handle 204 No Content
    if (res.status === 204) {
      return { success: true, status: res.status };
    }

    // Check Content-Type before parsing JSON
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      if (!res.ok) {
        return { success: false, error: `Request failed with status ${res.status}`, status: res.status };
      }
      return { success: true, status: res.status };
    }

    let json: any;
    try {
      json = await res.json();
    } catch (parseErr: any) {
      return { success: false, error: `Invalid JSON response: ${parseErr.message}`, status: res.status };
    }

    const payload: Record<string, any> = json && typeof json === 'object' ? json : {};

    if (!res.ok || payload.success === false) {
      // Preserve every structured field returned by the domain endpoint. Older
      // behavior collapsed failures to {success,error}, which discarded data
      // such as readiness blockers and the conflicting active work order and
      // left field technicians with a generic, non-actionable error.
      return {
        ...payload,
        success: false,
        error: typeof payload.error === 'string' && payload.error
          ? payload.error
          : `Request failed with status ${res.status}`,
        status: res.status,
      } as ApiResponse<T>;
    }

    const result: ApiResponse<T> = {
      ...payload,
      success: true,
      status: res.status,
      data: payload.data !== undefined ? payload.data : json,
    };
    return result;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err?.name === 'AbortError' || err?.name === 'TimeoutError') {
      const msg = err?.message || '';
      if (msg.includes('timed out') || msg.includes('Timeout')) {
        return { success: false, error: 'Request timed out' };
      }
      return { success: false, error: 'Request was cancelled' };
    }
    return { success: false, error: err.message || 'Network error' };
  }
}

export const api = {
  get: <T = any>(endpoint: string, opts?: RequestInit & { timeout?: number }) =>
    apiFetch<T>(endpoint, { ...opts, method: 'GET' }),
  post: <T = any>(endpoint: string, body?: any, opts?: RequestInit & { timeout?: number }) =>
    apiFetch<T>(endpoint, {
      ...opts,
      method: 'POST',
      body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined),
    }),
  patch: <T = any>(endpoint: string, body?: any, opts?: RequestInit & { timeout?: number }) =>
    apiFetch<T>(endpoint, {
      ...opts,
      method: 'PATCH',
      body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined),
    }),
  put: <T = any>(endpoint: string, body?: any, opts?: RequestInit & { timeout?: number }) =>
    apiFetch<T>(endpoint, {
      ...opts,
      method: 'PUT',
      body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined),
    }),
  delete: <T = any>(endpoint: string, opts?: RequestInit & { timeout?: number }) =>
    apiFetch<T>(endpoint, { ...opts, method: 'DELETE' }),
  /** Raw fetch returning the Response (for blob/binary downloads). Auth headers are injected. */
  getRaw: (endpoint: string, opts?: RequestInit & { timeout?: number }) => {
    const url = `${API_BASE}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), opts?.timeout || DEFAULT_TIMEOUT_MS);
    if (opts?.signal) {
      opts.signal.addEventListener('abort', () => controller.abort(opts.signal?.reason));
    }
    return fetch(url, {
      ...opts,
      headers: { ...getAuthHeaders(), ...(opts?.headers as Record<string, string> || {}) },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));
  },
};

/**
 * React hook that returns an AbortController ref.
 * The controller is automatically aborted when the component unmounts.
 * Usage:
 *   const abortRef = useAbortController();
 *   api.get('/api/data', { signal: abortRef.current.signal });
 */
export function useAbortRef(): React.MutableRefObject<AbortController> {
  const controllerRef = React.useRef<AbortController>(new AbortController());
  React.useEffect(() => {
    const ctrl = controllerRef.current;
    return () => { ctrl.abort('unmounted'); };
  }, []);
  return controllerRef;
}
