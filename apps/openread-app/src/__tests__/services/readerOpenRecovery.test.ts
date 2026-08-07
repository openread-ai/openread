import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createReaderOpenLifecycleGuard,
  loadReaderOpenDocument,
} from '@/services/readerOpenRecovery';
import { useLibraryStore } from '@/store/libraryStore';
import type { Book } from '@/types/book';
import type { AppService } from '@/types/system';
import type { ProgressHandler } from '@/utils/transfer';

const { openMock, DocumentLoaderMock } = vi.hoisted(() => {
  const open = vi.fn();
  function FakeDocumentLoader() {
    return { open };
  }
  return {
    openMock: open,
    DocumentLoaderMock: vi.fn(FakeDocumentLoader),
  };
});

vi.mock('@/libs/document', () => ({
  DocumentLoader: DocumentLoaderMock,
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  }),
}));

const createBook = (overrides: Partial<Book> = {}): Book =>
  ({
    hash: 'book-hash' as Book['hash'],
    format: 'epub',
    title: 'Test Book',
    author: 'Author',
    createdAt: 1,
    updatedAt: 1,
    uploadedAt: null,
    downloadedAt: null,
    deletedAt: null,
    ...overrides,
  }) as Book;

const createAppService = () =>
  ({
    loadBookContent: vi.fn(),
    redownloadBookContent: vi.fn(),
  }) as unknown as AppService;

const createContent = (book: Book, name: string, close = vi.fn(async () => {})) => ({
  book,
  file: Object.assign(new File([name], name), { close }),
  close,
});

const doc = { book: { metadata: { title: 'Recovered' } }, format: 'epub' };

const remoteCopyCases = Array.from({ length: 16 }, (_, mask) => ({
  label: mask.toString(2).padStart(4, '0'),
  catalogBookId: Boolean(mask & 1),
  storagePath: Boolean(mask & 2),
  catalogHash: Boolean(mask & 4),
  uploadedAt: Boolean(mask & 8),
}));

describe('loadReaderOpenDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLibraryStore.setState({ library: [], libraryOwnerUserId: null });
  });

  it('keeps same-account token refresh active and disposes its subscription', () => {
    const book = createBook({
      hash: 'catalog:7231ff9a-24b9-4074-9369-bc7f88ffb179' as Book['hash'],
      catalogBookId: '7231ff9a-24b9-4074-9369-bc7f88ffb179',
      storagePath: 'catalog/books/account-a.epub',
    });
    useLibraryStore.setState({ library: [book], libraryOwnerUserId: 'account-a' });
    const lifecycle = createReaderOpenLifecycleGuard(book);

    useLibraryStore.setState({ isSyncing: true });
    expect(lifecycle.signal.aborted).toBe(false);
    expect(() => lifecycle.assertCurrent()).not.toThrow();

    lifecycle.dispose();
    useLibraryStore.setState({ library: [{ ...book }], libraryOwnerUserId: 'account-b' });
    expect(lifecycle.signal.aborted).toBe(false);
  });

  it('keeps the open current when the same account re-merges the same catalog book', () => {
    const book = createBook({
      hash: 'catalog:7231ff9a-24b9-4074-9369-bc7f88ffb179' as Book['hash'],
      catalogBookId: '7231ff9a-24b9-4074-9369-bc7f88ffb179',
      storagePath: 'catalog/books/account-a.epub',
    });
    useLibraryStore.setState({ library: [book], libraryOwnerUserId: 'account-a' });
    const lifecycle = createReaderOpenLifecycleGuard(book);

    useLibraryStore.setState({
      library: [{ ...book, title: 'Re-merged Test Book' }],
      libraryOwnerUserId: 'account-a',
    });

    expect(lifecycle.signal.aborted).toBe(false);
    expect(() => lifecycle.assertCurrent()).not.toThrow();
    lifecycle.dispose();
  });

  it('aborts when another account replaces the same catalog hash', () => {
    const bookA = createBook({
      hash: 'catalog:7231ff9a-24b9-4074-9369-bc7f88ffb179' as Book['hash'],
      catalogBookId: '7231ff9a-24b9-4074-9369-bc7f88ffb179',
      storagePath: 'catalog/books/account-a.epub',
    });
    const bookB = { ...bookA, storagePath: 'catalog/books/account-b.epub' };
    useLibraryStore.setState({ library: [bookA], libraryOwnerUserId: 'account-a' });
    const lifecycle = createReaderOpenLifecycleGuard(bookA);

    useLibraryStore.setState({ library: [bookB], libraryOwnerUserId: 'account-b' });

    expect(lifecycle.signal.aborted).toBe(true);
    expect(() => lifecycle.assertCurrent()).toThrow(
      'Reader open cancelled because the library context changed.',
    );
    lifecycle.dispose();
  });

  it('aborts when the current catalog book is deleted', () => {
    const book = createBook({
      hash: 'catalog:7231ff9a-24b9-4074-9369-bc7f88ffb179' as Book['hash'],
      catalogBookId: '7231ff9a-24b9-4074-9369-bc7f88ffb179',
      storagePath: 'catalog/books/account-a.epub',
    });
    useLibraryStore.setState({ library: [book], libraryOwnerUserId: 'account-a' });
    const lifecycle = createReaderOpenLifecycleGuard(book);

    useLibraryStore.setState({
      library: [{ ...book, deletedAt: 2 }],
      libraryOwnerUserId: 'account-a',
    });

    expect(lifecycle.signal.aborted).toBe(true);
    expect(() => lifecycle.assertCurrent()).toThrow(
      'Reader open cancelled because the library context changed.',
    );
    lifecycle.dispose();
  });

  it('aborts when the catalog book is removed from the library', () => {
    const book = createBook({
      hash: 'catalog:7231ff9a-24b9-4074-9369-bc7f88ffb179' as Book['hash'],
      catalogBookId: '7231ff9a-24b9-4074-9369-bc7f88ffb179',
      storagePath: 'catalog/books/account-a.epub',
    });
    useLibraryStore.setState({ library: [book], libraryOwnerUserId: 'account-a' });
    const lifecycle = createReaderOpenLifecycleGuard(book);

    useLibraryStore.setState({ library: [], libraryOwnerUserId: 'account-a' });

    expect(lifecycle.signal.aborted).toBe(true);
    expect(() => lifecycle.assertCurrent()).toThrow(
      'Reader open cancelled because the library context changed.',
    );
    lifecycle.dispose();
  });

  it.each(remoteCopyCases)(
    'preserves recovery eligibility for remote-copy combination $label',
    async ({ catalogBookId, storagePath, catalogHash, uploadedAt }) => {
      const book = createBook({
        catalogBookId: catalogBookId ? '7231ff9a-24b9-4074-9369-bc7f88ffb179' : null,
        storagePath: storagePath ? 'Openread/Books/recoverable.epub' : null,
        hash: (catalogHash
          ? 'catalog:7231ff9a-24b9-4074-9369-bc7f88ffb179'
          : 'book-hash') as Book['hash'],
        uploadedAt: uploadedAt ? 1 : null,
      });
      const appService = createAppService();
      const initialContent = createContent(book, 'corrupt.epub');
      vi.mocked(appService.loadBookContent).mockResolvedValueOnce(initialContent);
      openMock.mockRejectedValueOnce(new Error('parse failed'));
      const expectedRecovery = catalogBookId || storagePath || catalogHash || uploadedAt;

      if (expectedRecovery) {
        const recoveredContent = createContent(book, 'valid.epub');
        vi.mocked(appService.redownloadBookContent).mockResolvedValueOnce(recoveredContent);
        openMock.mockResolvedValueOnce(doc);

        await expect(loadReaderOpenDocument(appService, book)).resolves.toMatchObject({
          recovered: true,
          content: recoveredContent,
          doc,
        });
        expect(appService.redownloadBookContent).toHaveBeenCalledTimes(1);
      } else {
        await expect(loadReaderOpenDocument(appService, book)).rejects.toThrow('parse failed');
        expect(appService.redownloadBookContent).not.toHaveBeenCalled();
      }
    },
  );

  it('recovers a corrupt cloud-backed local book once and forwards progress', async () => {
    const book = createBook({ uploadedAt: 1, downloadedAt: 2 });
    const appService = createAppService();
    const onProgress = vi.fn() as ProgressHandler;
    const initialContent = createContent(book, 'corrupt.epub');
    const recoveredContent = createContent(book, 'valid.epub');
    vi.mocked(appService.loadBookContent).mockResolvedValueOnce(initialContent);
    vi.mocked(appService.redownloadBookContent).mockResolvedValue(recoveredContent);
    openMock.mockRejectedValueOnce(new Error('Unsupported or corrupted book file'));
    openMock.mockResolvedValueOnce(doc);

    const result = await loadReaderOpenDocument(appService, book, onProgress);

    expect(result.recovered).toBe(true);
    expect(result.doc).toBe(doc);
    expect(result.content).toBe(recoveredContent);
    expect(appService.loadBookContent).toHaveBeenCalledTimes(1);
    expect(appService.loadBookContent).toHaveBeenCalledWith(book, onProgress);
    expect(initialContent.close).toHaveBeenCalledTimes(1);
    expect(initialContent.close.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(appService.redownloadBookContent).mock.invocationCallOrder[0]!,
    );
    expect(appService.redownloadBookContent).toHaveBeenCalledTimes(1);
    expect(appService.redownloadBookContent).toHaveBeenCalledWith(book, onProgress);
    expect(DocumentLoaderMock).toHaveBeenLastCalledWith(recoveredContent.file);
  });

  it('recovers a corrupt storage-backed user book', async () => {
    const book = createBook({ storagePath: 'Openread/Books/user-import.epub' });
    const appService = createAppService();
    const recoveredContent = createContent(book, 'valid.epub');
    vi.mocked(appService.loadBookContent).mockResolvedValueOnce(
      createContent(book, 'corrupt.epub'),
    );
    vi.mocked(appService.redownloadBookContent).mockResolvedValue(recoveredContent);
    openMock.mockRejectedValueOnce(new Error('parse failed'));
    openMock.mockResolvedValueOnce(doc);

    await expect(loadReaderOpenDocument(appService, book)).resolves.toMatchObject({
      recovered: true,
      content: recoveredContent,
      doc,
    });
    expect(appService.loadBookContent).toHaveBeenCalledTimes(1);
    expect(appService.redownloadBookContent).toHaveBeenCalledTimes(1);
  });

  it('recovers a corrupt catalog-owned local book even when storagePath is missing', async () => {
    const book = createBook({
      hash: 'catalog:7231ff9a-24b9-4074-9369-bc7f88ffb179' as Book['hash'],
      catalogBookId: '7231ff9a-24b9-4074-9369-bc7f88ffb179',
      storagePath: null,
    });
    const appService = createAppService();
    const recoveredContent = createContent(book, 'valid.epub');
    vi.mocked(appService.loadBookContent).mockResolvedValueOnce(
      createContent(book, 'corrupt.epub'),
    );
    vi.mocked(appService.redownloadBookContent).mockResolvedValue(recoveredContent);
    openMock.mockRejectedValueOnce(new Error('parse failed'));
    openMock.mockResolvedValueOnce(doc);

    await expect(loadReaderOpenDocument(appService, book)).resolves.toMatchObject({
      recovered: true,
      content: recoveredContent,
      doc,
    });
    expect(appService.redownloadBookContent).toHaveBeenCalledTimes(1);
  });

  it('does not treat downloadedAt as remote provenance for local-only imported books', async () => {
    const book = createBook({
      downloadedAt: 2,
      storagePath: null,
      uploadedAt: null,
      url: undefined,
    });
    const appService = createAppService();
    vi.mocked(appService.loadBookContent).mockResolvedValue(createContent(book, 'local.epub'));
    openMock.mockRejectedValueOnce(new Error('parse failed'));

    await expect(loadReaderOpenDocument(appService, book)).rejects.toThrow('parse failed');
    expect(appService.redownloadBookContent).not.toHaveBeenCalled();
  });

  it('does not retry URL-only books', async () => {
    const book = createBook({ url: 'https://example.com/book.epub' });
    const appService = createAppService();
    vi.mocked(appService.loadBookContent).mockResolvedValue(createContent(book, 'remote.epub'));
    openMock.mockRejectedValueOnce(new Error('parse failed'));

    await expect(loadReaderOpenDocument(appService, book)).rejects.toThrow('parse failed');
    expect(appService.redownloadBookContent).not.toHaveBeenCalled();
  });

  it('does not retry books with no remote provenance', async () => {
    const book = createBook();
    const appService = createAppService();
    vi.mocked(appService.loadBookContent).mockResolvedValue(createContent(book, 'local.epub'));
    openMock.mockRejectedValueOnce(new Error('parse failed'));

    await expect(loadReaderOpenDocument(appService, book)).rejects.toThrow('parse failed');
    expect(appService.redownloadBookContent).not.toHaveBeenCalled();
  });

  it('does not recover when the initial content download fails before document open', async () => {
    const book = createBook({ uploadedAt: 1, downloadedAt: 2 });
    const appService = createAppService();
    vi.mocked(appService.loadBookContent).mockRejectedValue(new Error('download failed'));

    await expect(loadReaderOpenDocument(appService, book)).rejects.toThrow('download failed');
    expect(openMock).not.toHaveBeenCalled();
    expect(appService.redownloadBookContent).not.toHaveBeenCalled();
  });

  it('does not set success state or retry again when redownload fails', async () => {
    const book = createBook({ uploadedAt: 1, downloadedAt: 2 });
    const appService = createAppService();
    const initialContent = createContent(book, 'corrupt.epub');
    vi.mocked(appService.loadBookContent).mockResolvedValue(initialContent);
    vi.mocked(appService.redownloadBookContent).mockRejectedValue(new Error('redownload failed'));
    openMock.mockRejectedValueOnce(new Error('parse failed'));

    await expect(loadReaderOpenDocument(appService, book)).rejects.toThrow('redownload failed');
    expect(initialContent.close).toHaveBeenCalledTimes(1);
    expect(appService.loadBookContent).toHaveBeenCalledTimes(1);
    expect(appService.redownloadBookContent).toHaveBeenCalledTimes(1);
  });

  it('tries recovery only once and closes recovered content when the replacement still cannot open', async () => {
    const book = createBook({ storagePath: 'Openread/Books/user-import.epub' });
    const appService = createAppService();
    const recoveredContent = createContent(book, 'still-corrupt.epub');
    vi.mocked(appService.loadBookContent).mockResolvedValueOnce(
      createContent(book, 'corrupt.epub'),
    );
    vi.mocked(appService.redownloadBookContent).mockResolvedValue(recoveredContent);
    openMock.mockRejectedValueOnce(new Error('parse failed'));
    openMock.mockRejectedValueOnce(new Error('still corrupt'));

    await expect(loadReaderOpenDocument(appService, book)).rejects.toThrow('still corrupt');
    expect(appService.redownloadBookContent).toHaveBeenCalledTimes(1);
    expect(appService.loadBookContent).toHaveBeenCalledTimes(1);
    expect(recoveredContent.close).toHaveBeenCalledTimes(1);
  });
});
