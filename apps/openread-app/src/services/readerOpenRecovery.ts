import { DocumentLoader } from '@/libs/document';
import type { AppService } from '@/types/system';
import type { Book, BookContent } from '@/types/book';
import type { ProgressHandler } from '@/utils/transfer';
import { createLogger } from '@/utils/logger';

const logger = createLogger('readerOpenRecovery');

type ReaderOpenDocument = Awaited<ReturnType<DocumentLoader['open']>>;

export type ReaderOpenResult = {
  content: BookContent;
  doc: ReaderOpenDocument;
  recovered: boolean;
};

const canRecoverReaderOpen = (book: Book): boolean => Boolean(book.storagePath || book.uploadedAt);

const loadContent = async (
  appService: AppService,
  book: Book,
  onProgress?: ProgressHandler,
): Promise<BookContent> => (await appService.loadBookContent(book, onProgress)) as BookContent;

const openContent = async (content: BookContent): Promise<ReaderOpenDocument> =>
  new DocumentLoader(content.file).open();

const closeContent = async (content: BookContent): Promise<void> => {
  const closable = content.file as File & { close?: () => Promise<void> | void };
  await closable.close?.();
};

export const loadReaderOpenDocument = async (
  appService: AppService,
  book: Book,
  onProgress?: ProgressHandler,
): Promise<ReaderOpenResult> => {
  const content = await loadContent(appService, book, onProgress);

  try {
    return { content, doc: await openContent(content), recovered: false };
  } catch (openError) {
    if (!canRecoverReaderOpen(book)) {
      await closeContent(content);
      throw openError;
    }

    logger.warn('Reader open failed; attempting one verified redownload recovery', {
      hash: book.hash,
      storagePath: book.storagePath,
      uploadedAt: book.uploadedAt,
      error: openError,
    });

    await closeContent(content);
    const recoveredContent = await appService.redownloadBookContent(book, onProgress);

    try {
      return {
        content: recoveredContent,
        doc: await openContent(recoveredContent),
        recovered: true,
      };
    } catch (reopenError) {
      await closeContent(recoveredContent);
      logger.warn('Reader open recovery failed after verified redownload', {
        hash: book.hash,
        error: reopenError,
      });
      throw reopenError;
    }
  }
};
