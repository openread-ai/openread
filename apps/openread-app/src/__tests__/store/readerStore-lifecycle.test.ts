import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBookDataStore } from '@/store/bookDataStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useReaderStore } from '@/store/readerStore';
import type { EnvConfigType } from '@/services/environment';
import type { Book } from '@/types/book';
import type { AppService } from '@/types/system';
import type { FoliateView } from '@/types/view';
import { initializeReaderViewPosition } from '@/app/reader/utils/readerResumeAnchor';
import { createReaderBookKey } from '@openread/types';

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

const createViewState = (key: string) => ({
  key,
  view: null,
  viewerKey: key,
  isPrimary: true,
  closing: false,
  loading: false,
  inited: true,
  error: null,
  progress: null,
  ribbonVisible: false,
  ttsEnabled: false,
  rsvpEnabled: false,
  syncing: false,
  gridInsets: null,
  viewSettings: null,
});

const relocate = (key: string, location: string, current: number) => {
  const page = { current, total: 10 };
  useReaderStore
    .getState()
    .setProgress(
      key,
      location,
      {} as never,
      page as never,
      page as never,
      {} as never,
      new Range(),
    );
};

describe('readerStore catalog open lifecycle', () => {
  beforeEach(() => {
    useLibraryStore.setState({ library: [], libraryOwnerUserId: null });
    useBookDataStore.setState({ booksData: {}, preSyncedConfigs: {} });
    useReaderStore.setState({ viewStates: {}, bookKeys: [], hoveredBookKey: null });
  });

  it('treats a deleted catalog book as missing before reader initialization', async () => {
    const deletedBook = { ...catalogBook('catalog/books/deleted.epub'), deletedAt: 2 };
    const appService = {
      isMobile: false,
      loadBookContent: vi.fn(),
      loadBookConfig: vi.fn(),
    } as unknown as AppService;
    const envConfig = {
      getAppService: vi.fn().mockResolvedValue(appService),
    } as unknown as EnvConfigType;
    useLibraryStore.setState({ library: [deletedBook], libraryOwnerUserId: 'account-a' });

    await expect(
      useReaderStore.getState().initViewState(envConfig, catalogBookHash, 'deleted-catalog-open'),
    ).rejects.toThrow('Book not found');

    expect(appService.loadBookContent).not.toHaveBeenCalled();
    expect(appService.loadBookConfig).not.toHaveBeenCalled();
    expect(useReaderStore.getState().viewStates['deleted-catalog-open']?.error).toBe(
      'Failed to load book.',
    );
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

describe('readerStore close lifecycle', () => {
  const book = {
    hash: 'd41d8cd98f00b204e9800998ecf8427e',
    title: 'Reader Close Book',
    author: 'OpenRead',
    format: 'epub',
    progress: [1, 10],
    createdAt: 1,
    updatedAt: 1,
  } as Book;
  const bookKey = createReaderBookKey(book.hash);

  beforeEach(() => {
    useLibraryStore.setState({ library: [book], libraryOwnerUserId: 'account-a' });
    useBookDataStore.setState({
      booksData: {
        [book.hash]: {
          id: book.hash,
          book,
          file: null,
          config: { location: 'epubcfi(/6/2)', progress: [1, 10], updatedAt: 1 },
          bookDoc: null,
          isFixedLayout: false,
        },
      },
      preSyncedConfigs: {},
    });
    useReaderStore.setState({
      viewStates: { [bookKey]: createViewState(bookKey) },
      bookKeys: [bookKey],
      hoveredBookKey: null,
    });
  });

  it('ignores stale initial navigation settlement after clear or same-key replacement', async () => {
    let resolveCleared!: () => void;
    const clearedView = {
      init: vi.fn(() => new Promise<void>((resolve) => (resolveCleared = resolve))),
      goToFraction: vi.fn(),
    } as unknown as FoliateView;
    useReaderStore.setState({
      viewStates: {
        [bookKey]: { ...createViewState(bookKey), view: clearedView, inited: false },
      },
    });

    const clearedInitialization = initializeReaderViewPosition(clearedView, 'epubcfi(/6/4)', () =>
      useReaderStore.getState().setViewInited(bookKey, true, clearedView),
    );
    useReaderStore.getState().clearViewState(bookKey);
    resolveCleared();
    await clearedInitialization;

    expect(useReaderStore.getState().viewStates[bookKey]).toBeUndefined();

    let resolveReplaced!: () => void;
    const replacedView = {
      init: vi.fn(() => new Promise<void>((resolve) => (resolveReplaced = resolve))),
      goToFraction: vi.fn(),
    } as unknown as FoliateView;
    const replacementView = {} as FoliateView;
    useReaderStore.setState({
      viewStates: {
        [bookKey]: { ...createViewState(bookKey), view: replacedView, inited: false },
      },
    });

    const replacedInitialization = initializeReaderViewPosition(replacedView, 'epubcfi(/6/4)', () =>
      useReaderStore.getState().setViewInited(bookKey, true, replacedView),
    );
    useReaderStore.setState({
      viewStates: {
        [bookKey]: { ...createViewState(bookKey), view: replacementView, inited: false },
      },
    });
    resolveReplaced();
    await replacedInitialization;

    expect(useReaderStore.getState().viewStates[bookKey]).toMatchObject({
      view: replacementView,
      inited: false,
    });
  });

  it('shows restore progress without persisting it, then persists genuine post-init relocates', () => {
    useBookDataStore.setState((state) => ({
      booksData: {
        ...state.booksData,
        [book.hash]: {
          ...state.booksData[book.hash]!,
          config: { location: 'epubcfi(/6/4)', progress: [2, 10], updatedAt: 2 },
        },
      },
    }));
    useLibraryStore.setState({
      library: [{ ...book, progress: [2, 10] }],
    });
    useReaderStore.setState({
      viewStates: {
        [bookKey]: { ...createViewState(bookKey), inited: false },
      },
    });

    relocate(bookKey, 'epubcfi(/6/2)', 0);

    expect(useReaderStore.getState().getProgress(bookKey)).toMatchObject({
      location: 'epubcfi(/6/2)',
      pageinfo: { current: 0, total: 10 },
    });
    expect(useBookDataStore.getState().getConfig(bookKey)).toMatchObject({
      location: 'epubcfi(/6/4)',
      progress: [2, 10],
    });
    expect(useLibraryStore.getState().library[0]?.progress).toEqual([2, 10]);

    useReaderStore.getState().setViewInited(bookKey, true);
    relocate(bookKey, 'epubcfi(/6/6)', 2);

    expect(useBookDataStore.getState().getConfig(bookKey)).toMatchObject({
      location: 'epubcfi(/6/6)',
      progress: [3, 10],
    });
    expect(useLibraryStore.getState().library[0]?.progress).toEqual([3, 10]);
  });

  it('accepts user relocates, rejects teardown relocates, and accepts again after teardown clears', () => {
    relocate(bookKey, 'epubcfi(/6/4)', 1);
    expect(useBookDataStore.getState().getConfig(bookKey)).toMatchObject({
      location: 'epubcfi(/6/4)',
      progress: [2, 10],
    });
    expect(useLibraryStore.getState().library[0]?.progress).toEqual([2, 10]);

    useReaderStore.getState().setViewClosing(bookKey, true);
    relocate(bookKey, 'epubcfi(/6/2)', 0);
    expect(useBookDataStore.getState().getConfig(bookKey)).toMatchObject({
      location: 'epubcfi(/6/4)',
      progress: [2, 10],
    });
    expect(useLibraryStore.getState().library[0]?.progress).toEqual([2, 10]);

    useReaderStore.getState().setViewClosing(bookKey, false);
    relocate(bookKey, 'epubcfi(/6/6)', 2);
    expect(useBookDataStore.getState().getConfig(bookKey)).toMatchObject({
      location: 'epubcfi(/6/6)',
      progress: [3, 10],
    });
    expect(useLibraryStore.getState().library[0]?.progress).toEqual([3, 10]);
  });
});
