import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MetaHash, SyncableBookRef } from '@openread/types';
import type { Book, BookConfig, BookNote } from '@/types/book';
import { useNotesSync } from '@/app/reader/hooks/useNotesSync';

const mocks = vi.hoisted(() => {
  const bookHash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as SyncableBookRef;
  const metaHash = 'meta-notes' as MetaHash;
  const book = {
    hash: bookHash,
    metaHash,
    title: 'Book',
    author: 'Author',
    format: 'epub',
    createdAt: 1,
    updatedAt: 1,
  } as Book;
  const note = {
    id: 'note-1',
    type: 'annotation',
    cfi: 'epubcfi(/6/2)',
    note: '',
    color: 'yellow',
    createdAt: 1,
    updatedAt: 1000,
  } as BookNote;
  const config = {
    location: 'epubcfi(/6/2)',
    booknotes: [note],
  } as BookConfig;
  return {
    bookHash,
    metaHash,
    book,
    note,
    config,
    bookKey: `${bookHash}::reader-a`,
    syncNotes: vi.fn(async () => []),
    getConfig: vi.fn(() => config),
    getBookDataByReaderKey: vi.fn(() => ({ book })),
    getViewsById: vi.fn(() => []),
    loggerWarn: vi.fn(),
    enqueueBookNotesForSync: vi.fn(() => Promise.resolve()),
  };
});

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/hooks/useSync', () => ({
  useSync: () => ({ syncNotes: mocks.syncNotes, lastNotePullAt: 0 }),
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({
    getConfig: mocks.getConfig,
    getBookDataByReaderKey: mocks.getBookDataByReaderKey,
  }),
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({
    getViewsById: mocks.getViewsById,
  }),
}));

vi.mock('@/utils/throttle', () => ({
  throttle: (fn: () => void) => fn,
}));

vi.mock('@/services/sync/helpers', () => ({
  enqueueBookNotesForSync: mocks.enqueueBookNotesForSync,
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    warn: mocks.loggerWarn,
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@/services/sync/remoteApply', () => ({
  remoteApplyEventMatchesBook: vi.fn(() => false),
  subscribeRemoteApply: vi.fn(() => vi.fn()),
}));

vi.mock('@/services/annotation/annotationTargetContract', () => ({
  getAnnotationTargetKey: vi.fn(),
  getBookNoteTarget: vi.fn(),
  getBookNoteTextCfi: vi.fn(),
}));

describe('useNotesSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enqueueBookNotesForSync.mockResolvedValue(undefined);
    mocks.loggerWarn.mockClear();
    mocks.getConfig.mockReturnValue(mocks.config);
    mocks.getBookDataByReaderKey.mockReturnValue({ book: mocks.book });
  });

  afterEach(() => {
    cleanup();
  });

  it('handles rejected fire-and-forget notes flush enqueue promises on unmount', async () => {
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => unhandledRejections.push(reason);
    process.on('unhandledRejection', onUnhandledRejection);

    try {
      const enqueueError = new Error('notes enqueue failed');
      mocks.enqueueBookNotesForSync.mockRejectedValueOnce(enqueueError);

      const { unmount } = renderHook(() => useNotesSync(mocks.bookKey));

      unmount();

      expect(mocks.enqueueBookNotesForSync).toHaveBeenCalledWith([
        expect.objectContaining({ bookHash: mocks.bookHash, metaHash: mocks.metaHash }),
      ]);
      await waitFor(() => {
        expect(mocks.loggerWarn).toHaveBeenCalledWith('Failed to enqueue reader notes sync flush', {
          mutationType: 'bookNotes',
          lifecycle: 'reader-notes-flush',
          count: 1,
          hasBookKey: true,
          hasBookHash: true,
          hasMetaHash: true,
          error: enqueueError,
        });
      });
      expect(unhandledRejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
    }
  });
});
