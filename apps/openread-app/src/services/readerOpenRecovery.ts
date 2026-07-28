import { DocumentLoader } from '@/libs/document';
import type { AppService } from '@/types/system';
import type { Book, BookContent } from '@/types/book';
import type { ProgressHandler } from '@/utils/transfer';
import { createLogger } from '@/utils/logger';
import { isCatalogBackedBook } from '@/utils/book';
import { useLibraryStore } from '@/store/libraryStore';

const logger = createLogger('readerOpenRecovery');

type ReaderOpenDocument = Awaited<ReturnType<DocumentLoader['open']>>;

export type ReaderOpenLifecycleGuard = {
  signal: AbortSignal;
  assertCurrent: () => void;
  dispose: () => void;
};

function readerOpenLifecycleError(): DOMException {
  return new DOMException(
    'Reader open cancelled because the library context changed.',
    'AbortError',
  );
}

export function createReaderOpenLifecycleGuard(book: Book): ReaderOpenLifecycleGuard {
  const controller = new AbortController();
  if (!isCatalogBackedBook(book)) {
    return { signal: controller.signal, assertCurrent: () => undefined, dispose: () => undefined };
  }

  const initial = useLibraryStore.getState();
  const ownerUserId = initial.libraryOwnerUserId;
  const isCurrent = () => {
    const current = useLibraryStore.getState();
    return Boolean(
      ownerUserId &&
      current.libraryOwnerUserId === ownerUserId &&
      current.library.some((candidate) => candidate.hash === book.hash && !candidate.deletedAt),
    );
  };
  const assertCurrent = () => {
    if (controller.signal.aborted || !isCurrent()) throw readerOpenLifecycleError();
  };

  assertCurrent();
  const unsubscribe = useLibraryStore.subscribe(() => {
    if (!isCurrent()) controller.abort();
  });
  return { signal: controller.signal, assertCurrent, dispose: unsubscribe };
}

export type ReaderOpenResult = {
  content: BookContent;
  doc: ReaderOpenDocument;
  recovered: boolean;
};

const canRecoverReaderOpen = (book: Book): boolean =>
  Boolean(isCatalogBackedBook(book) || book.uploadedAt);

const loadContent = async (
  appService: AppService,
  book: Book,
  onProgress?: ProgressHandler,
  lifecycleSignal?: AbortSignal,
): Promise<BookContent> =>
  (await (lifecycleSignal
    ? appService.loadBookContent(book, onProgress, lifecycleSignal)
    : appService.loadBookContent(book, onProgress))) as BookContent;

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
  lifecycleSignal?: AbortSignal,
): Promise<ReaderOpenResult> => {
  const content = await loadContent(appService, book, onProgress, lifecycleSignal);

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
    const recoveredContent = lifecycleSignal
      ? await appService.redownloadBookContent(book, onProgress, lifecycleSignal)
      : await appService.redownloadBookContent(book, onProgress);

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
