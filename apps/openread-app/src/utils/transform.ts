import {
  Book,
  BookConfig,
  BookFormat,
  BookNote,
  BookNoteType,
  BookSearchConfig,
  HighlightColor,
  HighlightStyle,
  ReadingStatus,
  ViewSettings,
} from '@/types/book';
import {
  getBookNoteLegacyCfi,
  getBookNoteTarget,
  normalizeAnnotationTarget,
} from '@/services/annotation/annotationTargetContract';
import type { BookMetadata } from '@/libs/document';
import type { SystemSettings } from '@/types/settings';
import { DBBookConfig, DBBook, DBBookNote } from '@/types/records';
import { sanitizeString } from './sanitize';
import {
  parseMetaHash,
  parseOpenReadBookReference,
  parseSyncableBookRef,
  type MetaHash,
  type OpenReadBookReference,
  type SyncableBookRef,
} from '@openread/types';
import { SYNCABLE_SETTINGS_KEYS } from '@openread/settings';

const requireOpenReadBookReference = (value: unknown, field: string): OpenReadBookReference => {
  const parsed = parseOpenReadBookReference(value);
  if (!parsed) throw new Error(`Invalid OpenRead book reference for ${field}`);
  return parsed;
};

const requireSyncableBookRef = (value: unknown, field: string): SyncableBookRef => {
  const parsed = parseSyncableBookRef(value);
  if (!parsed) throw new Error(`Invalid syncable book reference for ${field}`);
  return parsed;
};

const optionalMetaHash = (value: unknown, field: string): MetaHash | null => {
  if (value == null || value === '') return null;
  const parsed = parseMetaHash(value);
  if (!parsed) throw new Error(`Invalid metaHash for ${field}`);
  return parsed;
};

/**
 * Safely parse a JSON string, returning undefined on failure.
 * Logs an error with the field name for debugging.
 */
export function safeJsonParse<T>(value: string, fieldName: string): T | undefined {
  try {
    return JSON.parse(value) as T;
  } catch {
    console.error(`Failed to parse ${fieldName} as JSON, discarding value`);
    return undefined;
  }
}

export const transformBookConfigToDB = (bookConfig: unknown, userId: string): DBBookConfig => {
  const {
    bookHash,
    metaHash,
    progress,
    location,
    xpointer,
    searchConfig,
    viewSettings,
    updatedAt,
  } = bookConfig as BookConfig;

  return {
    user_id: userId,
    book_hash: bookHash!,
    meta_hash: metaHash ?? undefined,
    location: location,
    xpointer: xpointer,
    progress: progress ?? null,
    search_config: searchConfig ? (searchConfig as unknown as Record<string, unknown>) : null,
    view_settings: viewSettings ? (viewSettings as unknown as Record<string, unknown>) : null,
    updated_at: new Date(updatedAt ?? Date.now()).toISOString(),
  };
};

export const transformBookConfigFromDB = (dbBookConfig: DBBookConfig): BookConfig => {
  const {
    book_hash,
    meta_hash,
    progress,
    location,
    xpointer,
    search_config,
    view_settings,
    updated_at,
  } = dbBookConfig;
  return {
    bookHash: requireSyncableBookRef(book_hash, 'bookConfig.book_hash'),
    metaHash: optionalMetaHash(meta_hash, 'bookConfig.meta_hash'),
    location,
    xpointer,
    progress:
      typeof progress === 'string' ? safeJsonParse(progress, 'progress') : (progress ?? undefined),
    searchConfig: search_config
      ? ((typeof search_config === 'string'
          ? safeJsonParse(search_config, 'search_config')
          : search_config) as Partial<BookSearchConfig>)
      : undefined,
    viewSettings: view_settings
      ? ((typeof view_settings === 'string'
          ? safeJsonParse(view_settings, 'view_settings')
          : view_settings) as Partial<ViewSettings>)
      : undefined,
    updatedAt: updated_at ? new Date(updated_at).getTime() : Date.now(),
  } as BookConfig;
};

export const transformBookToDB = (book: unknown, userId: string): DBBook => {
  const {
    hash,
    metaHash,
    format,
    title,
    sourceTitle,
    author,
    groupId,
    groupName,
    tags,
    progress,
    readingStatus,
    metadata,
    createdAt,
    updatedAt,
    deletedAt,
    uploadedAt,
    storagePath,
    catalogBookId,
  } = book as Book;

  return {
    user_id: userId,
    book_hash: hash,
    meta_hash: metaHash ?? undefined,
    format,
    title: sanitizeString(title)!,
    author: sanitizeString(author)!,
    group_id: groupId,
    group_name: sanitizeString(groupName),
    tags: tags,
    progress: progress,
    reading_status: readingStatus,
    source_title: sanitizeString(sourceTitle),
    metadata: metadata ? (metadata as unknown as Record<string, unknown>) : null,
    storage_path: storagePath ?? null,
    catalog_book_id: catalogBookId ?? null,
    created_at: new Date(createdAt ?? Date.now()).toISOString(),
    updated_at: new Date(updatedAt ?? Date.now()).toISOString(),
    deleted_at: deletedAt ? new Date(deletedAt).toISOString() : null,
    uploaded_at: uploadedAt ? new Date(uploadedAt).toISOString() : null,
  };
};

export const transformBookFromDB = (dbBook: DBBook): Book => {
  const {
    book_hash,
    meta_hash,
    format,
    title,
    author,
    group_id,
    group_name,
    tags,
    progress,
    reading_status,
    source_title,
    metadata,
    storage_path,
    catalog_book_id,
    created_at,
    updated_at,
    deleted_at,
    uploaded_at,
  } = dbBook;
  const fallbackMs = Date.now();

  return {
    hash: requireOpenReadBookReference(book_hash, 'book.book_hash'),
    metaHash: optionalMetaHash(meta_hash, 'book.meta_hash'),
    format: (format?.toLowerCase() ?? 'epub') as BookFormat,
    title,
    author,
    groupId: group_id,
    groupName: group_name,
    tags: tags,
    progress: progress,
    readingStatus: reading_status as ReadingStatus,
    sourceTitle: source_title,
    metadata:
      typeof metadata === 'string'
        ? safeJsonParse<BookMetadata>(metadata, 'metadata')
        : ((metadata as BookMetadata | undefined) ?? undefined),
    storagePath: storage_path ?? null,
    catalogBookId: catalog_book_id ?? null,
    createdAt: created_at ? new Date(created_at).getTime() : fallbackMs,
    updatedAt: updated_at ? new Date(updated_at).getTime() : fallbackMs,
    deletedAt: deleted_at ? new Date(deleted_at).getTime() : null,
    uploadedAt: uploaded_at ? new Date(uploaded_at).getTime() : null,
  };
};

export const transformBookNoteToDB = (bookNote: unknown, userId: string): DBBookNote => {
  const {
    bookHash,
    metaHash,
    id,
    type,
    text,
    style,
    color,
    note,
    createdAt,
    updatedAt,
    deletedAt,
  } = bookNote as BookNote;

  return {
    user_id: userId,
    book_hash: bookHash!,
    meta_hash: metaHash ?? undefined,
    id,
    type,
    target: getBookNoteTarget(bookNote as BookNote),
    cfi: getBookNoteLegacyCfi(bookNote as BookNote),
    text: sanitizeString(text),
    style,
    color,
    note,
    created_at: new Date(createdAt ?? Date.now()).toISOString(),
    updated_at: new Date(updatedAt ?? Date.now()).toISOString(),
    // note that only null deleted_at is updated to the database, undefined is not
    deleted_at: deletedAt ? new Date(deletedAt).toISOString() : null,
  };
};

export const transformBookNoteFromDB = (dbBookNote: DBBookNote): BookNote => {
  const {
    book_hash,
    meta_hash,
    id,
    type,
    cfi,
    target,
    text,
    style,
    color,
    note,
    created_at,
    updated_at,
    deleted_at,
  } = dbBookNote;
  const fallbackMs = Date.now();

  return {
    bookHash: requireSyncableBookRef(book_hash, 'bookNote.book_hash'),
    metaHash: optionalMetaHash(meta_hash, 'bookNote.meta_hash'),
    id,
    type: type as BookNoteType,
    target: normalizeAnnotationTarget(target, cfi) ?? undefined,
    cfi,
    text,
    style: style as HighlightStyle,
    color: color as HighlightColor,
    note,
    createdAt: created_at ? new Date(created_at).getTime() : fallbackMs,
    updatedAt: updated_at ? new Date(updated_at).getTime() : fallbackMs,
    deletedAt: deleted_at ? new Date(deleted_at).getTime() : null,
  };
};

/**
 * Extract the roaming subset of settings for sync.
 * Includes a _updatedAt timestamp for LWW resolution on the server.
 */
export function extractRoamingSettings(settings: SystemSettings): Record<string, unknown> {
  const roaming: Record<string, unknown> = {};
  for (const key of SYNCABLE_SETTINGS_KEYS) {
    if (key in settings) {
      roaming[key] = settings[key as keyof SystemSettings];
    }
  }
  roaming._updatedAt = new Date().toISOString();
  return roaming;
}

/**
 * Merge remote roaming settings into local settings.
 * Only overwrites roaming keys; per-device keys are preserved.
 */
export function applyRoamingSettings(
  local: SystemSettings,
  remote: Record<string, unknown>,
): SystemSettings {
  const merged = { ...local };
  for (const key of SYNCABLE_SETTINGS_KEYS) {
    if (key in remote && remote[key] !== undefined) {
      (merged as Record<string, unknown>)[key] = remote[key];
    }
  }
  return merged;
}
