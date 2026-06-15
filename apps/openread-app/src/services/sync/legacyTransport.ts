import type {
  SyncMutation,
  SyncPushRequest,
  SyncPushResponse,
  SyncUpsertMutation,
} from '@openread/sync';

import { SYNC_TIMEOUT_MS, type SyncData, type SyncClient } from '@/libs/sync';
import { getAPIBaseUrl } from '@/services/environment';
import { getAccessToken } from '@/utils/access';
import { fetchWithTimeout } from '@/utils/fetch';
import type { SyncTransport } from './engine';

type SupportedLegacyMutation =
  | SyncUpsertMutation<'book'>
  | SyncUpsertMutation<'bookConfig'>
  | SyncUpsertMutation<'bookNote'>;

type DeletedBookCleanup = (bookHash: string) => Promise<void>;

const isSupportedLegacyMutation = (mutation: SyncMutation): mutation is SupportedLegacyMutation =>
  mutation.op === 'upsert' &&
  (mutation.entity === 'book' ||
    mutation.entity === 'bookConfig' ||
    mutation.entity === 'bookNote');

const splitUpserts = (mutations: SupportedLegacyMutation[]): SyncData => {
  const data: SyncData = {};

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
    }
  }

  return data;
};

const hasPushData = (data: SyncData): boolean =>
  Boolean(data.books?.length || data.configs?.length || data.notes?.length);

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

export class LegacySyncTransport implements SyncTransport {
  constructor(
    private readonly syncClient: SyncClient,
    private readonly cleanupDeletedBook: DeletedBookCleanup = cleanupDeletedBookRemote,
  ) {}

  async push(request: SyncPushRequest): Promise<SyncPushResponse> {
    const supported = request.mutations.filter(isSupportedLegacyMutation);
    const supportedIds = new Set(supported.map((mutation) => mutation.id));
    const unsupported = request.mutations.filter((mutation) => !supportedIds.has(mutation.id));
    const payload = splitUpserts(supported);

    if (hasPushData(payload)) {
      await this.syncClient.pushChanges(payload);
    }

    const deletedBookHashes = supported
      .filter(isDeletedBookMutation)
      .map((mutation) => mutation.payload.hash);
    await Promise.all(deletedBookHashes.map((bookHash) => this.cleanupDeletedBook(bookHash)));

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
        message: 'Legacy sync transport only supports book, bookConfig, and bookNote upserts',
      })),
    };
  }
}

export const createLegacySyncTransport = (syncClient: SyncClient): SyncTransport =>
  new LegacySyncTransport(syncClient);
