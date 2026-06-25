import { create } from 'zustand';
import { SystemSettings } from '@/types/settings';
import { Book, BookConfig, BookNote } from '@/types/book';
import { EnvConfigType } from '@/services/environment';
import { BookDoc } from '@/libs/document';
import { useLibraryStore } from './libraryStore';
import { parseBookRefFromReaderBookKey, normalizeBookReference } from '@/utils/readerBookKey';
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

interface BookDataState {
  booksData: { [id: string]: BookData };
  /** Configs received from pullRemoteConfigs before the book is opened in the reader.
   *  Keyed by bookHash. Consumed (cleared) by initViewState when the book opens. */
  preSyncedConfigs: { [bookHash: string]: Partial<BookConfig> };
  getConfig: (key: string | null) => BookConfig | null;
  setConfig: (key: string, partialConfig: Partial<BookConfig>) => void;
  setPreSyncedConfig: (bookHash: string, config: Partial<BookConfig>) => void;
  consumePreSyncedConfig: (bookHash: string) => Partial<BookConfig> | null;
  saveConfig: (
    envConfig: EnvConfigType,
    bookKey: string,
    config: BookConfig,
    settings: SystemSettings,
  ) => void;
  updateBooknotes: (key: string, booknotes: BookNote[]) => BookConfig | undefined;
  getBookDataByReaderKey: (bookKey: string | null) => BookData | null;
  getBookDataByRef: (bookRef: string | null) => BookData | null;
  clearBookDataByReaderKey: (bookKey: string | null) => void;
}

export const useBookDataStore = create<BookDataState>((set, get) => ({
  booksData: {},
  preSyncedConfigs: {},
  setPreSyncedConfig: (bookHash: string, config: Partial<BookConfig>) => {
    set((state) => {
      const updated = { ...state.preSyncedConfigs, [bookHash]: config };
      // Cap at 50 entries to prevent unbounded growth
      const keys = Object.keys(updated);
      if (keys.length > 50) {
        delete updated[keys[0]!];
      }
      return { preSyncedConfigs: updated };
    });
  },
  consumePreSyncedConfig: (bookHash: string) => {
    // Atomic read-and-delete inside a single set call
    let consumed: Partial<BookConfig> | null = null;
    set((state) => {
      consumed = state.preSyncedConfigs[bookHash] ?? null;
      if (consumed) {
        const { [bookHash]: _, ...rest } = state.preSyncedConfigs;
        return { preSyncedConfigs: rest };
      }
      return state;
    });
    return consumed;
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
  clearBookDataByReaderKey: (bookKey: string | null) => {
    const id = parseBookRefFromReaderBookKey(bookKey);
    if (!id) {
      logger.warn('Ignoring clearBookDataByReaderKey for invalid reader key', { bookKey });
      return;
    }
    set((state) => {
      const newBooksData = { ...state.booksData };
      delete newBooksData[id];
      return {
        booksData: newBooksData,
      };
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
        new Map(booknotes.map((item) => [`${item.id}-${item.type}-${item.cfi}`, item])).values(),
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
