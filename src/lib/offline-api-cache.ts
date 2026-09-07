import {
  getOfflineDatabase,
  OFFLINE_API_SNAPSHOT_STORE,
} from '@/lib/offline-queue-storage';

const SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const USER_ID_KEY = 'eam_user_id';
const PLANT_ID_KEY = 'user_plant_id';

export interface OfflineApiSnapshot<TResponse extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  userId: string;
  plantId: string | null;
  endpoint: string;
  cachedAt: string;
  response: TResponse;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
  });
}

function currentActorContext(): { userId: string; plantId: string | null } | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
  const userId = localStorage.getItem(USER_ID_KEY)?.trim();
  if (!userId) return null;
  const rawPlantId = localStorage.getItem(PLANT_ID_KEY)?.trim();
  return { userId, plantId: rawPlantId || null };
}

function makeSnapshotId(userId: string, plantId: string | null, endpoint: string): string {
  return `${encodeURIComponent(userId)}|${encodeURIComponent(plantId || '-') }|${encodeURIComponent(endpoint)}`;
}

/**
 * Only cache field-execution reads that are safe to display as stale snapshots.
 * Lifecycle/readiness/auth endpoints are intentionally excluded.
 */
export function isOfflineSnapshotEndpoint(endpoint: string): boolean {
  const [path, query = ''] = endpoint.split('?', 2);

  if (/^\/api\/work-orders\/[^/]+$/.test(path)) return true;

  if (
    /^\/api\/work-orders\/[^/]+\/(tasks|time-logs|measurements|components|comments|personal-tools|status-history)$/.test(path)
  ) {
    return true;
  }

  if (path === '/api/repairs/downtime') {
    return new URLSearchParams(query).has('workOrderId');
  }

  return false;
}

export async function saveOfflineApiSnapshot<TResponse extends Record<string, unknown>>(
  endpoint: string,
  response: TResponse,
): Promise<boolean> {
  if (!isOfflineSnapshotEndpoint(endpoint)) return false;
  const actor = currentActorContext();
  if (!actor) return false;

  try {
    const database = await getOfflineDatabase();
    const transaction = database.transaction(OFFLINE_API_SNAPSHOT_STORE, 'readwrite');
    const complete = transactionComplete(transaction);
    const snapshot: OfflineApiSnapshot<TResponse> = {
      id: makeSnapshotId(actor.userId, actor.plantId, endpoint),
      userId: actor.userId,
      plantId: actor.plantId,
      endpoint,
      cachedAt: new Date().toISOString(),
      response,
    };
    transaction.objectStore(OFFLINE_API_SNAPSHOT_STORE).put(snapshot);
    await complete;
    return true;
  } catch {
    // Snapshot caching is best-effort. A successful online API response must not
    // be converted into a failure merely because browser cache storage failed.
    return false;
  }
}

export async function loadOfflineApiSnapshot<TResponse extends Record<string, unknown>>(
  endpoint: string,
): Promise<OfflineApiSnapshot<TResponse> | null> {
  if (!isOfflineSnapshotEndpoint(endpoint)) return null;
  const actor = currentActorContext();
  if (!actor) return null;

  try {
    const database = await getOfflineDatabase();
    const transaction = database.transaction(OFFLINE_API_SNAPSHOT_STORE, 'readonly');
    const complete = transactionComplete(transaction);
    const snapshot = await requestResult(
      transaction.objectStore(OFFLINE_API_SNAPSHOT_STORE).get(
        makeSnapshotId(actor.userId, actor.plantId, endpoint),
      ),
    ) as OfflineApiSnapshot<TResponse> | undefined;
    await complete;

    if (!snapshot) return null;
    if (snapshot.userId !== actor.userId || snapshot.plantId !== actor.plantId) return null;

    const cachedAtMs = Date.parse(snapshot.cachedAt);
    if (!Number.isFinite(cachedAtMs) || Date.now() - cachedAtMs > SNAPSHOT_MAX_AGE_MS) {
      return null;
    }

    return snapshot;
  } catch {
    return null;
  }
}
