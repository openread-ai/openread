/**
 * Sync helper utilities to reduce boilerplate across consumers.
 */

import { getDeviceId } from '@/services/deviceService';

import { buildSyncMutationsFromQueueItems } from './adapters';
import type { QueueItem } from './offlineQueue';
import { syncOutbox } from './outbox';
import { syncWorker } from './syncWorker';

export async function enqueueCanonicalSyncItems(
  items: Pick<QueueItem, 'type' | 'action' | 'payload'>[],
): Promise<void> {
  if (items.length === 0) return;
  const userId = syncWorker.currentUserId;
  if (!userId) return;

  const mutations = buildSyncMutationsFromQueueItems(items, {
    userId,
    deviceId: getDeviceId(),
  });
  await syncOutbox.enqueueBatch(mutations);
  await syncWorker.syncNow();
}

/**
 * Enqueue a single item as a canonical SyncMutation and trigger an immediate sync drain.
 */
export function enqueueAndSync(item: Pick<QueueItem, 'type' | 'action' | 'payload'>): void {
  void enqueueCanonicalSyncItems([item]);
}

/**
 * Enqueue multiple canonical SyncMutations in one batch and trigger a single sync drain.
 */
export function enqueueBatchAndSync(items: Pick<QueueItem, 'type' | 'action' | 'payload'>[]): void {
  void enqueueCanonicalSyncItems(items);
}
