// ============================================================================
// CORE OFFLINE STORAGE — durable browser persistence for field mutations
// IndexedDB is the primary store. localStorage is retained only as a safe
// fallback for browsers/environments where IndexedDB cannot be initialized and
// as the source for one-time migration of the legacy queue.
// ============================================================================

const DB_NAME = 'iassetspro_offline';
const DB_VERSION = 1;
const QUEUE_STORE = 'sync_records';
export const LEGACY_OFFLINE_QUEUE_KEY = 'iassetspro_offline_queue';

export type OfflineQueueStorageBackend = 'indexeddb' | 'localstorage';

type QueueRecord = { id: string } & Record<string, unknown>;

let databasePromise: Promise<IDBDatabase> | null = null;
let backendPromise: Promise<OfflineQueueStorageBackend> | null = null;

function getLocalStorage(): Storage | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
  return localStorage;
}

function readLegacyQueue<T extends QueueRecord>(): T[] {
  const storage = getLocalStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(LEGACY_OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((record): record is T => Boolean(record && typeof record === 'object' && typeof (record as QueueRecord).id === 'string'))
      : [];
  } catch {
    return [];
  }
}

function writeLegacyQueue<T extends QueueRecord>(records: T[]): void {
  const storage = getLocalStorage();
  if (!storage) throw new Error('Browser storage is unavailable');
  storage.setItem(LEGACY_OFFLINE_QUEUE_KEY, JSON.stringify(records));
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

function canUseIndexedDb(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

async function openDatabase(): Promise<IDBDatabase> {
  if (!canUseIndexedDb()) throw new Error('IndexedDB is unavailable');
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(QUEUE_STORE)) {
        database.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };

    request.onerror = () => {
      databasePromise = null;
      reject(request.error || new Error('Failed to open IndexedDB offline queue'));
    };

    request.onblocked = () => {
      databasePromise = null;
      reject(new Error('IndexedDB offline queue upgrade is blocked'));
    };
  });

  return databasePromise;
}

async function migrateLegacyQueue(database: IDBDatabase): Promise<void> {
  const legacyRecords = readLegacyQueue<QueueRecord>();
  if (legacyRecords.length === 0) return;

  const transaction = database.transaction(QUEUE_STORE, 'readwrite');
  const complete = transactionComplete(transaction);
  const store = transaction.objectStore(QUEUE_STORE);
  const existingKeys = new Set((await requestResult(store.getAllKeys())).map(String));

  for (const record of legacyRecords) {
    // Never overwrite a newer IndexedDB copy with a stale legacy record.
    if (!existingKeys.has(record.id)) store.put(record);
  }

  await complete;
  // Remove the legacy copy only after the IndexedDB transaction commits.
  getLocalStorage()?.removeItem(LEGACY_OFFLINE_QUEUE_KEY);
}

async function resolveBackend(): Promise<OfflineQueueStorageBackend> {
  if (backendPromise) return backendPromise;

  backendPromise = (async () => {
    if (!canUseIndexedDb()) return 'localstorage' as const;
    try {
      const database = await openDatabase();
      await migrateLegacyQueue(database);
      return 'indexeddb' as const;
    } catch {
      // If IndexedDB cannot be initialized, preserve field work in the legacy
      // localStorage queue instead of falsely reporting a successful write.
      return 'localstorage' as const;
    }
  })();

  return backendPromise;
}

async function indexedDbGetAll<T extends QueueRecord>(): Promise<T[]> {
  const database = await openDatabase();
  const transaction = database.transaction(QUEUE_STORE, 'readonly');
  const complete = transactionComplete(transaction);
  const result = await requestResult(transaction.objectStore(QUEUE_STORE).getAll());
  await complete;
  return result as T[];
}

async function indexedDbGet<T extends QueueRecord>(id: string): Promise<T | null> {
  const database = await openDatabase();
  const transaction = database.transaction(QUEUE_STORE, 'readonly');
  const complete = transactionComplete(transaction);
  const result = await requestResult(transaction.objectStore(QUEUE_STORE).get(id));
  await complete;
  return (result as T | undefined) || null;
}

async function indexedDbPut<T extends QueueRecord>(record: T): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(QUEUE_STORE, 'readwrite');
  const complete = transactionComplete(transaction);
  transaction.objectStore(QUEUE_STORE).put(record);
  await complete;
}

async function indexedDbMutate<T extends QueueRecord>(
  id: string,
  mutate: (record: T) => T,
): Promise<T | null> {
  const database = await openDatabase();
  const transaction = database.transaction(QUEUE_STORE, 'readwrite');
  const complete = transactionComplete(transaction);
  const store = transaction.objectStore(QUEUE_STORE);
  const current = await requestResult(store.get(id)) as T | undefined;
  if (!current) {
    await complete;
    return null;
  }
  const updated = mutate(current);
  store.put(updated);
  await complete;
  return updated;
}

async function indexedDbDeleteMany(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const database = await openDatabase();
  const transaction = database.transaction(QUEUE_STORE, 'readwrite');
  const complete = transactionComplete(transaction);
  const store = transaction.objectStore(QUEUE_STORE);
  ids.forEach((id) => store.delete(id));
  await complete;
}

function localMutate<T extends QueueRecord>(id: string, mutate: (record: T) => T): T | null {
  const records = readLegacyQueue<T>();
  const index = records.findIndex((record) => record.id === id);
  if (index < 0) return null;
  records[index] = mutate(records[index]);
  writeLegacyQueue(records);
  return records[index];
}

export class OfflineQueueStorage {
  static async getBackend(): Promise<OfflineQueueStorageBackend> {
    return resolveBackend();
  }

  static async getAll<T extends QueueRecord>(): Promise<T[]> {
    return (await resolveBackend()) === 'indexeddb'
      ? indexedDbGetAll<T>()
      : readLegacyQueue<T>();
  }

  static async get<T extends QueueRecord>(id: string): Promise<T | null> {
    if ((await resolveBackend()) === 'indexeddb') return indexedDbGet<T>(id);
    return readLegacyQueue<T>().find((record) => record.id === id) || null;
  }

  static async put<T extends QueueRecord>(record: T): Promise<void> {
    if ((await resolveBackend()) === 'indexeddb') {
      await indexedDbPut(record);
      return;
    }
    const records = readLegacyQueue<T>();
    const index = records.findIndex((item) => item.id === record.id);
    if (index >= 0) records[index] = record;
    else records.push(record);
    writeLegacyQueue(records);
  }

  static async mutate<T extends QueueRecord>(
    id: string,
    mutate: (record: T) => T,
  ): Promise<T | null> {
    return (await resolveBackend()) === 'indexeddb'
      ? indexedDbMutate<T>(id, mutate)
      : localMutate<T>(id, mutate);
  }

  static async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    if ((await resolveBackend()) === 'indexeddb') {
      await indexedDbDeleteMany(ids);
      return;
    }
    const idSet = new Set(ids);
    writeLegacyQueue(readLegacyQueue<QueueRecord>().filter((record) => !idSet.has(record.id)));
  }

  /** Test-only reset for module-level backend/database state. */
  static async resetForTests(): Promise<void> {
    try {
      const database = databasePromise ? await databasePromise : null;
      database?.close();
    } catch {
      // ignore reset failures
    }
    databasePromise = null;
    backendPromise = null;
  }
}
