import type { SyncTombstone } from '@openread/sync';
import type { MetaHash, SyncableBookRef } from '@openread/types';

import {
  getBookNoteLegacyCfi,
  normalizeAnnotationTarget,
} from '@/services/annotation/annotationTargetContract';
import envConfig from '@/services/environment';
import { settingsService } from '@/services/settings/settingsService';
import { parseSyncableBookRef } from '@openread/types';
import { useBookDataStore } from '@/store/bookDataStore';
import { useLibraryStore } from '@/store/libraryStore';
import { usePlatformSidebarStore } from '@/store/platformSidebarStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { Book, BookConfig, BookDataRecord, BookNote } from '@/types/book';
import type { CollectionRecord } from './client';

export type RemoteConfigTransform = { config: BookConfig; record: BookDataRecord };
export type RemoteNoteTransform = { note: BookNote; record: BookDataRecord };

export type RemoteApplyDurabilityFailures = {
  failedRecords: BookDataRecord[];
  failedTombstones: SyncTombstone[];
};

type SyncableCollection = CollectionRecord;

export type RemoteApplyEvent =
  | {
      type: 'bookConfig';
      bookHash: SyncableBookRef;
      metaHash?: MetaHash | null;
      config: BookConfig;
      previousConfig: BookConfig | null;
    }
  | {
      type: 'bookNotes';
      bookHash: SyncableBookRef;
      metaHash?: MetaHash | null;
      notes: BookNote[];
      changedNotes: BookNote[];
      previousNotes: BookNote[];
    }
  | { type: 'settings'; settings: unknown }
  | { type: 'collections'; collections: SyncableCollection[] };

type RemoteApplyListener = (event: RemoteApplyEvent) => void;

const listeners = new Set<RemoteApplyListener>();

export function subscribeRemoteApply(listener: RemoteApplyListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitRemoteApply(event: RemoteApplyEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
}

function tombstoneTimestamp(tombstone: SyncTombstone): number {
  return Math.max(tombstone.serverUpdatedAt, tombstone.deletedAt);
}

function configDeletePatch(bookHash: SyncableBookRef, deletedAt: number): BookConfig {
  return {
    bookHash,
    progress: undefined,
    location: undefined,
    xpointer: undefined,
    searchConfig: undefined,
    viewSettings: undefined,
    updatedAt: deletedAt,
  };
}

function parseBookNoteEntityId(
  entityId: string,
): { bookHash: SyncableBookRef; noteId: string } | null {
  const separatorIndex = entityId.lastIndexOf(':');
  if (separatorIndex <= 0 || separatorIndex === entityId.length - 1) return null;
  const bookHash = parseSyncableBookRef(entityId.slice(0, separatorIndex));
  if (!bookHash) return null;
  return {
    bookHash,
    noteId: entityId.slice(separatorIndex + 1),
  };
}

function stripNullishConfig(config: BookConfig): Partial<BookConfig> {
  return Object.fromEntries(
    Object.entries(config).filter(([, value]) => value !== null && value !== undefined),
  ) as Partial<BookConfig>;
}

function sanitizeRemoteConfig(config: BookConfig): BookConfig {
  const next = { ...config };
  if (next.location && !next.location.startsWith('epubcfi(')) {
    delete next.location;
  }
  return next;
}

function latestModelTime(value: { updatedAt?: number; deletedAt?: number | null } | null): number {
  return Math.max(value?.updatedAt ?? 0, value?.deletedAt ?? 0);
}

export function remoteApplyEventMatchesBook(input: {
  eventBookHash?: SyncableBookRef | null;
  eventMetaHash?: MetaHash | null;
  bookHash?: SyncableBookRef | string | null;
  bookMetaHash?: MetaHash | string | null;
}): boolean {
  if (input.eventBookHash && input.bookHash && input.eventBookHash === input.bookHash) return true;
  return Boolean(
    input.eventMetaHash && input.bookMetaHash && input.eventMetaHash === input.bookMetaHash,
  );
}

function findLibraryBook(bookHash: string): Book | undefined {
  return useLibraryStore.getState().library.find((book) => book.hash === bookHash);
}

async function loadLocalConfig(book: Book): Promise<BookConfig> {
  const active = useBookDataStore.getState().getConfig(book.hash);
  if (active) return active;

  try {
    const appService = await envConfig.getAppService();
    const settings = useSettingsStore.getState().settings;
    return await appService.loadBookConfig(book, settings);
  } catch {
    return { updatedAt: 0 } as BookConfig;
  }
}

async function persistBookConfig(book: Book, config: BookConfig): Promise<boolean> {
  try {
    const appService = await envConfig.getAppService();
    const settings = useSettingsStore.getState().settings;
    await appService.saveBookConfig(book, config, settings);
    return true;
  } catch (error) {
    console.warn('[RemoteSyncApply] Failed to persist remote book config:', error);
    return false;
  }
}

async function applyLibraryProgress(
  updates: Array<{ hash: string; progress: BookConfig['progress'] }>,
) {
  if (updates.length === 0) return;
  const currentLibrary = useLibraryStore.getState().library;
  const updateMap = new Map(updates.map((update) => [update.hash, update.progress]));
  const updatedLibrary = currentLibrary.map((book) => {
    const progress = updateMap.get(book.hash);
    return progress ? { ...book, progress, updatedAt: Date.now() } : book;
  });
  useLibraryStore.getState().setLibrary(updatedLibrary);
  try {
    const appService = await envConfig.getAppService();
    await appService.saveLibraryBooks(updatedLibrary);
  } catch (error) {
    console.warn('[RemoteSyncApply] Failed to persist remote library progress:', error);
  }
}

type RemoteBookConfigApplyResult = {
  configs: BookConfig[];
  acceptedRecords: BookDataRecord[];
  acceptedTombstones: SyncTombstone[];
} & RemoteApplyDurabilityFailures;

let remoteBookConfigApplyQueue: Promise<void> = Promise.resolve();

export function applyRemoteBookConfigRows(
  configRows: RemoteConfigTransform[],
  tombstones: SyncTombstone[],
  expectedOwnerUserId: string | null = useLibraryStore.getState().libraryOwnerUserId,
): Promise<RemoteBookConfigApplyResult> {
  const applying = remoteBookConfigApplyQueue.then(() =>
    applyRemoteBookConfigRowsSerial(configRows, tombstones, expectedOwnerUserId),
  );
  remoteBookConfigApplyQueue = applying.then(
    () => undefined,
    () => undefined,
  );
  return applying;
}

async function applyRemoteBookConfigRowsSerial(
  configRows: RemoteConfigTransform[],
  tombstones: SyncTombstone[],
  expectedOwnerUserId: string | null,
): Promise<RemoteBookConfigApplyResult> {
  const bookDataStore = useBookDataStore.getState();
  const acceptedRecords: BookDataRecord[] = [];
  const acceptedTombstones: SyncTombstone[] = [];
  const failedRecords: BookDataRecord[] = [];
  const failedTombstones: SyncTombstone[] = [];
  const appliedConfigs: BookConfig[] = [];
  const progressUpdates: Array<{ hash: string; progress: BookConfig['progress'] }> = [];

  for (const { config: rawConfig, record } of configRows) {
    if (!rawConfig.bookHash) {
      acceptedRecords.push(record);
      continue;
    }
    const book = findLibraryBook(rawConfig.bookHash);
    if (!book) {
      acceptedRecords.push(record);
      continue;
    }

    const ownerUserId = expectedOwnerUserId;
    if (!ownerUserId || useLibraryStore.getState().libraryOwnerUserId !== ownerUserId) {
      acceptedRecords.push(record);
      continue;
    }
    const previousConfig = await loadLocalConfig(book);
    const remoteConfig = sanitizeRemoteConfig(rawConfig);
    const remoteTime = latestModelTime(remoteConfig);
    const currentRemoteTime = latestModelTime(bookDataStore.getRemoteConfig(rawConfig.bookHash));
    const localTime = Math.max(latestModelTime(previousConfig), currentRemoteTime);
    if (remoteTime < localTime) {
      acceptedRecords.push(record);
      continue;
    }

    const merged = {
      ...previousConfig,
      ...stripNullishConfig(remoteConfig),
      bookHash: rawConfig.bookHash,
      metaHash: rawConfig.metaHash ?? book.metaHash,
      updatedAt: remoteConfig.updatedAt ?? previousConfig.updatedAt ?? 0,
    } as BookConfig;

    if (
      useLibraryStore.getState().libraryOwnerUserId !== ownerUserId ||
      remoteTime < latestModelTime(bookDataStore.getRemoteConfig(rawConfig.bookHash))
    ) {
      acceptedRecords.push(record);
      continue;
    }
    const persisted = await persistBookConfig(book, merged);
    if (!persisted) {
      failedRecords.push(record);
      continue;
    }

    const ownerIsCurrent = useLibraryStore.getState().libraryOwnerUserId === ownerUserId;
    if (ownerIsCurrent) {
      bookDataStore.setConfig(book.hash, merged);
      bookDataStore.setRemoteConfig(rawConfig.bookHash, ownerUserId, merged);
      if (merged.progress) progressUpdates.push({ hash: book.hash, progress: merged.progress });
      appliedConfigs.push(merged);
      emitRemoteApply({
        type: 'bookConfig',
        bookHash: rawConfig.bookHash,
        metaHash: rawConfig.metaHash ?? book.metaHash,
        config: merged,
        previousConfig,
      });
    }
    acceptedRecords.push(record);
  }

  for (const tombstone of tombstones) {
    const bookHash = parseSyncableBookRef(tombstone.entityId);
    if (!bookHash) {
      acceptedTombstones.push(tombstone);
      continue;
    }
    const book = findLibraryBook(bookHash);
    if (!book) {
      acceptedTombstones.push(tombstone);
      continue;
    }

    const ownerUserId = expectedOwnerUserId;
    if (!ownerUserId || useLibraryStore.getState().libraryOwnerUserId !== ownerUserId) {
      acceptedTombstones.push(tombstone);
      continue;
    }
    const previousConfig = await loadLocalConfig(book);
    const deletedAt = tombstoneTimestamp(tombstone);
    if (deletedAt < latestModelTime(previousConfig)) {
      acceptedTombstones.push(tombstone);
      continue;
    }

    const patch = configDeletePatch(bookHash, deletedAt);
    const persisted = await persistBookConfig(book, patch);
    if (!persisted) {
      failedTombstones.push(tombstone);
      continue;
    }

    const ownerIsCurrent = useLibraryStore.getState().libraryOwnerUserId === ownerUserId;
    if (ownerIsCurrent) {
      bookDataStore.setConfig(book.hash, patch);
      bookDataStore.setRemoteConfig(bookHash, ownerUserId, patch);
      appliedConfigs.push(patch);
      emitRemoteApply({
        type: 'bookConfig',
        bookHash,
        metaHash: book.metaHash,
        config: patch,
        previousConfig,
      });
    }
    acceptedTombstones.push(tombstone);
  }

  await applyLibraryProgress(progressUpdates);
  return {
    configs: appliedConfigs,
    acceptedRecords,
    acceptedTombstones,
    failedRecords,
    failedTombstones,
  };
}

export async function applyRemoteBookNoteRows(
  noteRows: RemoteNoteTransform[],
  tombstones: SyncTombstone[],
): Promise<
  {
    notes: BookNote[];
    acceptedRecords: BookDataRecord[];
    acceptedTombstones: SyncTombstone[];
  } & RemoteApplyDurabilityFailures
> {
  const acceptedRecords: BookDataRecord[] = [];
  const acceptedTombstones: SyncTombstone[] = [];
  const failedRecords: BookDataRecord[] = [];
  const failedTombstones: SyncTombstone[] = [];
  const appliedNotes: BookNote[] = [];
  const notesByBook = new Map<SyncableBookRef, RemoteNoteTransform[]>();

  for (const row of noteRows) {
    if (!row.note.bookHash) {
      acceptedRecords.push(row.record);
      continue;
    }
    const existing = notesByBook.get(row.note.bookHash) ?? [];
    existing.push(row);
    notesByBook.set(row.note.bookHash, existing);
  }

  for (const [bookHash, rows] of notesByBook) {
    const book = findLibraryBook(bookHash);
    if (!book) {
      acceptedRecords.push(...rows.map((row) => row.record));
      continue;
    }
    const config = await loadLocalConfig(book);
    const previousNotes = config.booknotes ?? [];
    const noteIdxMap = new Map(previousNotes.map((note, index) => [note.id, index]));
    const mergedNotes = [...previousNotes];
    const changedNotes: BookNote[] = [];
    const recordsNeedingDurableApply: BookDataRecord[] = [];

    for (const row of rows) {
      const note = {
        ...row.note,
        target: normalizeAnnotationTarget(row.note.target, row.note.cfi) ?? undefined,
        cfi: getBookNoteLegacyCfi(row.note),
        metaHash: row.note.metaHash ?? book.metaHash,
      };
      const idx = noteIdxMap.get(note.id);
      if (idx !== undefined) {
        const remoteTime = latestModelTime(note);
        const localTime = latestModelTime(mergedNotes[idx]!);
        if (remoteTime >= localTime) {
          mergedNotes[idx] = { ...mergedNotes[idx]!, ...note };
          changedNotes.push(mergedNotes[idx]!);
          recordsNeedingDurableApply.push(row.record);
        } else {
          acceptedRecords.push(row.record);
        }
      } else {
        mergedNotes.push(note);
        noteIdxMap.set(note.id, mergedNotes.length - 1);
        changedNotes.push(note);
        recordsNeedingDurableApply.push(row.record);
      }
    }

    if (changedNotes.length > 0) {
      const mergedConfig = { ...config, bookHash, metaHash: book.metaHash, booknotes: mergedNotes };
      const persisted = await persistBookConfig(book, mergedConfig);
      if (!persisted) {
        failedRecords.push(...recordsNeedingDurableApply);
        continue;
      }

      useBookDataStore.getState().setConfig(book.hash, mergedConfig);
      acceptedRecords.push(...recordsNeedingDurableApply);
      appliedNotes.push(...changedNotes);
      emitRemoteApply({
        type: 'bookNotes',
        bookHash,
        metaHash: book.metaHash,
        notes: mergedNotes,
        changedNotes,
        previousNotes,
      });
    }
  }

  for (const tombstone of tombstones) {
    const parsed = parseBookNoteEntityId(tombstone.entityId);
    if (!parsed) {
      acceptedTombstones.push(tombstone);
      continue;
    }
    const book = findLibraryBook(parsed.bookHash);
    if (!book) {
      acceptedTombstones.push(tombstone);
      continue;
    }
    const config = await loadLocalConfig(book);
    const previousNotes = config.booknotes ?? [];
    const idx = previousNotes.findIndex((note) => note.id === parsed.noteId);
    if (idx === -1) {
      acceptedTombstones.push(tombstone);
      continue;
    }

    const remoteTime = tombstoneTimestamp(tombstone);
    if (remoteTime < latestModelTime(previousNotes[idx]!)) {
      acceptedTombstones.push(tombstone);
      continue;
    }

    const mergedNotes = [...previousNotes];
    mergedNotes[idx] = {
      ...mergedNotes[idx]!,
      updatedAt: remoteTime,
      deletedAt: tombstone.deletedAt,
    };
    const mergedConfig = {
      ...config,
      bookHash: parsed.bookHash,
      metaHash: book.metaHash,
      booknotes: mergedNotes,
    } as BookConfig;
    const persisted = await persistBookConfig(book, mergedConfig);
    if (!persisted) {
      failedTombstones.push(tombstone);
      continue;
    }

    useBookDataStore.getState().setConfig(book.hash, mergedConfig);
    acceptedTombstones.push(tombstone);
    appliedNotes.push(mergedNotes[idx]!);
    emitRemoteApply({
      type: 'bookNotes',
      bookHash: parsed.bookHash,
      metaHash: book.metaHash,
      notes: mergedNotes,
      changedNotes: [mergedNotes[idx]!],
      previousNotes,
    });
  }

  return {
    notes: appliedNotes,
    acceptedRecords,
    acceptedTombstones,
    failedRecords,
    failedTombstones,
  };
}

function mergeCollections(
  local: SyncableCollection[],
  remote: SyncableCollection[],
): SyncableCollection[] {
  const localMap = new Map(local.map((collection) => [collection.id, collection]));
  for (const remoteCollection of remote) {
    if (!remoteCollection.id) continue;
    const localCollection = localMap.get(remoteCollection.id);
    if (!localCollection || latestModelTime(remoteCollection) > latestModelTime(localCollection)) {
      localMap.set(remoteCollection.id, remoteCollection);
    }
  }
  return Array.from(localMap.values()).filter((collection) => !collection.deletedAt);
}

export async function applyRemoteSettingsAndCollections(input: {
  remoteSettings?: Record<string, unknown> | null;
  remoteCollections?: SyncableCollection[];
  collectionTombstones?: SyncTombstone[];
}): Promise<void> {
  const { remoteSettings, remoteCollections = [], collectionTombstones = [] } = input;
  const freshSettings = { ...useSettingsStore.getState().settings };
  const mergedSettings = remoteSettings
    ? settingsService.applySyncable(freshSettings, remoteSettings)
    : freshSettings;

  useSettingsStore.getState().setSettings(mergedSettings);
  await settingsService.save(envConfig, mergedSettings, { sync: false });
  emitRemoteApply({ type: 'settings', settings: mergedSettings });

  if (remoteCollections.length > 0 || collectionTombstones.length > 0) {
    const localCollections = usePlatformSidebarStore.getState().collections;
    const tombstoneCollections = collectionTombstones.map((tombstone) => ({
      id: tombstone.entityId,
      name: '',
      bookHashes: [],
      createdAt: new Date(tombstone.deletedAt).toISOString(),
      updatedAt: tombstoneTimestamp(tombstone),
      deletedAt: tombstone.deletedAt,
    }));
    const mergedCollections = mergeCollections(localCollections, [
      ...remoteCollections,
      ...tombstoneCollections,
    ]);
    usePlatformSidebarStore.setState({
      collections: mergedCollections as typeof localCollections,
    });
    emitRemoteApply({ type: 'collections', collections: mergedCollections });
  }
}
