import type { SyncMutation } from '@openread/sync';

import type { AIConversation, AIMessage } from '@/services/ai/types';
import { getDeviceId } from '@/services/deviceService';
import type { Book, BookConfig, BookNote } from '@/types/book';
import type { SystemSettings } from '@/types/settings';
import { createLogger } from '@/utils/logger';

import {
  buildAIConversationMutation,
  buildAIMessageMutation,
  buildBookConfigMutation,
  buildBookMutation,
  buildBookNoteMutation,
  buildCollectionMutations,
  buildFileMetadataMutationsFromBook,
  buildSettingsMutation,
  type CollectionSyncInput,
  type SyncMutationContext,
} from './adapters';
import { SyncMutationDeliveryError, type SyncMutationDeliveryResult } from './engine';
import { syncOutbox } from './outbox';
import { syncWorker } from './syncWorker';

const logger = createLogger('sync-helpers');

export interface FireAndForgetSyncEnqueueContext {
  source: string;
  mutationType?: string;
  operation?: string;
  hasBookHash?: boolean;
  hasMetaHash?: boolean;
  count?: number;
}

export function handleFireAndForgetSyncEnqueue<T>(
  enqueuePromise: Promise<T>,
  context: FireAndForgetSyncEnqueueContext,
): void {
  void enqueuePromise.catch((error) => {
    logger.warn('Fire-and-forget sync enqueue failed', { ...context, error });
  });
}

export class SyncMutationContextUnavailableError extends Error {
  constructor() {
    super('Cannot queue deletion without an authenticated sync user');
    this.name = 'SyncMutationContextUnavailableError';
  }
}

export function requireSyncMutationUserId(expectedUserId?: string): string {
  const userId = syncWorker.currentUserId;
  if (!userId || (expectedUserId && userId !== expectedUserId)) {
    throw new SyncMutationContextUnavailableError();
  }
  return userId;
}

function getSyncMutationContext(
  required = false,
  expectedUserId?: string,
): SyncMutationContext | null {
  const userId = syncWorker.currentUserId;
  if (!userId) {
    if (required || expectedUserId) throw new SyncMutationContextUnavailableError();
    return null;
  }
  if (expectedUserId && userId !== expectedUserId) {
    throw new SyncMutationContextUnavailableError();
  }
  return { userId, deviceId: getDeviceId() };
}

const isDeletion = (book: Book): boolean =>
  typeof book.deletedAt === 'number' && book.deletedAt > 0;

export async function enqueueCanonicalSyncMutations(
  mutations: SyncMutation[],
): Promise<SyncMutationDeliveryResult | undefined> {
  if (mutations.length === 0) return;
  const expectedUserId = mutations[0]!.userId;
  const records = await syncOutbox.enqueueBatch(mutations);
  try {
    return await syncWorker.syncNow(records, expectedUserId);
  } catch (error) {
    if (error instanceof SyncMutationDeliveryError) throw error;
    throw new SyncMutationDeliveryError(
      [],
      records.map((record) => record.id),
    );
  }
}

export async function enqueueBookForSync(
  book: Book,
  expectedUserId?: string,
): Promise<SyncMutationDeliveryResult | undefined> {
  const context = getSyncMutationContext(isDeletion(book), expectedUserId);
  if (!context) return;
  return enqueueCanonicalSyncMutations([buildBookMutation(book, context)]);
}

export async function enqueueBooksForSync(
  books: Book[],
  expectedUserId?: string,
): Promise<SyncMutationDeliveryResult | undefined> {
  if (books.length === 0) return;
  const context = getSyncMutationContext(books.some(isDeletion), expectedUserId);
  if (!context) return;
  return enqueueCanonicalSyncMutations(books.map((book) => buildBookMutation(book, context)));
}

export async function enqueueBookConfigForSync(config: BookConfig): Promise<void> {
  const context = getSyncMutationContext();
  if (!context) return;
  await enqueueCanonicalSyncMutations([buildBookConfigMutation(config, context)]);
}

export async function enqueueBookConfigsForSync(configs: BookConfig[]): Promise<void> {
  const context = getSyncMutationContext();
  if (!context || configs.length === 0) return;
  await enqueueCanonicalSyncMutations(
    configs.map((config) => buildBookConfigMutation(config, context)),
  );
}

export async function enqueueBookNoteForSync(note: BookNote): Promise<void> {
  const context = getSyncMutationContext();
  if (!context) return;
  await enqueueCanonicalSyncMutations([buildBookNoteMutation(note, context)]);
}

export async function enqueueBookNotesForSync(notes: BookNote[]): Promise<void> {
  const context = getSyncMutationContext();
  if (!context || notes.length === 0) return;
  await enqueueCanonicalSyncMutations(notes.map((note) => buildBookNoteMutation(note, context)));
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
