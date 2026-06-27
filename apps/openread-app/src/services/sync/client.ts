import { jwtDecode } from 'jwt-decode';
import type {
  SyncEntity,
  SyncPayloadByEntity,
  SyncPullResponse,
  SyncReconcileResponse,
  SyncServerRecord,
  SyncTombstone,
} from '@openread/sync';
import { SYNC_PROTOCOL_VERSION } from '@openread/sync';

import { getNodeBaseUrl } from '@/services/environment';
import { getDeviceId } from '@/services/deviceService';
import type { AIConversation, AIMessage } from '@/services/ai/types';
import { getAccessToken } from '@/utils/access';
import { fetchWithTimeout } from '@/utils/fetch';
import type { Book, BookConfig, BookDataRecord, BookNote } from '@/types/book';

const syncEndpoint = (path: 'pull' | 'reconcile') => `${getNodeBaseUrl()}/api/sync/${path}`;

/** Timeout for canonical sync HTTP requests. */
export const SYNC_TIMEOUT_MS = 60_000;

export type SyncType = 'books' | 'configs' | 'notes' | 'settings' | 'ai';
export type SyncOp = 'push' | 'pull' | 'both';

interface BookRecord extends BookDataRecord, Book {
  id: string;
}
interface BookConfigRecord extends BookDataRecord, BookConfig {}
interface BookNoteRecord extends BookDataRecord, BookNote {}

export interface CollectionRecord {
  id: string;
  name: string;
  bookHashes: string[];
  parentId?: string | null;
  sortOrder?: number | null;
  createdAt?: string | number | null;
  updatedAt?: number;
  deletedAt?: number | null;
}

export interface SyncResult {
  books: BookRecord[] | null;
  notes: BookNoteRecord[] | null;
  configs: BookConfigRecord[] | null;
  settings?: Record<string, unknown> | null;
  settingsUpdatedAt?: number | null;
  collections?: CollectionRecord[] | null;
  aiConversations?: AIConversation[] | null;
  aiMessages?: AIMessage[] | null;
  tombstones?: SyncTombstone[] | null;
  cursorByEntity?: Partial<Record<SyncEntity, string>>;
  reconcile?: {
    upsert: BookRecord[];
    remove: string[];
  };
}

export type SyncRecord = BookRecord & BookConfigRecord & BookNoteRecord;

type TokenClaims = { sub?: string };
type EntityRecord = SyncServerRecord<SyncEntity>;

const iso = (value: number | null | undefined): string | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? new Date(value).toISOString()
    : null;

const revisionFromTimestamp = (value: number): string => {
  if (Number.isFinite(value) && value > 0) return new Date(value).toISOString();
  return String(value);
};

const responseError = async (response: Response, fallback: string): Promise<Error> => {
  if (response.status === 426) {
    let message = 'Please update OpenRead to continue syncing.';
    try {
      const error = await response.json();
      if (typeof error.message === 'string') message = error.message;
    } catch (err) {
      console.warn('[sync] Failed to handle 426 response:', err);
    }
    return new Error(message);
  }

  let detail = response.statusText;
  try {
    const error = await response.json();
    detail = error.error || error.message || response.statusText;
  } catch {
    detail = response.statusText;
  }
  return new Error(`${fallback}: ${detail}`);
};

const authEnvelope = async (): Promise<{ token: string; userId: string; deviceId: string }> => {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');
  const userId = jwtDecode<TokenClaims>(token).sub;
  if (!userId) throw new Error('Not authenticated');
  return { token, userId, deviceId: getDeviceId() };
};

const postSync = async <T>(
  path: 'pull' | 'reconcile',
  token: string,
  body: Record<string, unknown>,
  errorPrefix: string,
): Promise<T> => {
  const response = await fetchWithTimeout(
    syncEndpoint(path),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Sync-Protocol': String(SYNC_PROTOCOL_VERSION),
      },
      body: JSON.stringify(body),
    },
    SYNC_TIMEOUT_MS,
  );

  if (!response.ok) throw await responseError(response, errorPrefix);
  return response.json() as Promise<T>;
};

const entitiesForType = (type?: SyncType): SyncEntity[] => {
  switch (type) {
    case 'books':
      return ['book'];
    case 'configs':
      return ['bookConfig'];
    case 'notes':
      return ['bookNote'];
    case 'settings':
      return ['settings', 'collection'];
    case 'ai':
      return ['aiConversation', 'aiMessage'];
    default:
      return ['book', 'bookConfig', 'bookNote'];
  }
};

const dbBookFromRecord = (record: SyncServerRecord<'book'>): BookRecord => {
  const payload = record.payload as SyncPayloadByEntity['book'];
  return {
    id: payload.hash,
    user_id: '',
    book_hash: payload.hash,
    hash: payload.hash,
    meta_hash: payload.metaHash ?? null,
    metaHash: payload.metaHash ?? null,
    format: payload.format ?? 'epub',
    title: payload.title,
    author: payload.author ?? null,
    group_id: payload.groupId ?? null,
    groupId: payload.groupId ?? null,
    group_name: payload.groupName ?? null,
    groupName: payload.groupName ?? null,
    tags: payload.tags ?? null,
    progress: payload.progress,
    reading_status: payload.readingStatus ?? null,
    readingStatus: payload.readingStatus ?? null,
    source_title: payload.sourceTitle ?? null,
    sourceTitle: payload.sourceTitle ?? null,
    metadata: payload.metadata ?? null,
    storage_path: payload.storagePath ?? null,
    storagePath: payload.storagePath ?? null,
    catalog_book_id: payload.catalogBookId ?? null,
    catalogBookId: payload.catalogBookId ?? null,
    created_at: iso(payload.createdAt) ?? iso(record.serverUpdatedAt)!,
    createdAt: payload.createdAt ?? record.serverUpdatedAt,
    updated_at: payload.updatedAt ?? record.serverUpdatedAt,
    updatedAt: payload.updatedAt ?? record.serverUpdatedAt,
    deleted_at: payload.deletedAt ?? null,
    deletedAt: payload.deletedAt ?? null,
    uploaded_at: iso(payload.uploadedAt),
    uploadedAt: payload.uploadedAt ?? null,
  } as unknown as BookRecord;
};

const dbConfigFromRecord = (record: SyncServerRecord<'bookConfig'>): BookConfigRecord => {
  const payload = record.payload as SyncPayloadByEntity['bookConfig'];
  return {
    user_id: '',
    book_hash: payload.bookHash,
    bookHash: payload.bookHash,
    meta_hash: payload.metaHash ?? null,
    metaHash: payload.metaHash ?? null,
    location: payload.location ?? null,
    xpointer: payload.xpointer ?? null,
    progress: payload.progress,
    search_config: payload.searchConfig ?? null,
    searchConfig: payload.searchConfig ?? undefined,
    view_settings: payload.viewSettings ?? null,
    viewSettings: payload.viewSettings ?? undefined,
    updated_at: payload.updatedAt ?? record.serverUpdatedAt,
    updatedAt: payload.updatedAt ?? record.serverUpdatedAt,
    deleted_at: payload.deletedAt ?? null,
    deletedAt: payload.deletedAt ?? null,
  } as unknown as BookConfigRecord;
};

const dbNoteFromRecord = (record: SyncServerRecord<'bookNote'>): BookNoteRecord => {
  const payload = record.payload as SyncPayloadByEntity['bookNote'];
  return {
    user_id: '',
    book_hash: payload.bookHash,
    bookHash: payload.bookHash,
    meta_hash: payload.metaHash ?? null,
    metaHash: payload.metaHash ?? null,
    id: payload.id,
    type: payload.type,
    target: payload.target ?? undefined,
    cfi: payload.cfi ?? undefined,
    text: payload.text ?? null,
    style: payload.style ?? null,
    color: payload.color ?? null,
    note: payload.note ?? null,
    created_at: iso(payload.createdAt) ?? iso(record.serverUpdatedAt)!,
    createdAt: payload.createdAt ?? record.serverUpdatedAt,
    updated_at: payload.updatedAt ?? record.serverUpdatedAt,
    updatedAt: payload.updatedAt ?? record.serverUpdatedAt,
    deleted_at: payload.deletedAt ?? null,
    deletedAt: payload.deletedAt ?? null,
  } as unknown as BookNoteRecord;
};

const aiConversationFromRecord = (record: SyncServerRecord<'aiConversation'>): AIConversation => {
  const payload = record.payload as SyncPayloadByEntity['aiConversation'];
  return {
    id: payload.id,
    bookHash: payload.bookHash,
    title: payload.title,
    createdAt: payload.createdAt ?? record.serverUpdatedAt,
    updatedAt: payload.updatedAt ?? record.serverUpdatedAt,
    deletedAt: payload.deletedAt ?? undefined,
    parallelBookHashes: payload.parallelBookHashes ?? undefined,
  };
};

const aiMessageFromRecord = (record: SyncServerRecord<'aiMessage'>): AIMessage => {
  const payload = record.payload as SyncPayloadByEntity['aiMessage'];
  return {
    id: payload.id,
    conversationId: payload.conversationId,
    role: payload.role as AIMessage['role'],
    content: payload.content,
    createdAt: payload.createdAt ?? payload.updatedAt ?? record.serverUpdatedAt,
    parentId: payload.parentId ?? undefined,
  };
};

const settingsFromRecords = (records: EntityRecord[]): Record<string, unknown> | null => {
  const settingsRecord = records.find((record) => record.entity === 'settings');
  if (!settingsRecord || settingsRecord.entity !== 'settings') return null;
  const settings = {
    ...((settingsRecord.payload as SyncPayloadByEntity['settings']).settings ?? {}),
  };
  return Object.keys(settings).length > 0 ? settings : null;
};

const collectionsFromRecords = (records: EntityRecord[]): CollectionRecord[] =>
  records
    .filter((record): record is SyncServerRecord<'collection'> => record.entity === 'collection')
    .map((record) => {
      const payload = record.payload as SyncPayloadByEntity['collection'];
      return {
        id: payload.id,
        name: payload.name,
        bookHashes: payload.bookHashes ?? [],
        parentId: payload.parentId ?? null,
        sortOrder: payload.sortOrder ?? null,
        createdAt: payload.createdAt,
        updatedAt: payload.updatedAt ?? record.serverUpdatedAt,
        deletedAt: payload.deletedAt ?? null,
      };
    });

const maxServerUpdatedAt = (
  records: EntityRecord[],
  tombstones: SyncTombstone[] = [],
): number | null => {
  const timestamps = [
    ...records.map((record) => record.serverUpdatedAt),
    ...tombstones.map((tombstone) => tombstone.serverUpdatedAt),
  ];
  return timestamps.length > 0 ? Math.max(...timestamps) : null;
};

const recordsByEntity = <E extends SyncEntity>(
  response: SyncPullResponse | SyncReconcileResponse,
  entity: E,
): Array<SyncServerRecord<E>> =>
  ('records' in response ? response.records : response.upsert).filter(
    (record): record is SyncServerRecord<E> => record.entity === entity,
  );

const filterBookRows = <T extends { book_hash?: string | null; meta_hash?: string | null }>(
  rows: T[],
  book?: string,
  metaHash?: string,
): T[] =>
  rows.filter((row) => {
    if (book && row.book_hash !== book) return false;
    if (metaHash && row.meta_hash !== metaHash) return false;
    return true;
  });

const tombstoneBookHash = (tombstone: SyncTombstone): string =>
  tombstone.entity === 'bookNote' ? tombstone.entityId.split(':', 1)[0] || '' : tombstone.entityId;

const filterTombstones = (
  tombstones: SyncTombstone[],
  entities: SyncEntity[],
  book?: string,
): SyncTombstone[] =>
  tombstones.filter((tombstone) => {
    if (!entities.includes(tombstone.entity)) return false;
    if (book && tombstoneBookHash(tombstone) !== book) return false;
    return true;
  });

export async function pullCanonicalSyncChanges(
  since: number,
  type?: SyncType,
  book?: string,
  metaHash?: string,
  bookScopedConversationIds: Iterable<string> = [],
): Promise<SyncResult> {
  const { token, userId, deviceId } = await authEnvelope();
  const entities = entitiesForType(type);
  const response = await postSync<SyncPullResponse>(
    'pull',
    token,
    {
      protocolVersion: SYNC_PROTOCOL_VERSION,
      userId,
      deviceId,
      cursors: Object.fromEntries(entities.map((entity) => [entity, String(since)])),
      entities,
    },
    'Failed to pull changes',
  );

  const books = filterBookRows(
    recordsByEntity(response, 'book').map(dbBookFromRecord),
    book,
    metaHash,
  );
  const configs = filterBookRows(
    recordsByEntity(response, 'bookConfig').map(dbConfigFromRecord),
    book,
    metaHash,
  );
  const notes = filterBookRows(
    recordsByEntity(response, 'bookNote').map(dbNoteFromRecord),
    book,
    metaHash,
  );
  const aiConversations = recordsByEntity(response, 'aiConversation')
    .map(aiConversationFromRecord)
    .filter((conversation) => !book || conversation.bookHash === book);
  const conversationIds = new Set(aiConversations.map((conversation) => conversation.id));
  const knownBookConversationIds = new Set(bookScopedConversationIds);
  const aiMessages = recordsByEntity(response, 'aiMessage')
    .map(aiMessageFromRecord)
    .filter(
      (message) =>
        !book ||
        conversationIds.has(message.conversationId) ||
        knownBookConversationIds.has(message.conversationId),
    );

  const entityRecords = response.records as EntityRecord[];
  const tombstones = filterTombstones(response.tombstones ?? [], entities, book);
  return {
    books: type && type !== 'books' ? null : books,
    configs: type && type !== 'configs' ? null : configs,
    notes: type && type !== 'notes' ? null : notes,
    settings: type === 'settings' ? settingsFromRecords(entityRecords) : null,
    settingsUpdatedAt: type === 'settings' ? maxServerUpdatedAt(entityRecords, tombstones) : null,
    collections: type === 'settings' ? collectionsFromRecords(entityRecords) : null,
    aiConversations: type === 'ai' ? aiConversations : null,
    aiMessages: type === 'ai' ? aiMessages : null,
    tombstones,
    cursorByEntity: response.cursorByEntity,
  };
}

export async function reconcileCanonicalBooks(books: Record<string, number>): Promise<SyncResult> {
  const { token, userId, deviceId } = await authEnvelope();
  const inventory = Object.fromEntries(
    Object.entries(books).map(([hash, timestamp]) => [hash, revisionFromTimestamp(timestamp)]),
  );
  const response = await postSync<SyncReconcileResponse>(
    'reconcile',
    token,
    {
      protocolVersion: SYNC_PROTOCOL_VERSION,
      userId,
      deviceId,
      inventory: { book: inventory },
    },
    'Failed to reconcile changes',
  );

  return {
    books: null,
    configs: null,
    notes: null,
    settings: null,
    settingsUpdatedAt: null,
    collections: null,
    aiConversations: null,
    aiMessages: null,
    cursorByEntity: response.cursorByEntity,
    reconcile: {
      upsert: recordsByEntity(response, 'book').map(dbBookFromRecord),
      remove: response.remove.filter((item) => item.entity === 'book').map((item) => item.entityId),
    },
  };
}
