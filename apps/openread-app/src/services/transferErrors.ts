export const TRANSFER_LIBRARY_BOOK_MISSING_CODE = 'TRANSFER_LIBRARY_BOOK_MISSING';

export type TransferErrorReason =
  | 'not-authenticated'
  | 'storage-limit-reached'
  | 'storage-not-available'
  | 'library-limit-reached'
  | 'library-book-missing'
  | 'local-file-missing'
  | 'network-error'
  | 'platform-incident'
  | 'unclassified-retryable';

export interface TransferErrorClassification {
  reason: TransferErrorReason;
  retryable: boolean;
  incident: boolean;
}

export function classifyTransferError(errorMessage: string): TransferErrorClassification {
  if (
    errorMessage.includes('Not authenticated') ||
    errorMessage.includes('UNAUTHORIZED') ||
    /HTTP 401\b/.test(errorMessage)
  ) {
    return { reason: 'not-authenticated', retryable: false, incident: false };
  }
  if (
    errorMessage.includes('STORAGE_LIMIT_REACHED') ||
    errorMessage.includes('Insufficient storage quota') ||
    errorMessage.includes('Storage limit reached')
  ) {
    return { reason: 'storage-limit-reached', retryable: false, incident: false };
  }
  if (errorMessage.includes('STORAGE_NOT_AVAILABLE')) {
    return { reason: 'storage-not-available', retryable: false, incident: false };
  }
  if (errorMessage.includes('LIBRARY_LIMIT_REACHED') || errorMessage.includes('Library limit')) {
    return { reason: 'library-limit-reached', retryable: false, incident: false };
  }
  if (errorMessage === TRANSFER_LIBRARY_BOOK_MISSING_CODE) {
    return { reason: 'library-book-missing', retryable: false, incident: false };
  }
  if (errorMessage.includes('Book file not uploaded')) {
    return { reason: 'local-file-missing', retryable: false, incident: true };
  }
  if (/Failed to fetch|NetworkError|network|Load failed/i.test(errorMessage)) {
    return { reason: 'network-error', retryable: true, incident: false };
  }
  if (
    errorMessage.includes('STORAGE_SCHEMA_UNAVAILABLE') ||
    errorMessage.includes('INTERNAL_ERROR') ||
    /HTTP 5\d\d\b/.test(errorMessage)
  ) {
    return { reason: 'platform-incident', retryable: true, incident: true };
  }

  return { reason: 'unclassified-retryable', retryable: true, incident: true };
}
