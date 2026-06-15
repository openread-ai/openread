import type { DeviceId, SyncMutation, SyncPayloadByEntity, UserId } from '@openread/sync';

import type { Book, BookConfig, BookNote } from '@/types/book';
import type { QueueItem } from './offlineQueue';

export type SyncQueueInput = Pick<QueueItem, 'type' | 'action' | 'payload'>;

export interface SyncMutationContext {
  userId: UserId;
  deviceId: DeviceId;
  now?: number;
}

type SerializableValue =
  | string
  | number
  | boolean
  | null
  | SerializableValue[]
  | SerializableRecord;
type SerializableRecord = { [key: string]: SerializableValue };

const toTimestamp = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const latestTimestamp = (updatedAt: unknown, deletedAt: unknown, fallback: number): number =>
  Math.max(toTimestamp(updatedAt, fallback), toTimestamp(deletedAt, 0));

const mutationId = (entity: string, entityId: string, op: string, timestamp: number): string => {
  const suffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${timestamp}-${Math.random().toString(36).slice(2)}`;
  return `${entity}:${entityId}:${op}:${timestamp}:${suffix}`;
};

const jsonClone = <T>(value: T): T | undefined => {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as T;
};

const optionalString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

const optionalSerializableRecord = (value: unknown): SerializableRecord | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const cloned = jsonClone(value) as unknown;
  return cloned && typeof cloned === 'object' && !Array.isArray(cloned)
    ? (cloned as SerializableRecord)
    : null;
};

const optionalSerializableValue = (value: unknown): SerializableValue | null => {
  if (value === undefined) return null;
  return (jsonClone(value) as SerializableValue | undefined) ?? null;
};

const withBase = <E extends SyncMutation['entity']>(
  entity: E,
  entityId: string,
  context: SyncMutationContext,
  timestamp: number,
) => ({
  id: mutationId(entity, entityId, 'upsert', timestamp),
  entity,
  entityId,
  op: 'upsert' as const,
  baseRevision: null,
  userId: context.userId,
  deviceId: context.deviceId,
  clientUpdatedAt: timestamp,
});

export function buildBookMutation(book: Book, context: SyncMutationContext): SyncMutation<'book'> {
  const now = context.now ?? Date.now();
  const updatedAt = latestTimestamp(book.updatedAt ?? book.lastUpdated, book.deletedAt, now);
  const payload: SyncPayloadByEntity['book'] = {
    hash: book.hash,
    title: book.title || 'Untitled',
    author: optionalString(book.author),
    format: optionalString(book.format),
    metaHash: optionalString(book.metaHash),
    sourceTitle: optionalString(book.sourceTitle),
    groupId: optionalString(book.groupId),
    groupName: optionalString(book.groupName),
    tags: Array.isArray(book.tags) ? [...book.tags] : null,
    readingStatus: optionalString(book.readingStatus),
    progress: optionalSerializableValue(book.progress),
    metadata: optionalSerializableRecord(book.metadata),
    uploadedAt: typeof book.uploadedAt === 'number' ? book.uploadedAt : null,
    storagePath: optionalString(book.storagePath),
    catalogBookId: optionalString(book.catalogBookId),
    createdAt: toTimestamp(book.createdAt, updatedAt),
    updatedAt,
    deletedAt: typeof book.deletedAt === 'number' ? book.deletedAt : null,
  };

  return {
    ...withBase('book', book.hash, context, updatedAt),
    payload,
  };
}

export function buildBookConfigMutation(
  config: BookConfig,
  context: SyncMutationContext,
): SyncMutation<'bookConfig'> {
  const now = context.now ?? Date.now();
  const updatedAt = toTimestamp(config.updatedAt, now);
  const bookHash = config.bookHash ?? '';
  const payload: SyncPayloadByEntity['bookConfig'] = {
    bookHash,
    metaHash: optionalString(config.metaHash),
    location: optionalString(config.location),
    xpointer: optionalString(config.xpointer),
    progress: optionalSerializableValue(config.progress),
    searchConfig: optionalSerializableRecord(config.searchConfig),
    viewSettings: optionalSerializableRecord(config.viewSettings),
    updatedAt,
  };

  return {
    ...withBase('bookConfig', bookHash, context, updatedAt),
    payload,
  };
}

export function buildBookNoteMutation(
  note: BookNote,
  context: SyncMutationContext,
): SyncMutation<'bookNote'> {
  const now = context.now ?? Date.now();
  const updatedAt = latestTimestamp(note.updatedAt, note.deletedAt, now);
  const bookHash = note.bookHash ?? '';
  const entityId = `${bookHash}:${note.id}`;
  const payload: SyncPayloadByEntity['bookNote'] = {
    id: note.id,
    bookHash,
    metaHash: optionalString(note.metaHash),
    type: note.type,
    cfi: note.cfi,
    text: optionalString(note.text),
    style: optionalString(note.style),
    color: optionalString(note.color),
    note: typeof note.note === 'string' ? note.note : null,
    createdAt: toTimestamp(note.createdAt, updatedAt),
    updatedAt,
    deletedAt: typeof note.deletedAt === 'number' ? note.deletedAt : null,
  };

  return {
    ...withBase('bookNote', entityId, context, updatedAt),
    payload,
  };
}

export function buildSyncMutationFromQueueItem(
  item: SyncQueueInput,
  context: SyncMutationContext,
): SyncMutation<'book' | 'bookConfig' | 'bookNote'> {
  switch (item.type) {
    case 'book':
      return buildBookMutation(item.payload as unknown as Book, context);
    case 'config':
      return buildBookConfigMutation(item.payload as unknown as BookConfig, context);
    case 'note':
      return buildBookNoteMutation(item.payload as unknown as BookNote, context);
  }
}

export function buildSyncMutationsFromQueueItems(
  items: SyncQueueInput[],
  context: SyncMutationContext,
): SyncMutation<'book' | 'bookConfig' | 'bookNote'>[] {
  return items.map((item) => buildSyncMutationFromQueueItem(item, context));
}
