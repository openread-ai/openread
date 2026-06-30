import { describe, expect, it } from 'vitest';
import {
  IMPORT_FAILURE_REASONS,
  ImportFailureError,
  getImportFailurePresentation,
  toImportFailureError,
} from '@/services/importFailure';

const REQUIRED_REASONS = [
  'unsupported-format',
  'file-empty',
  'file-access-denied',
  'file-read-failed',
  'txt-conversion-failed',
  'book-parse-failed',
  'book-encrypted-or-protected',
  'local-hash-failed',
  'platform-hash-failed',
  'device-storage-full',
  'book-file-write-failed',
  'cover-extraction-failed',
  'cover-file-write-failed',
  'book-config-save-failed',
  'library-index-save-failed',
] as const;

describe('import failure taxonomy', () => {
  it('keeps a closed taxonomy with all required reasons', () => {
    expect(IMPORT_FAILURE_REASONS).toEqual(REQUIRED_REASONS);
    expect(IMPORT_FAILURE_REASONS).not.toContain('unknown');
    expect(IMPORT_FAILURE_REASONS).not.toContain('unclassified');
  });

  it('maps every reason to a safe user bucket and message', () => {
    for (const reason of IMPORT_FAILURE_REASONS) {
      const presentation = getImportFailurePresentation(reason);
      expect(presentation.bucket).toMatch(
        /^(unsupported-format|file-empty|read-permission-issue|corrupted-unreadable-protected|device-storage-full-unavailable|try-again)$/,
      );
      expect(presentation.message).not.toMatch(/\/Users|content:\/\/|stack|Error:/i);
    }
  });

  it('preserves exact internal reason while exposing only safe copy', () => {
    const error = new ImportFailureError(
      'file-access-denied',
      new Error('/Users/secret/book.epub'),
    );

    expect(error.reason).toBe('file-access-denied');
    expect(error.bucket).toBe('read-permission-issue');
    expect(error.message).toBe(
      'Openread could not read this file. Check file permissions and try again.',
    );
    expect(error.message).not.toContain('/Users/secret');
  });

  it('normalizes quota-style write failures to device storage full', () => {
    const error = toImportFailureError(
      new Error('QuotaExceededError: storage quota'),
      'book-file-write-failed',
    );

    expect(error.reason).toBe('device-storage-full');
    expect(error.bucket).toBe('device-storage-full-unavailable');
  });
});
