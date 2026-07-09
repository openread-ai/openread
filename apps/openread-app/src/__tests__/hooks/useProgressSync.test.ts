import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MetaHash, SyncableBookRef } from '@openread/types';
import type { Book, BookConfig } from '@/types/book';
import { useProgressSync } from '@/app/reader/hooks/useProgressSync';

const mocks = vi.hoisted(() => {
  const bookHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as SyncableBookRef;
  const metaHash = 'meta-1' as MetaHash;
  const book = {
    hash: bookHash,
    metaHash,
    title: 'Book',
    author: 'Author',
    format: 'epub',
    createdAt: 1,
    updatedAt: 1,
  } as Book;
  const config = {
    bookHash,
    metaHash,
    location: 'epubcfi(/6/2)',
    progress: [2, 100],
    updatedAt: 1000,
  } as BookConfig;
  return {
    bookHash,
    metaHash,
    book,
    bookKey: `${bookHash}::reader-a`,
    config,
    progress: undefined as { location?: string } | undefined,
    syncConfigs: vi.fn(async () => []),
    getConfig: vi.fn(() => config),
    getBookDataByReaderKey: vi.fn(() => ({ book })),
    getView: vi.fn(() => ({ renderer: { getContents: () => [] } })),
    getProgress: vi.fn(() => mocks.progress),
    setHoveredBookKey: vi.fn(),
    dispatch: vi.fn(),
    loggerWarn: vi.fn(),
    enqueueBookConfigForSync: vi.fn(() => Promise.resolve()),
  };
});

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/hooks/useSync', () => ({
  useSync: () => ({ syncConfigs: mocks.syncConfigs }),
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({
    getConfig: mocks.getConfig,
    getBookDataByReaderKey: mocks.getBookDataByReaderKey,
  }),
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({
    getView: mocks.getView,
    getProgress: mocks.getProgress,
    setHoveredBookKey: mocks.setHoveredBookKey,
  }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({ settings: { globalViewSettings: {} } }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/utils/serializer', () => ({
  serializeConfig: (config: BookConfig) => JSON.stringify(config),
}));

vi.mock('@/utils/debounce', () => ({
  debounce: (fn: () => void) => fn,
}));

vi.mock('@/utils/event', () => ({
  eventDispatcher: {
    on: vi.fn(),
    off: vi.fn(),
    dispatch: mocks.dispatch,
  },
}));

vi.mock('@/services/sync/helpers', () => ({
  enqueueBookConfigForSync: mocks.enqueueBookConfigForSync,
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    warn: mocks.loggerWarn,
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@/utils/xcfi', () => ({
  getCFIFromXPointer: vi.fn(),
  getXPointerFromCFI: vi.fn(async () => ({ xpointer: 'xpointer(/1)' })),
  normalizeProgressXPointer: (value: string) => value,
}));

describe('useProgressSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.progress = undefined;
    mocks.syncConfigs.mockResolvedValue([]);
    mocks.enqueueBookConfigForSync.mockResolvedValue(undefined);
    mocks.loggerWarn.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('handles rejected fire-and-forget progress flush enqueue promises on unmount', async () => {
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => unhandledRejections.push(reason);
    process.on('unhandledRejection', onUnhandledRejection);

    try {
      const enqueueError = new Error('enqueue failed');
      mocks.enqueueBookConfigForSync.mockRejectedValueOnce(enqueueError);

      const { unmount } = renderHook(() => useProgressSync(mocks.bookKey));

      unmount();

      expect(mocks.enqueueBookConfigForSync).toHaveBeenCalledWith(
        expect.objectContaining({ bookHash: mocks.bookHash, metaHash: mocks.metaHash }),
      );
      await waitFor(() => {
        expect(mocks.loggerWarn).toHaveBeenCalledWith(
          'Failed to enqueue reader progress sync flush',
          {
            mutationType: 'bookConfig',
            lifecycle: 'reader-progress-flush',
            hasBookKey: true,
            hasBookHash: true,
            hasMetaHash: true,
            error: enqueueError,
          },
        );
      });
      expect(unhandledRejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
    }
  });

  it('marks an empty initial scoped pull complete so later progress changes push locally', async () => {
    const { rerender } = renderHook(() => useProgressSync(mocks.bookKey));

    expect(mocks.syncConfigs).not.toHaveBeenCalled();

    await act(async () => {
      mocks.progress = { location: 'epubcfi(/6/2)' };
      rerender();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mocks.syncConfigs).toHaveBeenCalledWith([], mocks.bookHash, mocks.metaHash, 'pull');
    });

    mocks.syncConfigs.mockClear();

    await act(async () => {
      mocks.progress = { location: 'epubcfi(/6/4)' };
      rerender();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mocks.syncConfigs).toHaveBeenCalledWith(
        [expect.objectContaining({ bookHash: mocks.bookHash, metaHash: mocks.metaHash })],
        mocks.bookHash,
        mocks.metaHash,
        'push',
      );
    });
  });
});
