import type { SyncEntity, UserId } from '@openread/sync';
import type { SyncMutation, SyncMutationStatus } from '@openread/sync/protocol';
import { validateSyncMutation, type ValidationIssue } from '@openread/sync/validation';

const DEFAULT_DATABASE_NAME = 'openread-canonical-sync';
const MUTATION_STORE_NAME = 'mutations';
const DEFAULT_BATCH_LIMIT = 50;
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_RETRY_BACKOFF_MS = 1_000;
const DEFAULT_CLAIM_LEASE_DURATION_MS = 30_000;

type Clock = () => number;

export type StoredSyncMutation<E extends SyncEntity = SyncEntity> = SyncMutation<E> & {
  status: SyncMutationStatus;
  retryCount: number;
  createdAt: number;
  updatedAt: number;
  nextAttemptAt: number;
  leaseOwner?: string | null;
  leaseExpiresAt?: number | null;
  lastError?: string | null;
};

export interface PendingMutationOptions {
  userId: UserId;
  limit?: number;
  now?: number;
}

export interface ClaimPendingOptions extends PendingMutationOptions {
  leaseOwner?: string;
  leaseDurationMs?: number;
}

interface StorageClaimPendingOptions {
  userId: UserId;
  limit: number;
  now: number;
  leaseOwner: string;
  leaseExpiresAt: number;
}

interface StorageClaimCompletionOptions {
  ids: string[];
  leaseOwner: string;
  now: number;
}

interface StorageClaimUpdateOptions extends StorageClaimCompletionOptions {
  update: (record: StoredSyncMutation, now: number) => StoredSyncMutation;
}

export interface FailureOptions {
  maxRetries?: number;
  retryBackoffMs?: number;
}

export interface SyncOutboxStorage {
  putMany(records: StoredSyncMutation[]): Promise<void>;
  getAll(): Promise<StoredSyncMutation[]>;
  claimPending(options: StorageClaimPendingOptions): Promise<StoredSyncMutation[]>;
  deleteClaimed(options: StorageClaimCompletionOptions): Promise<string[]>;
  updateClaimed(options: StorageClaimUpdateOptions): Promise<StoredSyncMutation[]>;
  deleteMany(ids: string[]): Promise<void>;
  clear(): Promise<void>;
}

export class SyncOutboxValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super(
      `Invalid sync mutation: ${issues.map((issue) => `${issue.path} ${issue.message}`).join('; ')}`,
    );
    this.name = 'SyncOutboxValidationError';
    this.issues = issues;
  }
}

const clone = <T>(value: T): T => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });

const transactionDone = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });

const isClaimable = (record: StoredSyncMutation, options: StorageClaimPendingOptions): boolean => {
  if (record.userId !== options.userId) return false;
  if (record.status === 'pending') return record.nextAttemptAt <= options.now;
  if (record.status === 'pushing') return (record.leaseExpiresAt ?? 0) <= options.now;
  return false;
};

const isActiveClaimOwner = (
  record: StoredSyncMutation,
  options: StorageClaimCompletionOptions,
): boolean =>
  record.status === 'pushing' &&
  record.leaseOwner === options.leaseOwner &&
  (record.leaseExpiresAt ?? 0) > options.now;

const claimRecords = (
  records: StoredSyncMutation[],
  options: StorageClaimPendingOptions,
): StoredSyncMutation[] =>
  records
    .filter((record) => isClaimable(record, options))
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, options.limit)
    .map((record) => ({
      ...record,
      status: 'pushing',
      updatedAt: options.now,
      leaseOwner: options.leaseOwner,
      leaseExpiresAt: options.leaseExpiresAt,
    }));

export class IndexedDBSyncOutboxStorage implements SyncOutboxStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly databaseName = DEFAULT_DATABASE_NAME) {}

  async putMany(records: StoredSyncMutation[]): Promise<void> {
    if (records.length === 0) return;
    const db = await this.openDatabase();
    const transaction = db.transaction(MUTATION_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(MUTATION_STORE_NAME);
    for (const record of records) {
      store.put(clone(record));
    }
    await transactionDone(transaction);
  }

  async getAll(): Promise<StoredSyncMutation[]> {
    const db = await this.openDatabase();
    const transaction = db.transaction(MUTATION_STORE_NAME, 'readonly');
    const store = transaction.objectStore(MUTATION_STORE_NAME);
    const records = await requestToPromise<StoredSyncMutation[]>(store.getAll());
    await transactionDone(transaction);
    return records.map((record) => clone(record));
  }

  async claimPending(options: StorageClaimPendingOptions): Promise<StoredSyncMutation[]> {
    const db = await this.openDatabase();
    const transaction = db.transaction(MUTATION_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(MUTATION_STORE_NAME);
    const records = await requestToPromise<StoredSyncMutation[]>(store.getAll());
    const claimed = claimRecords(records, options);
    for (const record of claimed) {
      store.put(clone(record));
    }
    await transactionDone(transaction);
    return claimed.map((record) => clone(record));
  }

  async deleteClaimed(options: StorageClaimCompletionOptions): Promise<string[]> {
    if (options.ids.length === 0) return [];
    const db = await this.openDatabase();
    const transaction = db.transaction(MUTATION_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(MUTATION_STORE_NAME);
    const idSet = new Set(options.ids);
    const records = await requestToPromise<StoredSyncMutation[]>(store.getAll());
    const deletedIds = records
      .filter((record) => idSet.has(record.id) && isActiveClaimOwner(record, options))
      .map((record) => record.id);
    for (const id of deletedIds) {
      store.delete(id);
    }
    await transactionDone(transaction);
    return deletedIds;
  }

  async updateClaimed(options: StorageClaimUpdateOptions): Promise<StoredSyncMutation[]> {
    if (options.ids.length === 0) return [];
    const db = await this.openDatabase();
    const transaction = db.transaction(MUTATION_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(MUTATION_STORE_NAME);
    const idSet = new Set(options.ids);
    const records = await requestToPromise<StoredSyncMutation[]>(store.getAll());
    const updated = records
      .filter((record) => idSet.has(record.id) && isActiveClaimOwner(record, options))
      .map((record) => options.update(record, options.now));
    for (const record of updated) {
      store.put(clone(record));
    }
    await transactionDone(transaction);
    return updated.map((record) => clone(record));
  }

  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const db = await this.openDatabase();
    const transaction = db.transaction(MUTATION_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(MUTATION_STORE_NAME);
    for (const id of ids) {
      store.delete(id);
    }
    await transactionDone(transaction);
  }

  async clear(): Promise<void> {
    const db = await this.openDatabase();
    const transaction = db.transaction(MUTATION_STORE_NAME, 'readwrite');
    transaction.objectStore(MUTATION_STORE_NAME).clear();
    await transactionDone(transaction);
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(new Error('IndexedDB is not available in this runtime'));
    }
    this.dbPromise ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        const store = db.objectStoreNames.contains(MUTATION_STORE_NAME)
          ? request.transaction?.objectStore(MUTATION_STORE_NAME)
          : db.createObjectStore(MUTATION_STORE_NAME, { keyPath: 'id' });
        if (!store) return;
        if (!store.indexNames.contains('by_user')) store.createIndex('by_user', 'userId');
        if (!store.indexNames.contains('by_status')) store.createIndex('by_status', 'status');
        if (!store.indexNames.contains('by_user_status_createdAt')) {
          store.createIndex('by_user_status_createdAt', ['userId', 'status', 'createdAt']);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error('Failed to open sync outbox IndexedDB'));
    });
    return this.dbPromise;
  }
}

export class MemorySyncOutboxStorage implements SyncOutboxStorage {
  constructor(private readonly records = new Map<string, StoredSyncMutation>()) {}

  async putMany(records: StoredSyncMutation[]): Promise<void> {
    for (const record of records) {
      this.records.set(record.id, clone(record));
    }
  }

  async getAll(): Promise<StoredSyncMutation[]> {
    return Array.from(this.records.values(), (record) => clone(record));
  }

  async claimPending(options: StorageClaimPendingOptions): Promise<StoredSyncMutation[]> {
    const claimed = claimRecords(Array.from(this.records.values()), options);
    for (const record of claimed) {
      this.records.set(record.id, clone(record));
    }
    return claimed.map((record) => clone(record));
  }

  async deleteClaimed(options: StorageClaimCompletionOptions): Promise<string[]> {
    const deletedIds: string[] = [];
    for (const id of new Set(options.ids)) {
      const record = this.records.get(id);
      if (!record || !isActiveClaimOwner(record, options)) continue;
      this.records.delete(id);
      deletedIds.push(id);
    }
    return deletedIds;
  }

  async updateClaimed(options: StorageClaimUpdateOptions): Promise<StoredSyncMutation[]> {
    const updated: StoredSyncMutation[] = [];
    for (const id of new Set(options.ids)) {
      const record = this.records.get(id);
      if (!record || !isActiveClaimOwner(record, options)) continue;
      const next = options.update(record, options.now);
      this.records.set(id, clone(next));
      updated.push(clone(next));
    }
    return updated;
  }

  async deleteMany(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.records.delete(id);
    }
  }

  async clear(): Promise<void> {
    this.records.clear();
  }
}

export class SyncOutbox {
  constructor(
    private readonly storage: SyncOutboxStorage = new IndexedDBSyncOutboxStorage(),
    private readonly clock: Clock = () => Date.now(),
  ) {}

  async enqueue(mutation: SyncMutation): Promise<StoredSyncMutation> {
    const validation = validateSyncMutation(mutation);
    if (!validation.ok) throw new SyncOutboxValidationError(validation.issues);

    const now = this.clock();
    const record: StoredSyncMutation = {
      ...clone(mutation),
      status: 'pending',
      retryCount: 0,
      lastError: null,
      createdAt: now,
      updatedAt: now,
      nextAttemptAt: now,
      leaseOwner: null,
      leaseExpiresAt: null,
    };
    await this.storage.putMany([record]);
    return clone(record);
  }

  async enqueueBatch(mutations: SyncMutation[]): Promise<StoredSyncMutation[]> {
    if (mutations.length === 0) return [];
    const now = this.clock();
    const records = mutations.map((mutation) => {
      const validation = validateSyncMutation(mutation);
      if (!validation.ok) throw new SyncOutboxValidationError(validation.issues);
      return {
        ...clone(mutation),
        status: 'pending' as const,
        retryCount: 0,
        lastError: null,
        createdAt: now,
        updatedAt: now,
        nextAttemptAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
      } satisfies StoredSyncMutation;
    });
    await this.storage.putMany(records);
    return records.map((record) => clone(record));
  }

  async claimPending(options: ClaimPendingOptions): Promise<StoredSyncMutation[]> {
    const now = options.now ?? this.clock();
    const limit = options.limit ?? DEFAULT_BATCH_LIMIT;
    const leaseDurationMs = options.leaseDurationMs ?? DEFAULT_CLAIM_LEASE_DURATION_MS;
    return this.storage.claimPending({
      userId: options.userId,
      limit,
      now,
      leaseOwner: options.leaseOwner ?? `sync-engine-${now}`,
      leaseExpiresAt: now + leaseDurationMs,
    });
  }

  async getPending(options: PendingMutationOptions): Promise<StoredSyncMutation[]> {
    const now = options.now ?? this.clock();
    const limit = options.limit ?? DEFAULT_BATCH_LIMIT;
    const records = await this.storage.getAll();
    return records
      .filter(
        (record) =>
          record.userId === options.userId &&
          record.status === 'pending' &&
          record.nextAttemptAt <= now,
      )
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, limit);
  }

  async acknowledgeClaimed(ids: string[], leaseOwner: string): Promise<string[]> {
    return this.storage.deleteClaimed({ ids, leaseOwner, now: this.clock() });
  }

  async recordClaimFailure(
    ids: string[],
    leaseOwner: string,
    error: string,
    options: FailureOptions = {},
  ): Promise<StoredSyncMutation[]> {
    const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    const retryBackoffMs = options.retryBackoffMs ?? DEFAULT_RETRY_BACKOFF_MS;
    return this.storage.updateClaimed({
      ids,
      leaseOwner,
      now: this.clock(),
      update: (record, now) => {
        const retryCount = record.retryCount + 1;
        const exhausted = retryCount >= maxRetries;
        return {
          ...record,
          status: exhausted ? 'failed' : 'pending',
          retryCount,
          updatedAt: now,
          nextAttemptAt: exhausted
            ? record.nextAttemptAt
            : now + retryBackoffMs * 2 ** (retryCount - 1),
          leaseOwner: null,
          leaseExpiresAt: null,
          lastError: error,
        };
      },
    });
  }

  async markClaimFailed(
    ids: string[],
    leaseOwner: string,
    error: string,
  ): Promise<StoredSyncMutation[]> {
    return this.storage.updateClaimed({
      ids,
      leaseOwner,
      now: this.clock(),
      update: (record, now) => ({
        ...record,
        status: 'failed',
        updatedAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: error,
      }),
    });
  }

  async getAll(userId?: UserId): Promise<StoredSyncMutation[]> {
    const records = await this.storage.getAll();
    return userId ? records.filter((record) => record.userId === userId) : records;
  }

  async pendingCount(userId: UserId): Promise<number> {
    return (await this.getPending({ userId, limit: Number.MAX_SAFE_INTEGER })).length;
  }

  async clear(userId?: UserId): Promise<void> {
    if (!userId) {
      await this.storage.clear();
      return;
    }
    const records = await this.storage.getAll();
    await this.storage.deleteMany(
      records.filter((record) => record.userId === userId).map((record) => record.id),
    );
  }
}

export const syncOutbox = new SyncOutbox();
