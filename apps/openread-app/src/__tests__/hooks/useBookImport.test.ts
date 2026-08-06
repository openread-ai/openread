import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportFailureError } from '@/services/importFailure';

const mockLibraryLimitState = vi.hoisted(() => ({
  canAddBook: false,
  libraryLimit: null as number | null,
  currentCount: 0,
  plan: 'free' as const,
  isLoading: false,
  isResolved: false,
  error: null as Error | null,
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: null }),
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
