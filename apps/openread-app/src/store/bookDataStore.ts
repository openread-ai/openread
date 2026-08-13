import { create } from 'zustand';
import { SystemSettings } from '@/types/settings';
import { Book, BookConfig, BookNote } from '@/types/book';
import { EnvConfigType } from '@/services/environment';
import { getBookNoteTargetKey } from '@/services/annotation/annotationTargetContract';
import { BookDoc } from '@/libs/document';
import { useLibraryStore } from './libraryStore';
import { parseBookRefFromReaderBookKey, normalizeBookReference } from '@openread/types';
import { createLogger } from '@/utils/logger';

const logger = createLogger('bookDataStore');

interface BookData {
  /* Persistent data shared with different views of the same book */
  id: string;
  book: Book | null;
  file: File | null;
  config: BookConfig | null;
  bookDoc: BookDoc | null;
  isFixedLayout: boolean;
}

type RemoteBookConfig = {
  ownerUserId: string;
  config: Partial<BookConfig>;
};

const latestConfigTime = (config: Partial<BookConfig> | null): number => config?.updatedAt ?? 0;

export const mergeLatestBookConfig = (
  localConfig: BookConfig,
  remoteConfig: Partial<BookConfig> | null,
): BookConfig =>
  remoteConfig && latestConfigTime(remoteConfig) >= latestConfigTime(localConfig)
    ? ({ ...localConfig, ...remoteConfig } as BookConfig)
    : localConfig;

interface BookDataState {
  booksData: { [id: string]: BookData };
  /** Latest durable remote config for each book, retained for initialization and mounted-view replay. */
  remoteConfigs: { [bookHash: string]: RemoteBookConfig };
  getConfig: (key: string | null) => BookConfig | null;
  setConfig: (key: string, partialConfig: Partial<BookConfig>) => void;
  setRemoteConfig: (bookHash: string, ownerUserId: string, config: Partial<BookConfig>) => void;
  getRemoteConfig: (bookHash: string) => Partial<BookConfig> | null;
  getLatestConfig: (key: string, localConfig: BookConfig) => BookConfig;
  saveConfig: (
    envConfig: EnvConfigType,
    bookKey: string,
    config: BookConfig,
    settings: SystemSettings,
  ) => void;
  updateBooknotes: (key: string, booknotes: BookNote[]) => BookConfig | undefined;
  getBookDataByReaderKey: (bookKey: string | null) => BookData | null;
  getBookDataByRef: (bookRef: string | null) => BookData | null;
  clearBookDataByRef: (bookRef: string | null) => void;
}

export const useBookDataStore = create<BookDataState>((set, get) => ({
  booksData: {},
  remoteConfigs: {},
  setRemoteConfig: (bookHash: string, ownerUserId: string, config: Partial<BookConfig>) => {
    set((state) => {
      const existing = state.remoteConfigs[bookHash];
      if (
        existing?.ownerUserId === ownerUserId &&
        latestConfigTime(existing.config) > latestConfigTime(config)
      ) {
        return state;
      }
      const updated = { ...state.remoteConfigs, [bookHash]: { ownerUserId, config } };
      const keys = Object.keys(updated);
      if (keys.length > 50) delete updated[keys[0]!];
      return { remoteConfigs: updated };
    });
  },
  getRemoteConfig: (bookHash: string) => {
    const ownerUserId = useLibraryStore.getState().libraryOwnerUserId;
    if (!ownerUserId) return null;
    const remote = get().remoteConfigs[bookHash];
    return remote?.ownerUserId === ownerUserId ? remote.config : null;
  },
  getLatestConfig: (key: string, localConfig: BookConfig) => {
    const bookHash = normalizeBookReference(key) ?? parseBookRefFromReaderBookKey(key);
    if (!bookHash) return localConfig;
    return mergeLatestBookConfig(localConfig, get().getRemoteConfig(bookHash));
  },
  getBookDataByReaderKey: (bookKey: string | null) => {
    const id = parseBookRefFromReaderBookKey(bookKey);
    if (!id) return null;
    return get().booksData[id] || null;
  },
  getBookDataByRef: (bookRef: string | null) => {
    const id = normalizeBookReference(bookRef);
    if (!id) return null;
    return get().booksData[id] || null;
  },
  clearBookDataByRef: (bookRef: string | null) => {
    const id = normalizeBookReference(bookRef);
    if (!id) {
      logger.warn('Ignoring clearBookDataByRef for invalid book ref', { bookRef });
      return;
    }
    set((state) => {
      const { [id]: _bookData, ...booksData } = state.booksData;
      const { [id]: _remoteConfig, ...remoteConfigs } = state.remoteConfigs;
      return { booksData, remoteConfigs };
    });
  },
  getConfig: (key: string | null) => {
    const id = parseBookRefFromReaderBookKey(key);
    if (!id) return null;
    return get().booksData[id]?.config || null;
  },
  setConfig: (key: string, partialConfig: Partial<BookConfig>) => {
    const id = parseBookRefFromReaderBookKey(key);
    if (!id) {
      logger.warn('Ignoring setConfig for invalid reader key/ref', { key });
      return;
    }
    set((state: BookDataState) => {
      const existing = state.booksData[id];
      if (!existing) return state;
      const config = { ...(existing.config || {}), ...partialConfig } as BookConfig;
      return {
        booksData: {
          ...state.booksData,
          [id]: {
            ...existing,
            config,
          },
        },
      };
    });
  },
  saveConfig: async (
    envConfig: EnvConfigType,
    bookKey: string,
    config: BookConfig,
    settings: SystemSettings,
  ) => {
    const appService = await envConfig.getAppService();
    const { library, setLibrary } = useLibraryStore.getState();
    const bookId = parseBookRefFromReaderBookKey(bookKey);
    if (!bookId) {
      logger.warn('Ignoring saveConfig for invalid reader key/ref', { bookKey });
      return;
    }
    const bookIndex = library.findIndex((b) => b.hash === bookId);
    if (bookIndex === -1) return;
    const book = {
      ...library[bookIndex]!,
      progress: config.progress,
      updatedAt: Date.now(),
      downloadedAt: library[bookIndex]!.downloadedAt || Date.now(),
    };
    // Update book in-place without reordering the library array.
    // Reordering triggers a full library re-render which on iOS causes
    // the WKWebView reader to flash/reload due to cascading state updates.
    const newLibrary = [...library];
    newLibrary[bookIndex] = book;
    setLibrary(newLibrary);
    config.updatedAt = Date.now();
    await appService.saveBookConfig(book, config, settings);
    await appService.saveLibraryBooks(newLibrary);
  },
  updateBooknotes: (key: string, booknotes: BookNote[]) => {
    let updatedConfig: BookConfig | undefined;
    const id = parseBookRefFromReaderBookKey(key);
    if (!id) {
      logger.warn('Ignoring updateBooknotes for invalid reader key/ref', { key });
      return undefined;
    }
    set((state) => {
      const book = state.booksData[id];
      if (!book) return state;
      const dedupedBooknotes = Array.from(
        new Map(
          booknotes.map((item) => [`${item.id}-${item.type}-${getBookNoteTargetKey(item)}`, item]),
        ).values(),
      );
      const now = Date.now();
      updatedConfig = {
        ...book.config,
        updatedAt: now,
        booknotes: dedupedBooknotes,
      };
      return {
        booksData: {
          ...state.booksData,
          [id]: {
            ...book,
            config: {
              ...book.config,
              updatedAt: now,
              booknotes: dedupedBooknotes,
            },
          },
        },
      };
    });
    return updatedConfig;
  },
}));
