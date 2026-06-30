export const IMPORT_FAILURE_REASONS = [
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

export type ImportFailureReason = (typeof IMPORT_FAILURE_REASONS)[number];

export type ImportFailureUserBucket =
  | 'unsupported-format'
  | 'file-empty'
  | 'read-permission-issue'
  | 'corrupted-unreadable-protected'
  | 'device-storage-full-unavailable'
  | 'try-again';

export interface ImportFailurePresentation {
  bucket: ImportFailureUserBucket;
  message: string;
}

export class ImportFailureError extends Error {
  readonly reason: ImportFailureReason;
  readonly bucket: ImportFailureUserBucket;
  readonly userMessage: string;
  readonly cause?: unknown;

  constructor(reason: ImportFailureReason, cause?: unknown) {
    const presentation = getImportFailurePresentation(reason);
    super(presentation.message);
    this.name = 'ImportFailureError';
    this.reason = reason;
    this.bucket = presentation.bucket;
    this.userMessage = presentation.message;
    this.cause = cause;
  }
}

export function getImportFailurePresentation(
  reason: ImportFailureReason,
): ImportFailurePresentation {
  switch (reason) {
    case 'unsupported-format':
      return { bucket: 'unsupported-format', message: 'This file format is not supported.' };
    case 'file-empty':
      return { bucket: 'file-empty', message: 'This file is empty.' };
    case 'file-access-denied':
    case 'file-read-failed':
      return {
        bucket: 'read-permission-issue',
        message: 'Openread could not read this file. Check file permissions and try again.',
      };
    case 'txt-conversion-failed':
    case 'book-parse-failed':
    case 'book-encrypted-or-protected':
    case 'cover-extraction-failed':
      return {
        bucket: 'corrupted-unreadable-protected',
        message: 'This book is corrupted, unreadable, or protected.',
      };
    case 'device-storage-full':
      return {
        bucket: 'device-storage-full-unavailable',
        message: 'Device storage is full or unavailable.',
      };
    case 'local-hash-failed':
    case 'platform-hash-failed':
    case 'book-file-write-failed':
    case 'cover-file-write-failed':
    case 'book-config-save-failed':
    case 'library-index-save-failed':
      return {
        bucket: 'try-again',
        message: 'Import failed. Please try again.',
      };
  }
}

export function toImportFailureError(
  error: unknown,
  fallbackReason: ImportFailureReason,
): ImportFailureError {
  if (error instanceof ImportFailureError) return error;
  if (isDeviceStorageFullError(error)) {
    return new ImportFailureError('device-storage-full', error);
  }
  return new ImportFailureError(fallbackReason, error);
}

export function classifyFileReadFailure(error: unknown): ImportFailureError {
  return new ImportFailureError(
    isAccessDeniedError(error) ? 'file-access-denied' : 'file-read-failed',
    error,
  );
}

export function classifyBookParseFailure(error: unknown): ImportFailureError {
  if (error instanceof ImportFailureError) return error;
  return new ImportFailureError(
    isEncryptedOrProtectedBookError(error) ? 'book-encrypted-or-protected' : 'book-parse-failed',
    error,
  );
}

function isAccessDeniedError(error: unknown): boolean {
  const text = getErrorText(error);
  return /access[ -]?denied|permission|notallowed|not allowed|securityerror|eacces|eperm/i.test(
    text,
  );
}

function isEncryptedOrProtectedBookError(error: unknown): boolean {
  const text = getErrorText(error);
  return /encrypted|protected|password|drm|locked/i.test(text);
}

function isDeviceStorageFullError(error: unknown): boolean {
  const text = getErrorText(error);
  return /quota|storage full|no space|not enough space|disk full|enospc|quotaexceeded/i.test(text);
}

function getErrorText(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`;
  return String(error);
}
