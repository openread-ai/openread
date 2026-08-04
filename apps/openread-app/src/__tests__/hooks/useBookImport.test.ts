import { describe, expect, it } from 'vitest';
import { ImportFailureError } from '@/services/importFailure';
import {
  createFailedImportOutcome,
  createLibraryLimitImportOutcome,
  createUnsupportedImportOutcome,
  selectedBookFileName,
  summarizeImportFailureOutcomes,
} from '@/hooks/useBookImport';
import type { SelectedFile } from '@/hooks/useFileSelector';

describe('useBookImport import outcomes', () => {
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
