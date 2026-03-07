/**
 * Sync helper utilities to reduce boilerplate across consumers.
 */

import { offlineQueue, type QueueItem } from './offlineQueue';
import { syncWorker } from './syncWorker';

/**
 * Enqueue a single item and trigger an immediate sync drain.
 * Shorthand for the offlineQueue.enqueue + syncWorker.syncNow pattern.
 */
export function enqueueAndSync(item: Pick<QueueItem, 'type' | 'action' | 'payload'>): void {
  offlineQueue.enqueue(item);
  syncWorker.syncNow();
}

/**
 * Enqueue multiple items in one batch and trigger a single sync drain.
 * Uses enqueueBatch to avoid O(N^2) localStorage thrashing.
 */
export function enqueueBatchAndSync(items: Pick<QueueItem, 'type' | 'action' | 'payload'>[]): void {
  if (items.length === 0) return;
  offlineQueue.enqueueBatch(items);
  syncWorker.syncNow();
}
