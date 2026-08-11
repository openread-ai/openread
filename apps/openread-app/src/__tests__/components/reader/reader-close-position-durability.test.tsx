import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ReaderContent from '@/app/reader/components/ReaderContent';
import { navigateToLibrary } from '@/utils/nav';
import type { Book } from '@/types/book';

const {
  clearViewStateMock,
  closeBookHandlerRef,
  dismissBookMock,
  getBookDataByReaderKeyMock,
  getConfigMock,
  getViewMock,
  getViewStateMock,
  initViewStateMock,
  libraryState,
  saveConfigMock,
  setViewClosingMock,
  useSettingsStoreMock,
} = vi.hoisted(() => {
  const settingsState = {
    settings: { lastOpenBooks: [] },
    setSettings: vi.fn(),
  };
  const libraryState = { library: [] as Book[] };

  return {
    clearViewStateMock: vi.fn(),
    closeBookHandlerRef: {
      current: null as null | ((bookKey: string) => Promise<void>),
    },
    dismissBookMock: vi.fn(),
    getBookDataByReaderKeyMock: vi.fn(),
    getConfigMock: vi.fn(),
    getViewMock: vi.fn(),
    getViewStateMock: vi.fn(),
    initViewStateMock: vi.fn(),
    libraryState,
    saveConfigMock: vi.fn(),
    setViewClosingMock: vi.fn(),
    useSettingsStoreMock: Object.assign(
      () => ({
        saveSettings: vi.fn(),
        isSettingsDialogOpen: false,
        settingsDialogBookKey: null,
      }),
      {
        getState: vi.fn(() => settingsState),
      },
    ),
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/reader',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ label: 'main', close: vi.fn() }),
}));

vi.mock('@tauri-apps/api/event', () => ({}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    envConfig: { getAppService: vi.fn() },
    appService: null,
  }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/hooks/useGamepad', () => ({ useGamepad: vi.fn() }));
vi.mock('@/app/reader/hooks/useBookShortcuts', () => ({ default: vi.fn() }));

vi.mock('@/app/reader/hooks/useBooksManager', () => ({
  default: () => ({
    bookKeys: ['reader-key-1'],
    dismissBook: dismissBookMock,
    getNextBookKey: vi.fn(() => null),
  }),
}));

vi.mock('@/store/libraryStore', () => ({
  useLibraryStore: (selector: (state: typeof libraryState) => unknown) => selector(libraryState),
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({
    getView: getViewMock,
    setBookKeys: vi.fn(),
    getViewSettings: vi.fn(() => ({})),
    initViewState: initViewStateMock,
    getViewState: getViewStateMock,
    clearViewState: clearViewStateMock,
    setViewClosing: setViewClosingMock,
  }),
}));

vi.mock('@/store/sidebarStore', () => ({
  useSidebarStore: () => ({
    sideBarBookKey: 'reader-key-1',
    setSideBarBookKey: vi.fn(),
  }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: useSettingsStoreMock,
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({
    getConfig: getConfigMock,
    getBookDataByReaderKey: getBookDataByReaderKeyMock,
    saveConfig: saveConfigMock,
  }),
}));

vi.mock('@openread/types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@openread/types')>();
  return {
    ...actual,
    createReaderBookKey: () => 'reader-key-1',
    parseBookRefFromReaderBookKey: () => 'book-1',
  };
});

vi.mock('@/utils/nav', () => ({ navigateToLibrary: vi.fn() }));
vi.mock('@/helpers/openWith', () => ({ parseOpenWithFiles: vi.fn(async () => []) }));
vi.mock('@/utils/window', () => ({
  tauriHandleClose: vi.fn(),
  tauriHandleOnCloseWindow: vi.fn(),
}));
vi.mock('@/services/environment', () => ({ isTauriAppPlatform: () => false }));
vi.mock('@/utils/discord', () => ({ clearDiscordPresence: vi.fn() }));
vi.mock('@/services/settings/settingsService', () => ({
  settingsService: { updateKey: vi.fn(async (_env, settings) => settings) },
}));
vi.mock('@/app/reader/components/sidebar/SideBar', () => ({
  default: ({ onGoToLibrary }: { onGoToLibrary: () => void }) => (
    <button type='button' onClick={onGoToLibrary}>
      Go to Library
    </button>
  ),
}));
vi.mock('@/app/reader/components/BooksGrid', () => ({
  default: ({ onCloseBook }: { onCloseBook: (bookKey: string) => Promise<void> }) => {
    closeBookHandlerRef.current = onCloseBook;
    return (
      <button type='button' onClick={() => onCloseBook('reader-key-1')}>
        Back to Library
      </button>
    );
  },
}));
vi.mock('@/app/reader/components/notebook/Notebook', () => ({ default: () => null }));
vi.mock('@/app/reader/components/InlineQuestionBar', () => ({ default: () => null }));
vi.mock('@/components/settings/SettingsDialog', () => ({ default: () => null }));
vi.mock('@/components/metadata', () => ({ BookDetailModal: () => null }));

const renderReader = () =>
  render(
    <ReaderContent
      ids='book-1'
      settings={{ lastOpenBooks: [] } as never}
      libraryReconciliationSettled={true}
    />,
  );

const deferredSave = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  saveConfigMock.mockReturnValueOnce(promise);
  return resolve;
};

const expectNavigationWaitsForSave = async (buttonName: string) => {
  const resolveSave = deferredSave();
  renderReader();

  fireEvent.click(screen.getByRole('button', { name: buttonName }));
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(saveConfigMock).toHaveBeenCalledOnce();
  expect(navigateToLibrary).not.toHaveBeenCalled();

  await act(async () => resolveSave());
  await waitFor(() => expect(navigateToLibrary).toHaveBeenCalledOnce());
};

describe('ReaderContent close position durability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    closeBookHandlerRef.current = null;
    libraryState.library = [
      { hash: 'book-1', title: 'Reader Book', format: 'epub', deletedAt: null } as Book,
    ];
    getBookDataByReaderKeyMock.mockReturnValue({
      book: libraryState.library[0],
      bookDoc: {},
    });
    getConfigMock.mockReturnValue({ location: 'epubcfi(/6/4)', progress: [2, 10] });
    getViewMock.mockReturnValue({ close: vi.fn(), remove: vi.fn() });
    getViewStateMock.mockReturnValue({ isPrimary: true });
    initViewStateMock.mockResolvedValue(undefined);
  });

  afterEach(() => cleanup());

  it('persists the latest position before Back to Library navigation', async () => {
    await expectNavigationWaitsForSave('Back to Library');
  });

  it('persists all open positions before sidebar library navigation', async () => {
    await expectNavigationWaitsForSave('Go to Library');
  });

  it('clears the closing gate when persistence fails', async () => {
    const persistenceError = new Error('persistence failed');
    saveConfigMock.mockRejectedValueOnce(persistenceError);
    renderReader();

    expect(closeBookHandlerRef.current).not.toBeNull();
    await expect(closeBookHandlerRef.current!('reader-key-1')).rejects.toBe(persistenceError);

    expect(navigateToLibrary).not.toHaveBeenCalled();
    expect(setViewClosingMock.mock.calls).toEqual([
      ['reader-key-1', true],
      ['reader-key-1', false],
    ]);
  });

  it('clears the closing gate when view teardown throws', async () => {
    getViewMock.mockReturnValue({
      close: vi.fn(() => {
        throw new Error('teardown failed');
      }),
      remove: vi.fn(),
    });
    saveConfigMock.mockResolvedValue(undefined);

    renderReader();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Library' }));
    await waitFor(() => expect(navigateToLibrary).toHaveBeenCalledOnce());

    expect(setViewClosingMock.mock.calls).toEqual([
      ['reader-key-1', true],
      ['reader-key-1', false],
    ]);
  });

  it('reopens at the advanced position when view teardown emits a first-page relocate', async () => {
    const advanced = { location: 'epubcfi(/6/4)', progress: [2, 10] as [number, number] };
    const firstPage = { location: 'epubcfi(/6/2)', progress: [1, 10] as [number, number] };
    let currentConfig = advanced;
    let closing = false;
    let persistedConfig: typeof advanced | null = null;

    getConfigMock.mockImplementation(() => currentConfig);
    setViewClosingMock.mockImplementation((_bookKey: string, value: boolean) => {
      closing = value;
    });
    getViewMock.mockReturnValue({
      close: vi.fn(() => {
        if (!closing) currentConfig = firstPage;
      }),
      remove: vi.fn(),
    });
    saveConfigMock.mockImplementation(async (_env, _bookKey, config) => {
      persistedConfig = structuredClone(config);
    });

    renderReader();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Library' }));
    await waitFor(() => expect(navigateToLibrary).toHaveBeenCalledOnce());

    expect(persistedConfig).toEqual(advanced);
    currentConfig = structuredClone(persistedConfig!);
    expect(getConfigMock()).toEqual(advanced);
    expect(setViewClosingMock.mock.calls).toEqual([
      ['reader-key-1', true],
      ['reader-key-1', false],
    ]);
  });
});
