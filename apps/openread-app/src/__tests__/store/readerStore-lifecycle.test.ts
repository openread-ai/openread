import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBookDataStore } from '@/store/bookDataStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useReaderStore } from '@/store/readerStore';
import type { EnvConfigType } from '@/services/environment';
import type { Book } from '@/types/book';
import type { AppService } from '@/types/system';

const catalogBookHash = 'catalog:7231ff9a-24b9-4074-9369-bc7f88ffb179' as Book['hash'];

function catalogBook(storagePath: string): Book {
  return {
    hash: catalogBookHash,
    catalogBookId: '7231ff9a-24b9-4074-9369-bc7f88ffb179',
    storagePath,
    title: 'Catalog Book',
    author: 'OpenRead',
    format: 'epub',
    createdAt: 1,
    updatedAt: 1,
  } as Book;
}

describe('readerStore catalog open lifecycle', () => {
  beforeEach(() => {
    useLibraryStore.setState({ library: [], libraryOwnerUserId: null });
    useBookDataStore.setState({ booksData: {}, preSyncedConfigs: {} });
    useReaderStore.setState({ viewStates: {}, bookKeys: [], hoveredBookKey: null });
  });

  it('does not commit an account A book after account B replaces the same catalog hash', async () => {
    const bookA = catalogBook('catalog/books/account-a.epub');
    const bookB = catalogBook('catalog/books/account-b.epub');
    let observedSignal: AbortSignal | undefined;
    const appService = {
      isMobile: false,
      loadBookContent: vi.fn(
        (_book: Book, _onProgress: unknown, lifecycleSignal?: AbortSignal) =>
          new Promise((_resolve, reject) => {
            observedSignal = lifecycleSignal;
            lifecycleSignal?.addEventListener(
              'abort',
              () => reject(new DOMException('aborted', 'AbortError')),
              { once: true },
            );
          }),
      ),
      loadBookConfig: vi.fn(),
    } as unknown as AppService;
    const envConfig = {
      getAppService: vi.fn().mockResolvedValue(appService),
    } as unknown as EnvConfigType;
    useLibraryStore.setState({ library: [bookA], libraryOwnerUserId: 'account-a' });
    useBookDataStore.getState().setPreSyncedConfig(catalogBookHash, {
      location: 'epubcfi(/6/2!/4/2/1:0)',
    });

    const opening = useReaderStore
      .getState()
      .initViewState(envConfig, catalogBookHash, 'catalog-open');
    await vi.waitFor(() => expect(observedSignal).toBeInstanceOf(AbortSignal));

    useLibraryStore.setState({ library: [bookB], libraryOwnerUserId: 'account-b' });

    await expect(opening).rejects.toMatchObject({ name: 'AbortError' });
    expect(observedSignal?.aborted).toBe(true);
    expect(appService.loadBookContent).toHaveBeenCalledTimes(1);
    expect(appService.loadBookConfig).not.toHaveBeenCalled();
    expect(useBookDataStore.getState().booksData[catalogBookHash]).toBeUndefined();
    expect(useBookDataStore.getState().preSyncedConfigs[catalogBookHash]).toBeDefined();
    expect(useReaderStore.getState().viewStates['catalog-open']?.inited).not.toBe(true);
  });
});
