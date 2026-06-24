'use client';

import { useCallback, useEffect } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useFileSelector, type SelectedFile } from '@/hooks/useFileSelector';
import { useLibraryLimit } from '@/hooks/useLibraryLimit';
import { useSync } from '@/hooks/useSync';
import { SUPPORTED_BOOK_EXTS } from '@/services/constants';
import { transferManager } from '@/services/transferManager';
import { useSettingsStore } from '@/store/settingsStore';
import { useLibraryStore } from '@/store/libraryStore';
import { enqueueBooksForSync } from '@/services/sync/helpers';
import { eventDispatcher } from '@/utils/event';
import { createLogger } from '@/utils/logger';
import { useTranslation } from './useTranslation';
import type { Book } from '@/types/book';

const logger = createLogger('book-import');

const UNSUPPORTED_BOOK_FILES_MESSAGE =
  'No supported book files found. Supported formats: EPUB, PDF, MOBI, FB2, CBZ, AZW, TXT';

export interface BookImportResult {
  successCount: number;
  failCount: number;
  skippedForLimitCount: number;
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

export function useBookImport() {
  const _ = useTranslation();
  const { appService } = useEnv();
  const { selectFiles } = useFileSelector(appService, _);
  const { syncBooks } = useSync();
  const { canAddBook, libraryLimit, upgradePriceCents, upgradeTierName } = useLibraryLimit();

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

  const warnLibraryFull = useCallback(() => {
    eventDispatcher.dispatch('toast', {
      type: 'warning',
      message: `Library full (${libraryLimit} books). Upgrade for unlimited.`,
    });
  }, [libraryLimit]);

  const importSelectedBookFiles = useCallback(
    async (files: SelectedFile[]): Promise<BookImportResult> => {
      if (!appService || files.length === 0) {
        return { successCount: 0, failCount: 0, skippedForLimitCount: 0 };
      }

      if (!canAddBook) {
        warnLibraryFull();
        return { successCount: 0, failCount: 0, skippedForLimitCount: files.length };
      }

      let successCount = 0;
      let failCount = 0;
      let skippedForLimitCount = 0;

      const activeBefore = new Set(
        useLibraryStore
          .getState()
          .getVisibleLibrary()
          .map((b) => b.hash),
      );
      const remainingSlots =
        libraryLimit === null ? files.length : Math.max(libraryLimit - activeBefore.size, 0);
      if (remainingSlots <= 0) {
        warnLibraryFull();
        return { successCount: 0, failCount: 0, skippedForLimitCount: files.length };
      }

      for (const [index, selectedFile] of files.entries()) {
        const activeCount = useLibraryStore.getState().getVisibleLibrary().length;
        if (libraryLimit !== null && activeCount >= libraryLimit) {
          skippedForLimitCount = files.length - index;
          break;
        }

        try {
          const fileInput = selectedFile.file || selectedFile.path;
          if (!fileInput) {
            failCount++;
            continue;
          }
          const { library } = useLibraryStore.getState();
          await appService.importBook(fileInput, library);
          successCount++;
        } catch (error) {
          logger.error('Failed to import file', error);
          failCount++;
        }
      }

      const { library, setLibrary } = useLibraryStore.getState();
      setLibrary([...library]);
      void appService.saveLibraryBooks(library);

      const uploadCandidates = useLibraryStore
        .getState()
        .getVisibleLibrary()
        .filter((book) => !book.deletedAt && !book.uploadedAt);
      if (useSettingsStore.getState().settings.autoUpload !== false) {
        transferManager.queueBatchUploads(uploadCandidates, 1);
      }

      const newBooks = useLibraryStore
        .getState()
        .getVisibleLibrary()
        .filter((b) => !activeBefore.has(b.hash));
      if (newBooks.length > 0) {
        void enqueueBooksForSync(newBooks);
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
          message: `${failCount} ${failCount === 1 ? 'file' : 'files'} failed to import`,
        });
      }
      if (skippedForLimitCount > 0) {
        warnLibraryFull();
      }

      return { successCount, failCount, skippedForLimitCount };
    },
    [appService, canAddBook, libraryLimit, warnLibraryFull],
  );

  const openImportPicker = useCallback(async (): Promise<BookImportResult> => {
    if (!canAddBook) {
      warnLibraryFull();
      return { successCount: 0, failCount: 0, skippedForLimitCount: 0 };
    }

    try {
      const result = await selectFiles({ type: 'books', multiple: true });
      if (result.error) {
        eventDispatcher.dispatch('toast', {
          type: 'error',
          message: 'Failed to select files',
        });
        return { successCount: 0, failCount: 0, skippedForLimitCount: 0 };
      }
      if (result.files.length === 0) {
        return { successCount: 0, failCount: 0, skippedForLimitCount: 0 };
      }

      const supportedFiles = result.files.filter(isSupportedSelectedBookFile);
      if (supportedFiles.length === 0) {
        eventDispatcher.dispatch('toast', {
          type: 'warning',
          message: _(UNSUPPORTED_BOOK_FILES_MESSAGE),
        });
        return { successCount: 0, failCount: 0, skippedForLimitCount: 0 };
      }
      if (supportedFiles.length < result.files.length) {
        const unsupportedCount = result.files.length - supportedFiles.length;
        eventDispatcher.dispatch('toast', {
          type: 'warning',
          message: `${unsupportedCount} ${unsupportedCount === 1 ? 'file was' : 'files were'} skipped because the format is not supported`,
        });
      }
      return importSelectedBookFiles(supportedFiles);
    } catch (error) {
      logger.error('Import failed', error);
      eventDispatcher.dispatch('toast', {
        type: 'error',
        message: 'Import failed. Please try again.',
      });
      return { successCount: 0, failCount: 1, skippedForLimitCount: 0 };
    }
  }, [selectFiles, importSelectedBookFiles, _, canAddBook, warnLibraryFull]);

  return {
    canAddBook,
    importDisabled: !canAddBook,
    libraryLimit,
    upgradePriceCents,
    upgradeTierName,
    importSelectedBookFiles,
    openImportPicker,
  };
}
