import { PLATFORM_UPLOAD_FORMATS } from '@openread/types';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SUPPORTED_BOOK_EXTS } from '@/services/constants';
import { ImportFailureError } from '@/services/importFailure';
import { transferManager } from '@/services/transferManager';
import { useLibraryStore } from '@/store/libraryStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTransferStore, type TransferItem } from '@/store/transferStore';
import type { Book } from '@/types/book';
import { eventDispatcher } from '@/utils/event';
import { testOpenReadBookRef } from '../utils/bookIdentityFixtures';
const mockLibraryLimitState = vi.hoisted(() => ({
  canAddBook: false,
  libraryLimit: null as number | null,
  currentCount: 0,
  plan: 'free' as const,
  isLoading: false,
  isResolved: false,
  error: null as Error | null,
}));

const mockEnv = vi.hoisted(() => ({ appService: null as unknown }));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => mockEnv,
}));
vi.mock('@/hooks/useFileSelector', () => ({
  useFileSelector: () => ({ selectFiles: vi.fn() }),
}));
vi.mock('@/hooks/useLibraryLimit', () => ({
  useLibraryLimit: () => mockLibraryLimitState,
}));
vi.mock('@/hooks/useSync', () => ({
  useSync: () => ({ syncBooks: vi.fn() }),
}));

import {
  createFailedImportOutcome,
  createLibraryLimitImportOutcome,
  createLibraryLimitUnavailableImportOutcome,
  createUnsupportedImportOutcome,
  isSupportedSelectedBookFile,
  selectedBookFileName,
  summarizeImportFailureOutcomes,
  useBookImport,
} from '@/hooks/useBookImport';
import type { SelectedFile } from '@/hooks/useFileSelector';

describe('useBookImport import outcomes', () => {
  beforeEach(() => {
    mockLibraryLimitState.canAddBook = false;
    mockLibraryLimitState.libraryLimit = null;
    mockLibraryLimitState.isLoading = false;
    mockLibraryLimitState.isResolved = false;
    mockLibraryLimitState.error = null;
  });

  it('keeps import unavailable with an honest reason when the library limit fails to resolve', () => {
    mockLibraryLimitState.error = new Error('tier config unavailable');

    const { result } = renderHook(() => useBookImport());

    expect(result.current.canAddBook).toBe(false);
    expect(result.current.importDisabled).toBe(true);
    expect(result.current.importDisabledReason).toBe(
      'Unable to verify your library limit. Please try again.',
    );
  });

  it('preserves resolved denial messaging when the library limit is reached', () => {
    mockLibraryLimitState.libraryLimit = 10;
    mockLibraryLimitState.isResolved = true;

    const { result } = renderHook(() => useBookImport());

    expect(result.current.canAddBook).toBe(false);
    expect(result.current.importDisabled).toBe(true);
    expect(result.current.importDisabledReason).toBe('Library limit reached.');
  });

  it('enables import only after an allowed library limit resolves', () => {
    mockLibraryLimitState.canAddBook = true;
    mockLibraryLimitState.libraryLimit = 10;
    mockLibraryLimitState.isResolved = true;

    const { result } = renderHook(() => useBookImport());

    expect(result.current.importDisabled).toBe(false);
    expect(result.current.importDisabledReason).toBeNull();
  });

  it('derives picker support from the canonical Stage 1 upload set', () => {
    expect(SUPPORTED_BOOK_EXTS).toEqual(PLATFORM_UPLOAD_FORMATS);
    for (const format of PLATFORM_UPLOAD_FORMATS) {
      expect(isSupportedSelectedBookFile({ path: `/books/test.${format}` })).toBe(true);
    }
    for (const format of ['azw', 'fbz', 'txt', 'md', 'zip']) {
      expect(isSupportedSelectedBookFile({ path: `/books/test.${format}` })).toBe(false);
    }
  });

  it('uses only the safe file label for selected paths', () => {
    expect(selectedBookFileName({ path: '/Users/private/Books/example.epub' })).toBe(
      'example.epub',
    );
  });

  it('records unsupported skipped files with a safe bucket and copy', () => {
    const outcome = createUnsupportedImportOutcome({ path: '/Users/private/Books/example.exe' });

    expect(outcome).toEqual({
      fileName: 'example.exe',
      status: 'skipped',
      reason: 'unsupported-format',
      userBucket: 'unsupported-format',
      userMessage: 'This file format is not supported.',
    });
  });

  it('preserves the library-limit reason without embedding an upgrade nudge', () => {
    const outcome = createLibraryLimitImportOutcome({
      path: '/Users/private/Books/blocked.epub',
    });

    expect(outcome).toEqual({
      fileName: 'blocked.epub',
      status: 'skipped',
      reason: 'library-limit',
      userMessage: 'Library limit reached.',
    });
  });

  it('keeps unresolved entitlement skips distinct from a reached limit', () => {
    const outcome = createLibraryLimitUnavailableImportOutcome({
      path: '/Users/private/Books/unverified.epub',
    });

    expect(outcome).toEqual({
      fileName: 'unverified.epub',
      status: 'skipped',
      reason: 'library-limit-unavailable',
      userMessage: 'Unable to verify your library limit. Please try again.',
    });
  });

  it('records failed files with the exact internal reason and no raw path leakage', () => {
    const selectedFile: SelectedFile = { path: '/Users/private/Books/bad.epub' };
    const outcome = createFailedImportOutcome(
      selectedFile,
      new ImportFailureError(
        'book-encrypted-or-protected',
        new Error('/Users/private/Books/bad.epub'),
      ),
    );

    expect(outcome.fileName).toBe('bad.epub');
    expect(outcome.status).toBe('failed');
    expect(outcome.reason).toBe('book-encrypted-or-protected');
    expect(outcome.userBucket).toBe('corrupted-unreadable-protected');
    expect(outcome.userMessage).toBe('This book is corrupted, unreadable, or protected.');
    expect(JSON.stringify(outcome)).not.toContain('/Users/private');
  });

  it('summarizes failures by safe user-facing copy', () => {
    const summary = summarizeImportFailureOutcomes([
      createFailedImportOutcome(
        { file: new File(['x'], 'bad.epub') },
        new ImportFailureError('book-parse-failed'),
      ),
      createFailedImportOutcome(
        { file: new File(['x'], 'full.epub') },
        new ImportFailureError('device-storage-full'),
      ),
    ]);

    expect(summary).toBe(
      '2 files failed to import. 1 This book is corrupted, unreadable, or protected. 1 Device storage is full or unavailable.',
    );
  });
});

describe('useBookImport post-import backup ownership', () => {
  const book: Book = {
    hash: testOpenReadBookRef('0123456789abcdef0123456789abcdef'),
    title: 'Imported PDF',
    author: 'OpenRead',
    format: 'pdf',
    createdAt: 1,
    updatedAt: 1,
  };

  beforeEach(() => {
    mockLibraryLimitState.canAddBook = true;
    mockLibraryLimitState.libraryLimit = 10;
    mockLibraryLimitState.isResolved = true;
    mockLibraryLimitState.isLoading = false;
    mockLibraryLimitState.error = null;
    useLibraryStore.setState({ library: [] });
    useSettingsStore.setState((state) => ({
      settings: { ...state.settings, autoUpload: true },
    }));
    useTransferStore.setState({ transfers: {}, isQueuePaused: true, activeCount: 0 });

    const manager = transferManager as unknown as {
      appService: unknown;
      getLibrary: (() => Book[]) | null;
      updateBook: ((book: Book) => Promise<void>) | null;
      _: (key: string, vars?: Record<string, string>) => string;
      isInitialized: boolean;
      initializationPromise: Promise<void> | null;
      currentOwnerUserId: string | null;
      recoveredTerminalBackgroundUploadIds: Set<string>;
    };
    manager.appService = {
      uploadBook: vi.fn(async () => {
        throw new Error('STORAGE_LIMIT_REACHED');
      }),
      downloadBook: vi.fn(async () => {}),
    };
    manager.getLibrary = () => useLibraryStore.getState().library;
    manager.updateBook = vi.fn(async () => {});
    manager._ = (key, vars) => (vars?.['title'] ? key.replace('{{title}}', vars['title']) : key);
    manager.isInitialized = true;
    manager.initializationPromise = Promise.resolve();
    manager.currentOwnerUserId = 'user-a';
    manager.recoveredTerminalBackgroundUploadIds = new Set();

    mockEnv.appService = {
      importBook: vi.fn(async (_file: File | string, library: Book[]) => {
        library.push(book);
        useTransferStore.getState().addTransfer(book.hash, book.title, 'upload', 1, true, 'user-a');
      }),
      saveLibraryBooks: vi.fn(async () => {}),
    };
  });

  afterEach(() => {
    mockEnv.appService = null;
    useTransferStore.setState({ transfers: {}, isQueuePaused: false, activeCount: 0 });
    useLibraryStore.setState({ library: [] });
    vi.restoreAllMocks();
  });

  it('keeps the existing post-import upload in the background when cloud backup fails', async () => {
    const dispatchSpy = vi.spyOn(eventDispatcher, 'dispatch');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useBookImport());

    await act(async () => {
      await result.current.importSelectedBookFiles([
        { file: new File(['%PDF-1.4'], 'imported.pdf', { type: 'application/pdf' }) },
      ]);
    });

    const queuedTransfer = Object.values(useTransferStore.getState().transfers)[0]!;
    await (
      transferManager as unknown as {
        executeTransfer: (transfer: TransferItem) => Promise<void>;
      }
    ).executeTransfer(queuedTransfer);

    const failedTransfer = useTransferStore.getState().transfers[queuedTransfer.id]!;
    const errorToasts = dispatchSpy.mock.calls.filter(
      ([eventName, detail]) =>
        eventName === 'toast' && (detail as { type?: string } | undefined)?.type === 'error',
    );

    expect.soft(failedTransfer).toMatchObject({
      status: 'failed',
      error: 'STORAGE_LIMIT_REACHED',
      retryCount: 0,
      isBackground: true,
    });
    expect.soft(errorToasts).toEqual([]);
  });
});
