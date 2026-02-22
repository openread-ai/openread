/**
 * Reader loading state store.
 *
 * P13.14 Phase 1: Extracted from readerStore to isolate book loading state
 * from view/progress state. Loading state changes no longer trigger
 * re-renders of view components.
 */

import { create } from 'zustand';
import { createLogger } from '@/utils/logger';
import { BookContent, FIXED_LAYOUT_FORMATS } from '@/types/book';
import { DocumentLoader } from '@/libs/document';
import { updateToc } from '@/utils/toc';
import { formatTitle, getMetadataHash, getPrimaryLanguage } from '@/utils/book';
import { getBaseFilename } from '@/utils/path';
import { SUPPORTED_LANGNAMES } from '@/services/constants';
import { useSettingsStore } from './settingsStore';
import { useBookDataStore } from './bookDataStore';
import { useLibraryStore } from './libraryStore';
import type { EnvConfigType } from '@/services/environment';

const logger = createLogger('readerLoadingStore');

interface LoadingState {
  /** Book IDs currently being loaded */
  loadingBooks: Set<string>;
  /** Errors from load attempts by book ID */
  loadErrors: Map<string, string>;
}

interface LoadingActions {
  isLoading: (bookId: string) => boolean;
  getLoadError: (bookId: string) => string | null;
  /**
   * Load book content and config, populating bookDataStore.
   * Returns true if successful, false otherwise.
   */
  loadBook: (envConfig: EnvConfigType, bookId: string) => Promise<boolean>;
  clearLoadError: (bookId: string) => void;
}

export const useReaderLoadingStore = create<LoadingState & LoadingActions>((set, get) => ({
  loadingBooks: new Set(),
  loadErrors: new Map(),

  isLoading: (bookId: string) => get().loadingBooks.has(bookId),

  getLoadError: (bookId: string) => get().loadErrors.get(bookId) ?? null,

  clearLoadError: (bookId: string) => {
    set((state) => {
      const errors = new Map(state.loadErrors);
      errors.delete(bookId);
      return { loadErrors: errors };
    });
  },

  loadBook: async (envConfig: EnvConfigType, bookId: string): Promise<boolean> => {
    if (get().loadingBooks.has(bookId)) return false; // Already loading

    set((state) => ({
      loadingBooks: new Set([...state.loadingBooks, bookId]),
      loadErrors: (() => {
        const m = new Map(state.loadErrors);
        m.delete(bookId);
        return m;
      })(),
    }));

    try {
      const appService = await envConfig.getAppService();
      const { settings } = useSettingsStore.getState();
      const { library } = useLibraryStore.getState();
      const book = library.find((b) => b.hash === bookId);
      if (!book) throw new Error('Book not found');

      const content = (await appService.loadBookContent(book)) as BookContent;
      const file = content.file;
      logger.info('Loading book', bookId);
      const doc = await new DocumentLoader(file).open();
      const bookDoc = doc.book;
      const config = await appService.loadBookConfig(book, settings);

      await updateToc(
        bookDoc,
        config.viewSettings?.sortedTOC ?? false,
        config.viewSettings?.convertChineseVariant ?? 'none',
      );

      if (!bookDoc.metadata.title) {
        bookDoc.metadata.title = getBaseFilename(file.name);
      }
      book.sourceTitle = formatTitle(bookDoc.metadata.title);

      if (typeof bookDoc.metadata?.language === 'string') {
        if (bookDoc.metadata.language in SUPPORTED_LANGNAMES) {
          bookDoc.metadata.language = SUPPORTED_LANGNAMES[bookDoc.metadata.language]!;
        }
      }

      const primaryLanguage = getPrimaryLanguage(bookDoc.metadata.language);
      book.primaryLanguage = book.primaryLanguage ?? primaryLanguage;
      book.metadata = book.metadata ?? bookDoc.metadata;
      book.metaHash = getMetadataHash(bookDoc.metadata);

      const isFixedLayout = FIXED_LAYOUT_FORMATS.has(book.format);
      useBookDataStore.setState((state) => ({
        booksData: {
          ...state.booksData,
          [bookId]: { id: bookId, book, file, config, bookDoc, isFixedLayout },
        },
      }));

      set((state) => {
        const loading = new Set(state.loadingBooks);
        loading.delete(bookId);
        return { loadingBooks: loading };
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to load book', error);
      set((state) => {
        const loading = new Set(state.loadingBooks);
        loading.delete(bookId);
        const errors = new Map(state.loadErrors);
        errors.set(bookId, message);
        return { loadingBooks: loading, loadErrors: errors };
      });
      return false;
    }
  },
}));
