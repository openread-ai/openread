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

vi.mock('@/utils/toc', () => ({ updateToc: vi.fn().mockResolvedValue(undefined) }));

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

const localLocation = 'epubcfi(/6/2)';
const remoteLocation = 'epubcfi(/6/6)';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
};

const cachedBookData = (book: Book) => ({
  id: book.hash,
  book,
  file: new File(['book'], 'book.epub'),
  config: null,
  bookDoc: {
    metadata: { title: book.title, language: 'en' },
    rendition: {},
  },
  isFixedLayout: false,
});

const configAt = (location: string, updatedAt: number) =>
  ({
    location,
    progress: location === remoteLocation ? [3, 10] : [1, 10],
    updatedAt,
    viewSettings: {},
  }) as never;

const renderedPageFor = (location: string | undefined) => (location === remoteLocation ? 3 : 1);

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
    useBookDataStore.setState({ booksData: {}, remoteConfigs: {} });
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

  it.each([
    {
      window: 'before init begins',
      arrange: async (start: () => Promise<void>, applyRemote: () => void) => {
        applyRemote();
        await start();
      },
    },
    {
      window: 'while loadBookConfig is pending',
      arrange: async (
        start: () => Promise<void>,
        applyRemote: () => void,
        waitUntilLoading: () => Promise<void>,
        releaseLocal: () => void,
      ) => {
        const opening = start();
        await waitUntilLoading();
        applyRemote();
        releaseLocal();
        await opening;
      },
    },
    {
      window: 'after init completes but before the viewer mounts',
      arrange: async (start: () => Promise<void>, applyRemote: () => void) => {
        await start();
        applyRemote();
      },
    },
  ])(
    'initializes the rendered page from already-admitted remote progress stored $window',
    async ({ arrange }) => {
      const book = catalogBook('catalog/books/remote-resume.epub');
      const localConfig = deferred<never>();
      const appService = {
        isMobile: false,
        loadBookContent: vi.fn(),
        loadBookConfig: vi.fn(() => localConfig.promise),
      } as unknown as AppService;
      const envConfig = {
        getAppService: vi.fn().mockResolvedValue(appService),
      } as unknown as EnvConfigType;
      const bookKey = createReaderBookKey(book.hash);
      useLibraryStore.setState({ library: [book], libraryOwnerUserId: 'account-a' });
      useBookDataStore.setState({
        booksData: { [book.hash]: cachedBookData(book) as never },
        remoteConfigs: {},
      });

      let opening: Promise<void> | null = null;
      const start = () => {
        opening ??= useReaderStore.getState().initViewState(envConfig, book.hash, bookKey);
        return opening;
      };
      const applyRemote = () => {
        const remoteConfig = configAt(remoteLocation, 2);
        useBookDataStore.getState().setRemoteConfig(book.hash, 'account-a', remoteConfig);
      };
      const waitUntilLoading = () =>
        vi.waitFor(() => expect(appService.loadBookConfig).toHaveBeenCalled());
      const releaseLocal = () => localConfig.resolve(configAt(localLocation, 1));

      if (arrange.length < 4) releaseLocal();
      await arrange(start, applyRemote, waitUntilLoading, releaseLocal);

      const rendered = { page: 0 };
      const view = {
        init: async ({ lastLocation }: { lastLocation: string }) => {
          rendered.page = renderedPageFor(lastLocation);
        },
        goToFraction: async () => {
          rendered.page = 1;
        },
      };
      await initializeReaderViewPosition(
        view as never,
        useBookDataStore
          .getState()
          .getLatestConfig(bookKey, useBookDataStore.getState().getConfig(bookKey)!).location,
        () => undefined,
      );
      expect(rendered.page).toBe(3);
    },
  );

  it('replays already-admitted remote config before viewer subscription into visible navigation', async () => {
    const book = catalogBook('catalog/books/pre-mount-remote.epub');
    const bookKey = createReaderBookKey(book.hash);
    const localConfig = configAt(localLocation, 1);
    useLibraryStore.setState({ library: [book], libraryOwnerUserId: 'account-a' });
    useBookDataStore.setState({
      booksData: {
        [book.hash]: { ...cachedBookData(book), config: localConfig } as never,
      },
      remoteConfigs: {},
    });

    useBookDataStore
      .getState()
      .setRemoteConfig(book.hash, 'account-a', configAt(remoteLocation, 2));

    const rendered = { page: 0 };
    const view = {
      init: async ({ lastLocation }: { lastLocation: string }) => {
        rendered.page = renderedPageFor(lastLocation);
      },
      goToFraction: async () => {
        rendered.page = 1;
      },
    };
    await initializeReaderViewPosition(
      view as never,
      useBookDataStore.getState().getLatestConfig(bookKey, localConfig).location,
      () => undefined,
    );

    expect(rendered.page).toBe(3);
  });

  it('keeps a newer remote config when an older remote apply settles later', () => {
    useLibraryStore.setState({ libraryOwnerUserId: 'account-a' });
    useBookDataStore.getState().setRemoteConfig(catalogBookHash, 'account-a', {
      location: remoteLocation,
      updatedAt: 3,
    });
    useBookDataStore.getState().setRemoteConfig(catalogBookHash, 'account-a', {
      location: localLocation,
      updatedAt: 2,
    });

    expect(useBookDataStore.getState().getRemoteConfig(catalogBookHash)).toMatchObject({
      location: remoteLocation,
      updatedAt: 3,
    });
  });

  it('keeps remote config scoped to the active library owner', () => {
    useLibraryStore.setState({ libraryOwnerUserId: 'account-a' });
    useBookDataStore.getState().setRemoteConfig(catalogBookHash, 'account-a', {
      location: remoteLocation,
      updatedAt: 2,
    });

    expect(useBookDataStore.getState().getRemoteConfig(catalogBookHash)).toMatchObject({
      location: remoteLocation,
    });

    useLibraryStore.setState({ libraryOwnerUserId: 'account-b' });

    expect(useBookDataStore.getState().getRemoteConfig(catalogBookHash)).toBeNull();
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
    useBookDataStore.getState().setRemoteConfig(catalogBookHash, 'account-a', {
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
    expect(useBookDataStore.getState().remoteConfigs[catalogBookHash]).toBeDefined();
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
      remoteConfigs: {},
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
