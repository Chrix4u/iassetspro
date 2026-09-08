// ============================================================================
// CORE OFFLINE SYNC COORDINATOR — cross-tab replay ownership + notifications
//
// The durable field queue is shared by every tab. A hook-level ref only stops
// duplicate replay within one React tree, so cross-tab sync needs a browser-wide
// owner. IndexedDB read/write transactions serialize lease claims across tabs.
// BroadcastChannel is used only for low-latency status/queue notifications; it
// is not trusted as the ownership primitive.
// ============================================================================

const COORDINATION_DB_NAME = 'iassetspro_offline_coordination';
const COORDINATION_DB_VERSION = 1;
const LEASE_STORE = 'leases';
const SYNC_LEASE_KEY = 'offline-sync';
const CHANNEL_NAME = 'iassetspro-offline-sync';
const TAB_ID_KEY = 'iassetspro_offline_sync_tab_id';
const DEFAULT_LEASE_MS = 90_000;

export type OfflineSyncMessageType = 'queue-changed' | 'sync-started' | 'sync-completed';

export interface OfflineSyncMessage {
  type: OfflineSyncMessageType;
  sourceId: string;
  at: string;
}

interface SyncLeaseRecord {
  id: string;
  holderId: string;
  expiresAt: number;
  updatedAt: string;
}

let databasePromise: Promise<IDBDatabase> | null = null;
let channel: BroadcastChannel | null | undefined;
let inMemoryTabId: string | null = null;

function canUseIndexedDb(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function makeRandomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getOfflineSyncTabId(): string {
  if (inMemoryTabId) return inMemoryTabId;

  if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
    const existing = sessionStorage.getItem(TAB_ID_KEY)?.trim();
    if (existing) {
      inMemoryTabId = existing;
      return existing;
    }

    const created = makeRandomId();
    try {
      sessionStorage.setItem(TAB_ID_KEY, created);
    } catch {
      // Some privacy modes can reject sessionStorage; memory identity is still
      // sufficient for the lifetime of this document.
    }
    inMemoryTabId = created;
    return created;
  }

  inMemoryTabId = makeRandomId();
  return inMemoryTabId;
}

function getChannel(): BroadcastChannel | null {
  if (channel !== undefined) return channel;
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    channel = null;
    return null;
  }
  channel = new BroadcastChannel(CHANNEL_NAME);
  return channel;
}

export function broadcastOfflineSyncMessage(type: OfflineSyncMessageType): void {
  const message: OfflineSyncMessage = {
    type,
    sourceId: getOfflineSyncTabId(),
    at: new Date().toISOString(),
  };
  try {
    getChannel()?.postMessage(message);
  } catch {
    // BroadcastChannel is an optimization. Queue durability and lease ownership
    // must continue to work even if the channel is unavailable or closed.
  }
}

export function subscribeOfflineSyncMessages(
  listener: (message: OfflineSyncMessage) => void,
): () => void {
  const activeChannel = getChannel();
  if (!activeChannel) return () => undefined;

  const handler = (event: MessageEvent<OfflineSyncMessage>) => {
    const message = event.data;
    if (!message || typeof message !== 'object') return;
    if (!['queue-changed', 'sync-started', 'sync-completed'].includes(message.type)) return;
    if (message.sourceId === getOfflineSyncTabId()) return;
    listener(message);
  };

  activeChannel.addEventListener('message', handler as EventListener);
  return () => activeChannel.removeEventListener('message', handler as EventListener);
}

async function openCoordinationDatabase(): Promise<IDBDatabase> {
  if (!canUseIndexedDb()) throw new Error('IndexedDB coordination is unavailable');
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(COORDINATION_DB_NAME, COORDINATION_DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(LEASE_STORE)) {
        database.createObjectStore(LEASE_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };

    request.onerror = () => {
      databasePromise = null;
      reject(request.error || new Error('Failed to open offline sync coordination database'));
    };

    request.onblocked = () => {
      databasePromise = null;
      reject(new Error('Offline sync coordination database upgrade is blocked'));
    };
  });

  return databasePromise;
}

function runLeaseMutation(
  holderId: string,
  leaseMs: number,
  mode: 'acquire' | 'renew' | 'release',
): Promise<boolean> {
  return openCoordinationDatabase().then((database) => new Promise<boolean>((resolve, reject) => {
    const transaction = database.transaction(LEASE_STORE, 'readwrite');
    const store = transaction.objectStore(LEASE_STORE);
    const request = store.get(SYNC_LEASE_KEY);
    const now = Date.now();
    let changed = false;

    request.onsuccess = () => {
      const current = request.result as SyncLeaseRecord | undefined;

      if (mode === 'acquire') {
        // Acquisition is deliberately non-reentrant. Two hook/component
        // instances in the same tab share a tab id and must still not replay
        // concurrently. A crashed/reloaded owner is recovered by lease expiry.
        if (!current || current.expiresAt <= now) {
          store.put({
            id: SYNC_LEASE_KEY,
            holderId,
            expiresAt: now + leaseMs,
            updatedAt: new Date(now).toISOString(),
          } satisfies SyncLeaseRecord);
          changed = true;
        }
        return;
      }

      if (!current || current.holderId !== holderId) return;

      if (mode === 'renew') {
        store.put({
          ...current,
          expiresAt: now + leaseMs,
          updatedAt: new Date(now).toISOString(),
        } satisfies SyncLeaseRecord);
        changed = true;
        return;
      }

      store.delete(SYNC_LEASE_KEY);
      changed = true;
    };

    request.onerror = () => reject(request.error || new Error('Failed to inspect offline sync lease'));
    transaction.oncomplete = () => resolve(changed);
    transaction.onerror = () => reject(transaction.error || new Error('Offline sync lease transaction failed'));
    transaction.onabort = () => reject(transaction.error || new Error('Offline sync lease transaction aborted'));
  }));
}

/**
 * Acquire browser-wide replay ownership. If IndexedDB itself is unavailable,
 * fail closed for automatic replay rather than allowing two tabs to race.
 */
export async function acquireOfflineSyncLease(
  holderId = getOfflineSyncTabId(),
  leaseMs = DEFAULT_LEASE_MS,
): Promise<boolean> {
  if (leaseMs <= 0) throw new Error('leaseMs must be greater than zero');
  if (!canUseIndexedDb()) return false;
  return runLeaseMutation(holderId, leaseMs, 'acquire');
}

export async function renewOfflineSyncLease(
  holderId = getOfflineSyncTabId(),
  leaseMs = DEFAULT_LEASE_MS,
): Promise<boolean> {
  if (leaseMs <= 0) throw new Error('leaseMs must be greater than zero');
  if (!canUseIndexedDb()) return false;
  return runLeaseMutation(holderId, leaseMs, 'renew');
}

export async function releaseOfflineSyncLease(
  holderId = getOfflineSyncTabId(),
): Promise<boolean> {
  if (!canUseIndexedDb()) return false;
  return runLeaseMutation(holderId, DEFAULT_LEASE_MS, 'release');
}

/**
 * Report whether any unexpired replay lease exists. Because acquisition is
 * deliberately non-reentrant, a second hook instance in the same tab must also
 * treat the tab's existing lease as busy instead of immediately retrying.
 */
export async function isRemoteOfflineSyncActive(): Promise<boolean> {
  if (!canUseIndexedDb()) return false;
  try {
    const database = await openCoordinationDatabase();
    return await new Promise<boolean>((resolve, reject) => {
      const transaction = database.transaction(LEASE_STORE, 'readonly');
      const request = transaction.objectStore(LEASE_STORE).get(SYNC_LEASE_KEY);
      request.onsuccess = () => {
        const current = request.result as SyncLeaseRecord | undefined;
        resolve(Boolean(current && current.expiresAt > Date.now()));
      };
      request.onerror = () => reject(request.error || new Error('Failed to read offline sync lease'));
    });
  } catch {
    return false;
  }
}

/** Test-only reset for module-level browser resources. */
export async function resetOfflineSyncCoordinatorForTests(): Promise<void> {
  try {
    const database = databasePromise ? await databasePromise : null;
    database?.close();
  } catch {
    // ignore test reset failures
  }
  databasePromise = null;
  try {
    channel?.close();
  } catch {
    // ignore test reset failures
  }
  channel = undefined;
  inMemoryTabId = null;
}
