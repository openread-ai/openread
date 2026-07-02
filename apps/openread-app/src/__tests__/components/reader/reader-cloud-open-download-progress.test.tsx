import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ReaderContent from '@/app/reader/components/ReaderContent';
import { eventDispatcher } from '@/utils/event';
import type { ProgressHandler } from '@/utils/transfer';

const {
  initViewStateMock,
  getViewStateMock,
  setBookKeysMock,
  setSideBarBookKeyMock,
  getBookDataByReaderKeyMock,
  useSettingsStoreMock,
} = vi.hoisted(() => {
  const settingsState = {
    settings: { lastOpenBooks: [] },
    setSettings: vi.fn(),
  };
  return {
    initViewStateMock: vi.fn(),
    getViewStateMock: vi.fn(),
    setBookKeysMock: vi.fn(),
    setSideBarBookKeyMock: vi.fn(),
    getBookDataByReaderKeyMock: vi.fn(),
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
  useTranslation: () => (key: string, vars?: Record<string, string>) =>
    vars ? key.replace('{{percent}}', vars['percent'] ?? '') : key,
}));

vi.mock('@/hooks/useGamepad', () => ({ useGamepad: vi.fn() }));
vi.mock('@/app/reader/hooks/useBookShortcuts', () => ({ default: vi.fn() }));

vi.mock('@/app/reader/hooks/useBooksManager', () => ({
  default: () => ({
    bookKeys: ['reader-key-1'],
    dismissBook: vi.fn(),
    getNextBookKey: vi.fn(() => null),
  }),
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({
    getView: vi.fn(() => null),
    setBookKeys: setBookKeysMock,
    getViewSettings: vi.fn(() => null),
    initViewState: initViewStateMock,
    getViewState: getViewStateMock,
    clearViewState: vi.fn(),
  }),
}));

vi.mock('@/store/sidebarStore', () => ({
  useSidebarStore: () => ({
    sideBarBookKey: 'reader-key-1',
    setSideBarBookKey: setSideBarBookKeyMock,
  }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: useSettingsStoreMock,
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({
    getConfig: vi.fn(),
    getBookDataByReaderKey: getBookDataByReaderKeyMock,
    saveConfig: vi.fn(),
  }),
}));

vi.mock('@/utils/readerBookKey', () => ({
  createBookKey: () => 'reader-key-1',
  parseBookRefFromReaderBookKey: (key: string) => (key === 'invalid' ? null : 'book-1'),
}));

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
vi.mock('@/components/Spinner', () => ({ default: () => <div data-testid='spinner' /> }));
vi.mock('@/app/reader/components/sidebar/SideBar', () => ({ default: () => null }));
vi.mock('@/app/reader/components/notebook/Notebook', () => ({ default: () => null }));
vi.mock('@/app/reader/components/BooksGrid', () => ({ default: () => null }));
vi.mock('@/app/reader/components/InlineQuestionBar', () => ({ default: () => null }));
vi.mock('@/components/settings/SettingsDialog', () => ({ default: () => null }));
vi.mock('@/components/metadata', () => ({ BookDetailModal: () => null }));

const renderReader = () =>
  render(
    <ReaderContent
      ids='book-1'
      settings={
        {
          lastOpenBooks: [],
        } as never
      }
    />,
  );

describe('ReaderContent cloud-open download progress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    getViewStateMock.mockReturnValue(null);
    getBookDataByReaderKeyMock.mockReturnValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('shows download percent after reader-open cloud progress is received', async () => {
    initViewStateMock.mockImplementation(
      (_env, _id, _key, _isPrimary, _reload, onProgress?: ProgressHandler) => {
        onProgress?.({ progress: 25, total: 100, transferSpeed: 10 });
        return new Promise<void>(() => {});
      },
    );

    renderReader();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(screen.getByTestId('reader-loading')).toBeTruthy();
    expect(screen.getByText('Downloading… 25%')).toBeTruthy();
  });

  it('keeps local reader opens on the plain spinner when no remote progress is received', async () => {
    initViewStateMock.mockImplementation(() => new Promise<void>(() => {}));

    renderReader();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(screen.getByTestId('reader-loading')).toBeTruthy();
    expect(screen.getByTestId('spinner')).toBeTruthy();
    expect(screen.queryByText(/Downloading/)).toBeNull();
  });

  it('clears download progress and keeps the existing unable-to-open toast on failure', async () => {
    const dispatchSpy = vi.spyOn(eventDispatcher, 'dispatch');
    initViewStateMock.mockImplementation(
      (_env, _id, _key, _isPrimary, _reload, onProgress?: ProgressHandler) => {
        onProgress?.({ progress: 50, total: 100, transferSpeed: 10 });
        return Promise.reject(new Error('download failed'));
      },
    );

    renderReader();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(dispatchSpy).toHaveBeenCalledWith(
      'toast',
      expect.objectContaining({ message: 'Unable to open book', type: 'error' }),
    );
    expect(screen.queryByText(/Downloading/)).toBeNull();
  });
});
