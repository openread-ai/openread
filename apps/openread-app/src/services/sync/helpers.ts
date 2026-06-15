/**
 * Sync helper utilities to reduce boilerplate across consumers.
 */

import type { SyncMutation } from '@openread/sync';

import type { AIConversation, AIMessage } from '@/services/ai/types';
import { getDeviceId } from '@/services/deviceService';
import type { Book } from '@/types/book';
import type { SystemSettings } from '@/types/settings';

import {
  buildAIConversationMutation,
  buildAIMessageMutation,
  buildCollectionMutations,
  buildFileMetadataMutationsFromBook,
  buildSettingsMutation,
  buildSyncMutationsFromQueueItems,
  type CollectionSyncInput,
  type SyncMutationContext,
} from './adapters';
import type { QueueItem } from './offlineQueue';
import { syncOutbox } from './outbox';
import { syncWorker } from './syncWorker';

function getSyncMutationContext(): SyncMutationContext | null {
  const userId = syncWorker.currentUserId;
  if (!userId) return null;
  return { userId, deviceId: getDeviceId() };
}

export async function enqueueCanonicalSyncMutations(mutations: SyncMutation[]): Promise<void> {
  if (mutations.length === 0) return;
  await syncOutbox.enqueueBatch(mutations);
  await syncWorker.syncNow();
}

export async function enqueueCanonicalSyncItems(
  items: Pick<QueueItem, 'type' | 'action' | 'payload'>[],
): Promise<void> {
  if (items.length === 0) return;
  const context = getSyncMutationContext();
  if (!context) return;

  const mutations = buildSyncMutationsFromQueueItems(items, context);
  await enqueueCanonicalSyncMutations(mutations);
}

export async function enqueueSettingsForSync(settings: SystemSettings): Promise<void> {
  const context = getSyncMutationContext();
  if (!context) return;
  await enqueueCanonicalSyncMutations([buildSettingsMutation(settings, context)]);
}

export async function enqueueCollectionsForSync(collections: CollectionSyncInput[]): Promise<void> {
  const context = getSyncMutationContext();
  if (!context) return;
  await enqueueCanonicalSyncMutations(buildCollectionMutations(collections, context));
}

export async function enqueueAIConversationForSync(conversation: AIConversation): Promise<void> {
  const context = getSyncMutationContext();
  if (!context) return;
  await enqueueCanonicalSyncMutations([buildAIConversationMutation(conversation, context)]);
}

export async function enqueueAIMessageForSync(message: AIMessage): Promise<void> {
  const context = getSyncMutationContext();
  if (!context) return;
  await enqueueCanonicalSyncMutations([buildAIMessageMutation(message, context)]);
}

export async function enqueueFileMetadataForBookUpload(book: Book): Promise<void> {
  const context = getSyncMutationContext();
  if (!context) return;
  await enqueueCanonicalSyncMutations(buildFileMetadataMutationsFromBook(book, context));
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
