import type {
  SyncMutation,
  SyncPushRequest,
  SyncPushResponse,
  SyncUpsertMutation,
} from '@openread/sync';
import type { SupabaseClient } from '@supabase/supabase-js';

import { SYNC_TIMEOUT_MS, type SyncData, type SyncClient } from '@/libs/sync';
import { getAPIBaseUrl } from '@/services/environment';
import { getAccessToken } from '@/utils/access';
import { fetchWithTimeout, getPlatformFetch } from '@/utils/fetch';
import { createSupabaseClient } from '@/utils/supabase';
import type { SyncTransport } from './engine';

type SupportedLegacyMutation =
  | SyncUpsertMutation<'book'>
  | SyncUpsertMutation<'bookConfig'>
  | SyncUpsertMutation<'bookNote'>
  | SyncUpsertMutation<'settings'>
  | SyncUpsertMutation<'collection'>
  | SyncUpsertMutation<'aiConversation'>
  | SyncUpsertMutation<'aiMessage'>
  | SyncUpsertMutation<'fileMetadata'>;

type DeletedBookCleanup = (bookHash: string) => Promise<void>;

interface LegacyCollectionSnapshot {
  id: string;
  name?: string;
  bookHashes?: string[];
  createdAt?: string | number | null;
  updatedAt?: number | string | null;
  deletedAt?: number | string | null;
  [key: string]: unknown;
}

const isSupportedLegacyMutation = (mutation: SyncMutation): mutation is SupportedLegacyMutation =>
  mutation.op === 'upsert' &&
  (mutation.entity === 'book' ||
    mutation.entity === 'bookConfig' ||
    mutation.entity === 'bookNote' ||
    mutation.entity === 'settings' ||
    mutation.entity === 'collection' ||
    mutation.entity === 'aiConversation' ||
    mutation.entity === 'aiMessage' ||
    mutation.entity === 'fileMetadata');

const toIsoTimestamp = (value: number): string => new Date(value).toISOString();

const toEpochMs = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const collectionClock = (collection: LegacyCollectionSnapshot): number =>
  Math.max(toEpochMs(collection.updatedAt), toEpochMs(collection.deletedAt));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toLegacyCollection = (value: unknown): LegacyCollectionSnapshot | null => {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.length === 0) return null;
  return value as LegacyCollectionSnapshot;
};

const existingCollectionsFromSettings = (
  settings: Record<string, unknown> | null,
): LegacyCollectionSnapshot[] => {
  if (!settings || !Array.isArray(settings._collections)) return [];
  return settings._collections.map(toLegacyCollection).filter((value) => value !== null);
};

const mergeCollectionSnapshots = (
  existing: LegacyCollectionSnapshot[],
  incoming: LegacyCollectionSnapshot[],
): LegacyCollectionSnapshot[] => {
  const merged = new Map<string, LegacyCollectionSnapshot>();
  for (const collection of existing) {
    merged.set(collection.id, collection);
  }
  for (const collection of incoming) {
    const current = merged.get(collection.id);
    if (!current || collectionClock(collection) >= collectionClock(current)) {
      merged.set(collection.id, collection);
    }
  }
  return Array.from(merged.values());
};

const pullLegacySettings = async (
  syncClient: SyncClient,
): Promise<Record<string, unknown> | null> => {
  const result = await syncClient.pullChanges(0, 'settings');
  return result.settings ?? null;
};

const splitUpserts = (
  mutations: SupportedLegacyMutation[],
  existingSettings: Record<string, unknown> | null,
): SyncData => {
  const data: SyncData = {};
  const collections: LegacyCollectionSnapshot[] = [];
  let settingsUpdatedAt = 0;

  for (const mutation of mutations) {
    if (mutation.op !== 'upsert') continue;
    switch (mutation.entity) {
      case 'book':
        data.books ??= [];
        data.books.push(mutation.payload as NonNullable<SyncData['books']>[number]);
        break;
      case 'bookConfig':
        data.configs ??= [];
        data.configs.push(mutation.payload as NonNullable<SyncData['configs']>[number]);
        break;
      case 'bookNote':
        data.notes ??= [];
        data.notes.push(mutation.payload as NonNullable<SyncData['notes']>[number]);
        break;
      case 'settings':
        data.settings = {
          ...(data.settings ?? {}),
          ...mutation.payload.settings,
        };
        settingsUpdatedAt = Math.max(settingsUpdatedAt, mutation.clientUpdatedAt);
        break;
      case 'collection':
        collections.push(mutation.payload as unknown as LegacyCollectionSnapshot);
        settingsUpdatedAt = Math.max(settingsUpdatedAt, mutation.clientUpdatedAt);
        break;
    }
  }

  if (collections.length > 0) {
    const mergedCollections = mergeCollectionSnapshots(
      existingCollectionsFromSettings(existingSettings),
      collections,
    );
    for (const collection of mergedCollections) {
      settingsUpdatedAt = Math.max(settingsUpdatedAt, collectionClock(collection));
    }
    settingsUpdatedAt = Math.max(settingsUpdatedAt, toEpochMs(existingSettings?._updatedAt));
    data.settings = {
      ...(data.settings ?? {}),
      _collections: mergedCollections,
    };
  }
  if (settingsUpdatedAt > 0) {
    data.settings = {
      ...(data.settings ?? {}),
      _updatedAt: toIsoTimestamp(settingsUpdatedAt),
    };
  }

  return data;
};

const hasPushData = (data: SyncData): boolean =>
  Boolean(
    data.books?.length ||
    data.configs?.length ||
    data.notes?.length ||
    Object.keys(data.settings ?? {}).length,
  );

const isDeletedBookMutation = (
  mutation: SupportedLegacyMutation,
): mutation is SyncUpsertMutation<'book'> =>
  mutation.entity === 'book' &&
  typeof mutation.payload.hash === 'string' &&
  typeof mutation.payload.deletedAt === 'number';

export async function cleanupDeletedBookRemote(bookHash: string): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const url = `${getAPIBaseUrl()}/sync?book_hash=${encodeURIComponent(bookHash)}`;
  const response = await fetchWithTimeout(
    url,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    },
    SYNC_TIMEOUT_MS,
  );

  if (!response.ok) {
    const body = await response.text().catch(() => response.statusText);
    throw new Error(`Failed to clean deleted book ${bookHash}: ${body || response.statusText}`);
  }
}

const getAuthenticatedSupabase = async (): Promise<SupabaseClient | null> => {
  const token = await getAccessToken();
  if (!token) return null;
  const customFetch = await getPlatformFetch();
  return createSupabaseClient(token, customFetch);
};

const upsertAIConversations = async (
  supabase: SupabaseClient,
  userId: string,
  conversations: SyncUpsertMutation<'aiConversation'>[],
): Promise<void> => {
  if (conversations.length === 0) return;
  const { error } = await supabase.from('ai_conversations').upsert(
    conversations.map((mutation) => ({
      id: mutation.payload.id,
      user_id: userId,
      book_hash: mutation.payload.bookHash,
      title: mutation.payload.title,
      deleted_at: mutation.payload.deletedAt
        ? new Date(mutation.payload.deletedAt).toISOString()
        : null,
      created_at: new Date(mutation.payload.createdAt ?? mutation.payload.updatedAt).toISOString(),
      updated_at: new Date(mutation.payload.updatedAt).toISOString(),
      // TODO(PR5 schema): add parallel_book_hashes once canonical backend owns AI sync tables.
    })),
  );
  if (error) throw new Error(`Failed to push AI conversations: ${error.message}`);
};

const upsertAIMessages = async (
  supabase: SupabaseClient,
  userId: string,
  messages: SyncUpsertMutation<'aiMessage'>[],
): Promise<void> => {
  if (messages.length === 0) return;
  const { error } = await supabase.from('ai_messages').upsert(
    messages.map((mutation) => ({
      id: mutation.payload.id,
      conversation_id: mutation.payload.conversationId,
      user_id: userId,
      role: mutation.payload.role,
      content: mutation.payload.content,
      created_at: new Date(mutation.payload.createdAt ?? mutation.payload.updatedAt).toISOString(),
    })),
  );
  if (error) throw new Error(`Failed to push AI messages: ${error.message}`);
};

export class LegacySyncTransport implements SyncTransport {
  constructor(
    private readonly syncClient: SyncClient,
    private readonly cleanupDeletedBook: DeletedBookCleanup = cleanupDeletedBookRemote,
  ) {}

  async push(request: SyncPushRequest): Promise<SyncPushResponse> {
    const supported = request.mutations.filter(isSupportedLegacyMutation);
    const supportedIds = new Set(supported.map((mutation) => mutation.id));
    const unsupported = request.mutations.filter((mutation) => !supportedIds.has(mutation.id));
    const hasCollectionMutations = supported.some((mutation) => mutation.entity === 'collection');
    const existingSettings = hasCollectionMutations
      ? await pullLegacySettings(this.syncClient)
      : null;
    const payload = splitUpserts(supported, existingSettings);

    if (hasPushData(payload)) {
      await this.syncClient.pushChanges(payload);
    }

    const aiConversations = supported.filter(
      (mutation): mutation is SyncUpsertMutation<'aiConversation'> =>
        mutation.entity === 'aiConversation',
    );
    const aiMessages = supported.filter(
      (mutation): mutation is SyncUpsertMutation<'aiMessage'> => mutation.entity === 'aiMessage',
    );
    if (aiConversations.length > 0 || aiMessages.length > 0) {
      const supabase = await getAuthenticatedSupabase();
      if (!supabase) throw new Error('Not authenticated');
      await upsertAIConversations(supabase, request.userId, aiConversations);
      await upsertAIMessages(supabase, request.userId, aiMessages);
    }

    const deletedBookHashes = supported
      .filter(isDeletedBookMutation)
      .map((mutation) => mutation.payload.hash);
    await Promise.all(deletedBookHashes.map((bookHash) => this.cleanupDeletedBook(bookHash)));

    // fileMetadata mutations are acknowledged here because legacy storage endpoints already own
    // binary upload/download/delete side effects; PR5 will persist these records in canonical routes.
    const now = Date.now();
    return {
      accepted: supported.map((mutation) => ({
        mutationId: mutation.id,
        entity: mutation.entity,
        entityId: mutation.entityId,
        serverRevision: mutation.baseRevision ?? `${now}`,
        serverUpdatedAt: now,
      })),
      conflicts: unsupported.map((mutation) => ({
        mutationId: mutation.id,
        entity: mutation.entity,
        entityId: mutation.entityId,
        reason: 'validation-failed' as const,
        message:
          'Legacy sync transport only supports book, bookConfig, bookNote, settings, collection, AI, and fileMetadata upserts',
      })),
    };
  }
}

export const createLegacySyncTransport = (syncClient: SyncClient): SyncTransport =>
  new LegacySyncTransport(syncClient);
