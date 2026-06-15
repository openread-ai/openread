/**
 * @module services/sync/offlineQueue
 * P9.22: Persistent offline queue for sync operations.
 *
 * All write operations go into a persistent queue (localStorage).
 * A background sync worker drains the queue when online.
 * Queue survives app restarts and replays on next launch.
 */

export interface QueueItem {
  id: string;
  type: 'book' | 'config' | 'note';
  action: 'upsert' | 'delete';
  payload: Record<string, unknown>;
  createdAt: number;
  retries: number;
  maxRetries: number;
  status: 'pending' | 'failed';
}

const STORAGE_KEY = 'openread_sync_queue';
const DEFAULT_MAX_RETRIES = 5;

const scopedStorageKey = (scopeUserId: string | null): string =>
  scopeUserId ? `${STORAGE_KEY}:${scopeUserId}` : STORAGE_KEY;

/**
 * Read the queue from localStorage.
 */
function readQueue(scopeUserId: string | null): QueueItem[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(scopedStorageKey(scopeUserId));
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error(
      '[OfflineQueue] Corrupt queue data in localStorage, queue reset:',
      err instanceof Error ? err.message : String(err),
    );
    try {
      const key = scopedStorageKey(scopeUserId);
      const corrupt = localStorage.getItem(key);
      if (corrupt) localStorage.setItem(`${key}_corrupt_backup`, corrupt);
    } catch {
      /* best effort backup */
    }
    return [];
  }
}

/**
 * Write the queue to localStorage.
 */
function writeQueue(scopeUserId: string | null, items: QueueItem[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(scopedStorageKey(scopeUserId), JSON.stringify(items));
}

/**
 * Persistent offline queue for sync operations.
 * Items survive app restarts via localStorage.
 */
export class OfflineQueue {
  private scopeUserId: string | null = null;

  setScope(userId: string | null): void {
    this.scopeUserId = userId;
  }

  /**
   * Add an item to the queue.
   */
  enqueue(item: Pick<QueueItem, 'type' | 'action' | 'payload'>): void {
    const queue = readQueue(this.scopeUserId);
    queue.push({
      ...item,
      id: typeof crypto !== 'undefined' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      createdAt: Date.now(),
      retries: 0,
      maxRetries: DEFAULT_MAX_RETRIES,
      status: 'pending',
    });
    writeQueue(this.scopeUserId, queue);
  }

  /**
   * Add multiple items in a single localStorage read/write cycle.
   * Avoids O(N^2) thrashing when enqueueing bulk operations.
   */
  enqueueBatch(items: Pick<QueueItem, 'type' | 'action' | 'payload'>[]): void {
    if (items.length === 0) return;
    const queue = readQueue(this.scopeUserId);
    const now = Date.now();
    for (const item of items) {
      queue.push({
        ...item,
        id: typeof crypto !== 'undefined' ? crypto.randomUUID() : `${now}-${Math.random()}`,
        createdAt: now,
        retries: 0,
        maxRetries: DEFAULT_MAX_RETRIES,
        status: 'pending',
      });
    }
    writeQueue(this.scopeUserId, queue);
  }

  /**
   * Drain pending items from the queue.
   * Calls the provided handler for each item.
   * Items that fail are retried up to maxRetries times. The interval between drain cycles provides implicit spacing.
   *
   * @param handler - Async function to process each item. Return true on success.
   * @returns Summary of drain operation.
   */
  async drain(
    handler: (item: QueueItem) => Promise<boolean>,
  ): Promise<{ synced: number; failed: number; remaining: number }> {
    const queue = readQueue(this.scopeUserId);
    const pending = queue.filter((item) => item.status === 'pending');

    if (pending.length === 0) {
      return { synced: 0, failed: 0, remaining: 0 };
    }

    let synced = 0;
    let failed = 0;
    const remaining: QueueItem[] = [];
    const alreadyFailed = queue.filter((item) => item.status === 'failed');

    for (const item of pending) {
      try {
        const success = await handler(item);
        if (success) {
          synced++;
          // Item successfully processed — don't keep it
        } else {
          item.retries++;
          if (item.retries >= item.maxRetries) {
            item.status = 'failed';
            failed++;
          }
          remaining.push(item);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(
          `[OfflineQueue] Failed to process item ${item.id} (type: ${item.type}, attempt ${item.retries + 1}):`,
          errorMsg,
        );
        item.retries++;
        if (item.retries >= item.maxRetries) {
          item.status = 'failed';
          console.error(
            `[OfflineQueue] Item ${item.id} permanently failed after ${item.maxRetries} retries`,
          );
          failed++;
        }
        remaining.push(item);
      }
    }

    writeQueue(this.scopeUserId, [...remaining, ...alreadyFailed]);

    return { synced, failed, remaining: remaining.length + alreadyFailed.length };
  }

  /**
   * Get all pending items (not yet failed).
   */
  getPending(): QueueItem[] {
    return readQueue(this.scopeUserId).filter((item) => item.status === 'pending');
  }

  /**
   * Get all items (pending + failed).
   */
  getAll(): QueueItem[] {
    return readQueue(this.scopeUserId);
  }

  /**
   * Get the count of pending items.
   */
  get pendingCount(): number {
    return this.getPending().length;
  }

  /**
   * Clear all items from the queue.
   */
  clear(): void {
    writeQueue(this.scopeUserId, []);
  }

  /**
   * Clear only failed items (allow retry or discard).
   */
  clearFailed(): void {
    const queue = readQueue(this.scopeUserId).filter((item) => item.status !== 'failed');
    writeQueue(this.scopeUserId, queue);
  }
}

/** Singleton instance */
export const offlineQueue = new OfflineQueue();
