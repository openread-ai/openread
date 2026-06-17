import type { SyncMutation } from '@openread/sync';

import type { AIConversation, AIMessage } from '@/services/ai/types';
import { getDeviceId } from '@/services/deviceService';
import type { Book, BookConfig, BookNote } from '@/types/book';
import type { SystemSettings } from '@/types/settings';

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

export async function enqueueBookForSync(book: Book): Promise<void> {
  const context = getSyncMutationContext();
  if (!context) return;
  await enqueueCanonicalSyncMutations([buildBookMutation(book, context)]);
}

export async function enqueueBooksForSync(books: Book[]): Promise<void> {
  const context = getSyncMutationContext();
  if (!context || books.length === 0) return;
  await enqueueCanonicalSyncMutations(books.map((book) => buildBookMutation(book, context)));
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
