import type { DeviceId, SyncMutation, SyncPayloadByEntity, UserId } from '@openread/sync';
import {
  parseMetaHash,
  parseSyncableBookRef,
  type MetaHash,
  type SyncableBookRef,
} from '@openread/types';

import { CLOUD_BOOKS_SUBDIR } from '@/services/constants';
import type { AIConversation, AIMessage } from '@/services/ai/types';
import {
  getBookNoteLegacyCfi,
  getBookNoteTarget,
} from '@/services/annotation/annotationTargetContract';
import type { Book, BookConfig, BookNote } from '@/types/book';
import type { SystemSettings } from '@/types/settings';
import { getCoverFilename, getRemoteBookFilename } from '@/utils/book';
import { extractRoamingSettings } from '@/utils/transform';

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

const toTimestamp = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

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

const requireSyncableBookRef = (value: unknown, field: string): SyncableBookRef => {
  const parsed = parseSyncableBookRef(value);
  if (!parsed) throw new Error(`Invalid syncable book reference for ${field}`);
  return parsed;
};

const optionalMetaHash = (value: unknown, field: string): MetaHash | null => {
  const raw = optionalString(value);
  if (!raw) return null;
  const parsed = parseMetaHash(raw);
  if (!parsed) throw new Error(`Invalid metaHash for ${field}`);
  return parsed;
};

const syncableBookRefs = (values: string[] | undefined, field: string): SyncableBookRef[] =>
  Array.isArray(values) ? values.map((value) => requireSyncableBookRef(value, field)) : [];

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

const withDeleteBase = <E extends SyncMutation['entity']>(
  entity: E,
  entityId: string,
  context: SyncMutationContext,
  timestamp: number,
  reason: string,
) => ({
  id: mutationId(entity, entityId, 'delete', timestamp),
  entity,
  entityId,
  op: 'delete' as const,
  baseRevision: null,
  userId: context.userId,
  deviceId: context.deviceId,
  clientUpdatedAt: timestamp,
  tombstone: { deletedAt: timestamp, reason },
});

export function buildBookMutation(book: Book, context: SyncMutationContext): SyncMutation<'book'> {
  const now = context.now ?? Date.now();
  const updatedAt = latestTimestamp(book.updatedAt, book.deletedAt, now);
  const bookHash = requireSyncableBookRef(book.hash, 'book.hash');

  if (typeof book.deletedAt === 'number' && book.deletedAt > 0) {
    return withDeleteBase('book', bookHash, context, updatedAt, 'book-delete');
  }

  const payload: SyncPayloadByEntity['book'] = {
    hash: bookHash,
    title: book.title || 'Untitled',
    author: optionalString(book.author),
    format: optionalString(book.format),
    metaHash: optionalMetaHash(book.metaHash, 'book.metaHash'),
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
    ...withBase('book', bookHash, context, updatedAt),
    payload,
  };
}

export function buildBookConfigMutation(
  config: BookConfig,
  context: SyncMutationContext,
): SyncMutation<'bookConfig'> {
  const now = context.now ?? Date.now();
  const updatedAt = toTimestamp(config.updatedAt, now);
  const bookHash = requireSyncableBookRef(config.bookHash, 'bookConfig.bookHash');
  const payload: SyncPayloadByEntity['bookConfig'] = {
    bookHash,
    metaHash: optionalMetaHash(config.metaHash, 'bookConfig.metaHash'),
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
  const bookHash = requireSyncableBookRef(note.bookHash, 'bookNote.bookHash');
  const entityId = `${bookHash}:${note.id}`;
  const payload: SyncPayloadByEntity['bookNote'] = {
    id: note.id,
    bookHash,
    metaHash: optionalMetaHash(note.metaHash, 'bookNote.metaHash'),
    type: note.type,
    target: getBookNoteTarget(note),
    cfi: optionalString(getBookNoteLegacyCfi(note)),
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

export interface CollectionSyncInput {
  id: string;
  name: string;
  bookHashes?: string[];
  createdAt?: string | number;
  updatedAt?: number;
  deletedAt?: number | null;
}

export function buildSettingsMutation(
  settings: SystemSettings,
  context: SyncMutationContext,
): SyncMutation<'settings'> {
  const now = context.now ?? Date.now();
  const roaming = extractRoamingSettings(settings);
  const updatedAt = toTimestamp(roaming['_updatedAt'], now);
  const payload: SyncPayloadByEntity['settings'] = {
    id: 'settings',
    settings: optionalSerializableRecord(roaming) ?? {},
    updatedAt,
  };

  return {
    ...withBase('settings', 'settings', context, updatedAt),
    payload,
  };
}

export function buildCollectionMutation(
  collection: CollectionSyncInput,
  context: SyncMutationContext,
): SyncMutation<'collection'> {
  const now = context.now ?? Date.now();
  const updatedAt = latestTimestamp(collection.updatedAt, collection.deletedAt, now);
  const payload: SyncPayloadByEntity['collection'] = {
    id: collection.id,
    name: collection.name || 'Untitled collection',
    bookHashes: syncableBookRefs(collection.bookHashes, 'collection.bookHashes'),
    createdAt: toTimestamp(collection.createdAt, updatedAt),
    updatedAt,
    deletedAt: typeof collection.deletedAt === 'number' ? collection.deletedAt : null,
  };

  return {
    ...withBase('collection', collection.id, context, updatedAt),
    payload,
  };
}

export function buildCollectionMutations(
  collections: CollectionSyncInput[],
  context: SyncMutationContext,
): SyncMutation<'collection'>[] {
  return collections.map((collection) => buildCollectionMutation(collection, context));
}

export function buildAIConversationMutation(
  conversation: AIConversation,
  context: SyncMutationContext,
): SyncMutation<'aiConversation'> {
  const now = context.now ?? Date.now();
  const updatedAt = latestTimestamp(conversation.updatedAt, conversation.deletedAt, now);
  const payload: SyncPayloadByEntity['aiConversation'] = {
    id: conversation.id,
    bookHash: requireSyncableBookRef(conversation.bookHash, 'aiConversation.bookHash'),
    title: conversation.title || 'New conversation',
    createdAt: toTimestamp(conversation.createdAt, updatedAt),
    updatedAt,
    deletedAt: typeof conversation.deletedAt === 'number' ? conversation.deletedAt : null,
    ...(conversation.parallelBookHashes?.length
      ? {
          parallelBookHashes: syncableBookRefs(
            conversation.parallelBookHashes,
            'aiConversation.parallelBookHashes',
          ),
        }
      : {}),
  };

  return {
    ...withBase('aiConversation', conversation.id, context, updatedAt),
    payload,
  };
}

export function buildAIMessageMutation(
  message: AIMessage,
  context: SyncMutationContext,
): SyncMutation<'aiMessage'> {
  const now = context.now ?? Date.now();
  const updatedAt = toTimestamp(message.createdAt, now);
  const payload: SyncPayloadByEntity['aiMessage'] & { parentId?: string | null } = {
    id: message.id,
    conversationId: message.conversationId,
    role: message.role,
    content: message.content,
    createdAt: toTimestamp(message.createdAt, updatedAt),
    updatedAt,
    ...(message.parentId !== undefined ? { parentId: message.parentId } : {}),
  };

  return {
    ...withBase('aiMessage', `${message.conversationId}:${message.id}`, context, updatedAt),
    payload,
  };
}

export function buildFileMetadataMutation(
  book: Book,
  context: SyncMutationContext,
): SyncMutation<'fileMetadata'> | null {
  const now = context.now ?? Date.now();
  const uploadedAt = toTimestamp(book.uploadedAt, 0);
  if (!uploadedAt) return null;

  const storageKey = `${context.userId}/${CLOUD_BOOKS_SUBDIR}/${getRemoteBookFilename(book)}`;
  const payload: SyncPayloadByEntity['fileMetadata'] = {
    id: storageKey,
    bookHash: requireSyncableBookRef(book.hash, 'fileMetadata.bookHash'),
    fileType: 'book',
    storageKey,
    sizeBytes: book.sizeBytes ?? null,
    status: 'uploaded',
    updatedAt: uploadedAt || now,
  };

  return {
    ...withBase('fileMetadata', storageKey, context, payload.updatedAt),
    payload,
  };
}

export function buildFileMetadataMutationsFromBook(
  book: Book,
  context: SyncMutationContext,
): SyncMutation<'fileMetadata'>[] {
  const bookFile = buildFileMetadataMutation(book, context);
  if (!bookFile) return [];

  const coverUploadedAt = toTimestamp(book.coverDownloadedAt, 0);
  if (!coverUploadedAt) return [bookFile];

  const coverStorageKey = `${context.userId}/${CLOUD_BOOKS_SUBDIR}/${getCoverFilename(book)}`;
  return [
    bookFile,
    {
      ...withBase('fileMetadata', coverStorageKey, context, coverUploadedAt),
      payload: {
        id: coverStorageKey,
        bookHash: requireSyncableBookRef(book.hash, 'fileMetadata.bookHash'),
        fileType: 'cover',
        storageKey: coverStorageKey,
        status: 'uploaded',
        updatedAt: coverUploadedAt,
      },
    },
  ];
}
