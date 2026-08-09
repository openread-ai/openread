'use client';

import { useCallback, useEffect } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useFileSelector, type SelectedFile } from '@/hooks/useFileSelector';
import { useLibraryLimit } from '@/hooks/useLibraryLimit';
import { useSync } from '@/hooks/useSync';
import { SUPPORTED_BOOK_EXTS, UNSUPPORTED_BOOK_FILES_MESSAGE } from '@/services/constants';
import { createImportBookContext } from '@/services/appService';
import { transferManager } from '@/services/transferManager';
import { useSettingsStore } from '@/store/settingsStore';
import { useLibraryStore } from '@/store/libraryStore';
import { enqueueBooksForSync, handleFireAndForgetSyncEnqueue } from '@/services/sync/helpers';
import { eventDispatcher } from '@/utils/event';
import { createLogger } from '@/utils/logger';
import { useTranslation } from './useTranslation';
import { ImportFailureError, getImportFailurePresentation } from '@/services/importFailure';
import type { ImportFailureReason, ImportFailureUserBucket } from '@/services/importFailure';
import type { Book } from '@/types/book';

const logger = createLogger('book-import');

export type BookImportSkippedReason =
  | 'unsupported-format'
  | 'library-limit'
  | 'library-limit-unavailable';

export type BookImportOutcome =
  | {
      fileName: string;
      status: 'imported';
    }
  | {
      fileName: string;
      status: 'failed';
      reason: ImportFailureReason;
      userBucket: ImportFailureUserBucket;
      userMessage: string;
    }
  | {
      fileName: string;
      status: 'skipped';
      reason: BookImportSkippedReason;
      userBucket?: ImportFailureUserBucket;
      userMessage: string;
    };

export interface BookImportResult {
  successCount: number;
  failCount: number;
  skippedForLimitCount: number;
  outcomes: BookImportOutcome[];
  libraryIndexSaveFailure?: {
    reason: Extract<ImportFailureReason, 'library-index-save-failed'>;
    userBucket: ImportFailureUserBucket;
    userMessage: string;
  };
}

export function selectedBookFileName(selectedFile: SelectedFile): string {
  const rawName = selectedFile.file?.name ?? selectedFile.path ?? selectedFile.basePath ?? '';
  return rawName.split(/[\\/]/).pop() ?? rawName;
}

export function isSupportedSelectedBookFile(selectedFile: SelectedFile): boolean {
  const ext = selectedBookFileName(selectedFile).split('.').pop()?.toLowerCase() || '';
  return SUPPORTED_BOOK_EXTS.includes(ext);
}

export function selectedFilesFromFileList(files: File[]): SelectedFile[] {
  return files.map((file) => ({ file }));
}

export function createFailedImportOutcome(
  selectedFile: SelectedFile,
  error: unknown,
): Extract<BookImportOutcome, { status: 'failed' }> {
  const importError =
    error instanceof ImportFailureError
      ? error
      : new ImportFailureError('book-parse-failed', error);
  return {
    fileName: selectedBookFileName(selectedFile),
    status: 'failed',
    reason: importError.reason,
    userBucket: importError.bucket,
    userMessage: importError.userMessage,
  };
}

export function createUnsupportedImportOutcome(
  selectedFile: SelectedFile,
): Extract<BookImportOutcome, { status: 'skipped' }> {
  const presentation = getImportFailurePresentation('unsupported-format');
  return {
    fileName: selectedBookFileName(selectedFile),
    status: 'skipped',
    reason: 'unsupported-format',
    userBucket: presentation.bucket,
    userMessage: presentation.message,
  };
}

export function createLibraryLimitImportOutcome(
  selectedFile: SelectedFile,
): Extract<BookImportOutcome, { status: 'skipped' }> {
  return {
    fileName: selectedBookFileName(selectedFile),
    status: 'skipped',
    reason: 'library-limit',
    userMessage: 'Library limit reached.',
  };
}

export function createLibraryLimitUnavailableImportOutcome(
  selectedFile: SelectedFile,
): Extract<BookImportOutcome, { status: 'skipped' }> {
  return {
    fileName: selectedBookFileName(selectedFile),
    status: 'skipped',
    reason: 'library-limit-unavailable',
    userMessage: 'Unable to verify your library limit. Please try again.',
  };
}

export function summarizeImportFailureOutcomes(outcomes: BookImportOutcome[]): string | null {
  const failed = outcomes.filter((outcome) => outcome.status === 'failed');
  if (failed.length === 0) return null;

  const bucketCounts = new Map<string, number>();
  for (const outcome of failed) {
    bucketCounts.set(outcome.userMessage, (bucketCounts.get(outcome.userMessage) ?? 0) + 1);
  }

  const summary = [...bucketCounts.entries()]
    .map(([message, count]) => `${count} ${message}`)
    .join(' ');
  return `${failed.length} ${failed.length === 1 ? 'file' : 'files'} failed to import. ${summary}`;
}

export function useBookImport() {
  const _ = useTranslation();
  const { appService } = useEnv();
  const { selectFiles } = useFileSelector(appService, _);
  const { syncBooks } = useSync();
  const {
    canAddBook,
    libraryLimit,
    isLoading: isLibraryLimitLoading,
    isResolved: isLibraryLimitResolved,
    error: libraryLimitError,
  } = useLibraryLimit();
  // Server writers enforce library limits, but the client does not surface
  // LIBRARY_LIMIT_REACHED sync conflicts yet. Keep unresolved imports blocked so a book
  // cannot appear locally while silently failing to sync.
  const importDisabled = !canAddBook;
  const importDisabledReason = !isLibraryLimitResolved
    ? isLibraryLimitLoading
      ? 'Checking your library limit...'
      : 'Unable to verify your library limit. Please try again.'
    : importDisabled
      ? 'Library limit reached.'
      : null;

  useEffect(() => {
    const handleTransferComplete = async (event: CustomEvent) => {
      const { book, type } = event.detail as { book: Book; type: string };
      if (type === 'upload' && book.uploadedAt) {
        logger.info('Pushing uploadedAt to server after upload', { hash: book.hash });
        await syncBooks([book], 'push');
      }
    };
    eventDispatcher.on('transfer-completed', handleTransferComplete);
    return () => {
      eventDispatcher.off('transfer-completed', handleTransferComplete);
    };
  }, [syncBooks]);

  const warnImportBlocked = useCallback(() => {
    eventDispatcher.dispatch('toast', {
      type: 'warning',
      message: importDisabledReason ?? 'Library limit reached.',
    });
  }, [importDisabledReason]);

  const importSelectedBookFiles = useCallback(
    async (files: SelectedFile[]): Promise<BookImportResult> => {
      if (!appService || files.length === 0) {
        return { successCount: 0, failCount: 0, skippedForLimitCount: 0, outcomes: [] };
      }

      if (!canAddBook) {
        warnImportBlocked();
        return {
          successCount: 0,
          failCount: 0,
          skippedForLimitCount: files.length,
          outcomes: files.map((file) =>
            isLibraryLimitResolved
              ? createLibraryLimitImportOutcome(file)
              : createLibraryLimitUnavailableImportOutcome(file),
          ),
        };
      }

      let successCount = 0;
      let failCount = 0;
      let skippedForLimitCount = 0;
      const outcomes: BookImportOutcome[] = [];

      const libraryBeforeImport = useLibraryStore.getState().library;
      const importContext = createImportBookContext(libraryBeforeImport);
      const activeBefore = new Set(
        useLibraryStore
          .getState()
          .getVisibleLibrary()
          .map((b) => b.hash),
      );
      const remainingSlots =
        libraryLimit === null ? files.length : Math.max(libraryLimit - activeBefore.size, 0);
      if (remainingSlots <= 0) {
        warnImportBlocked();
        return {
          successCount: 0,
          failCount: 0,
          skippedForLimitCount: files.length,
          outcomes: files.map((file) => createLibraryLimitImportOutcome(file)),
        };
      }

      for (const [index, selectedFile] of files.entries()) {
        const activeCount = useLibraryStore.getState().getVisibleLibrary().length;
        if (libraryLimit !== null && activeCount >= libraryLimit) {
          skippedForLimitCount = files.length - index;
          outcomes.push(...files.slice(index).map((file) => createLibraryLimitImportOutcome(file)));
          break;
        }

        try {
          const fileInput = selectedFile.file || selectedFile.path;
          if (!fileInput) {
            failCount++;
            outcomes.push(
              createFailedImportOutcome(selectedFile, new ImportFailureError('file-read-failed')),
            );
            continue;
          }
          const { library } = useLibraryStore.getState();
          await appService.importBook(fileInput, library, true, true, false, importContext);
          successCount++;
          outcomes.push({ fileName: selectedBookFileName(selectedFile), status: 'imported' });
        } catch (error) {
          logger.error('Failed to import file', error);
          failCount++;
          outcomes.push(createFailedImportOutcome(selectedFile, error));
        }
      }

      const { library, setLibrary } = useLibraryStore.getState();
      setLibrary([...library]);
      let libraryIndexSaveFailure: BookImportResult['libraryIndexSaveFailure'];
      try {
        await appService.saveLibraryBooks(library);
      } catch (error) {
        const failure = new ImportFailureError('library-index-save-failed', error);
        logger.error('Failed to save library index after import', failure);
        libraryIndexSaveFailure = {
          reason: 'library-index-save-failed',
          userBucket: failure.bucket,
          userMessage: failure.userMessage,
        };
      }

      const uploadCandidates = useLibraryStore
        .getState()
        .getVisibleLibrary()
        .filter((book) => !book.deletedAt && !book.uploadedAt);
      if (useSettingsStore.getState().settings.autoUpload !== false) {
        transferManager.queueBatchUploads(uploadCandidates, 1, true);
      }

      const newBooks = useLibraryStore
        .getState()
        .getVisibleLibrary()
        .filter((b) => !activeBefore.has(b.hash));
      if (newBooks.length > 0) {
        handleFireAndForgetSyncEnqueue(enqueueBooksForSync(newBooks), {
          source: 'book-import.addImportedBooks',
          mutationType: 'book',
          operation: 'upsert',
          count: newBooks.length,
        });
      }

      if (successCount > 0) {
        eventDispatcher.dispatch('toast', {
          type: 'info',
          message: `${successCount} ${successCount === 1 ? 'book' : 'books'} imported successfully`,
        });
      }
      if (failCount > 0) {
        eventDispatcher.dispatch('toast', {
          type: 'error',
          message:
            summarizeImportFailureOutcomes(outcomes) ??
            `${failCount} ${failCount === 1 ? 'file' : 'files'} failed to import`,
        });
      }
      if (skippedForLimitCount > 0) {
        warnImportBlocked();
      }

      return { successCount, failCount, skippedForLimitCount, outcomes, libraryIndexSaveFailure };
    },
    [appService, canAddBook, isLibraryLimitResolved, libraryLimit, warnImportBlocked],
  );

  const openImportPicker = useCallback(async (): Promise<BookImportResult> => {
    if (!canAddBook) {
      warnImportBlocked();
      return { successCount: 0, failCount: 0, skippedForLimitCount: 0, outcomes: [] };
    }

    try {
      const result = await selectFiles({ type: 'books', multiple: true });
      if (result.error) {
        eventDispatcher.dispatch('toast', {
          type: 'error',
          message: 'Failed to select files',
        });
        return { successCount: 0, failCount: 0, skippedForLimitCount: 0, outcomes: [] };
      }
      if (result.files.length === 0) {
        return { successCount: 0, failCount: 0, skippedForLimitCount: 0, outcomes: [] };
      }

      const supportedFiles = result.files.filter(isSupportedSelectedBookFile);
      const unsupportedOutcomes = result.files
        .filter((file) => !isSupportedSelectedBookFile(file))
        .map(createUnsupportedImportOutcome);
      if (supportedFiles.length === 0) {
        eventDispatcher.dispatch('toast', {
          type: 'warning',
          message: _(UNSUPPORTED_BOOK_FILES_MESSAGE),
        });
        return {
          successCount: 0,
          failCount: 0,
          skippedForLimitCount: 0,
          outcomes: unsupportedOutcomes,
        };
      }
      if (supportedFiles.length < result.files.length) {
        const unsupportedCount = result.files.length - supportedFiles.length;
        eventDispatcher.dispatch('toast', {
          type: 'warning',
          message: `${unsupportedCount} ${unsupportedCount === 1 ? 'file was' : 'files were'} skipped because the format is not supported`,
        });
      }
      const importResult = await importSelectedBookFiles(supportedFiles);
      return { ...importResult, outcomes: [...unsupportedOutcomes, ...importResult.outcomes] };
    } catch (error) {
      logger.error('Import failed', error);
      eventDispatcher.dispatch('toast', {
        type: 'error',
        message: 'Import failed. Please try again.',
      });
      return { successCount: 0, failCount: 1, skippedForLimitCount: 0, outcomes: [] };
    }
  }, [selectFiles, importSelectedBookFiles, _, canAddBook, warnImportBlocked]);

  return {
    canAddBook,
    importDisabled,
    importDisabledReason,
    libraryLimit,
    isLibraryLimitLoading,
    isLibraryLimitResolved,
    libraryLimitError,
    importSelectedBookFiles,
    openImportPicker,
  };
}
