import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProgressAutoSave } from '@/app/reader/hooks/useProgressAutoSave';
import { useBookDataStore } from '@/store/bookDataStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useReaderStore } from '@/store/readerStore';
import type { Book } from '@/types/book';
import { createReaderBookKey } from '@openread/types';

const { appServiceMock, envConfigMock } = vi.hoisted(() => {
  const appServiceMock = {
    saveBookConfig: vi.fn().mockResolvedValue(undefined),
    saveLibraryBooks: vi.fn().mockResolvedValue(undefined),
  };
  return {
    appServiceMock,
    envConfigMock: { getAppService: vi.fn().mockResolvedValue(appServiceMock) },
  };
});

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig: envConfigMock }),
}));

const book = {
  hash: 'd41d8cd98f00b204e9800998ecf8427e',
  title: 'Resume Book',
  author: 'OpenRead',
  format: 'epub',
  progress: [2, 10],
  createdAt: 1,
  updatedAt: 1,
} as Book;
const bookKey = createReaderBookKey(book.hash);
const advancedConfig = {
  location: 'epubcfi(/6/4)',
  progress: [2, 10] as [number, number],
  updatedAt: 2,
};

function AutoSaveProbe() {
  useProgressAutoSave(bookKey);
  return null;
}

const relocate = (location: string, current: number) => {
  const page = { current, total: 10 };
  useReaderStore
    .getState()
    .setProgress(
      bookKey,
      location,
      {} as never,
      page as never,
      page as never,
      {} as never,
      new Range(),
    );
};

describe('reader resume persistence outcome', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(20_000);
    vi.clearAllMocks();
    useLibraryStore.setState({ library: [book], libraryOwnerUserId: 'account-a' });
    useBookDataStore.setState({
      booksData: {
        [book.hash]: {
          id: book.hash,
          book,
          file: null,
          config: structuredClone(advancedConfig),
          bookDoc: null,
          isFixedLayout: false,
        },
      },
      remoteConfigs: {},
    });
    useReaderStore.setState({
      viewStates: {
        [bookKey]: {
          key: bookKey,
          view: null,
          viewerKey: bookKey,
          isPrimary: true,
          closing: false,
          loading: false,
          inited: false,
          error: null,
          progress: null,
          ribbonVisible: false,
          ttsEnabled: false,
          rsvpEnabled: false,
          syncing: false,
          gridInsets: null,
          viewSettings: null,
        },
      },
      bookKeys: [bookKey],
      hoveredBookKey: null,
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('keeps the advanced config after the autosave window when restore reports an earlier page', async () => {
    render(<AutoSaveProbe />);

    act(() => relocate('epubcfi(/6/2)', 0));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(appServiceMock.saveBookConfig).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        location: advancedConfig.location,
        progress: advancedConfig.progress,
      }),
      expect.anything(),
    );
    expect(useBookDataStore.getState().getConfig(bookKey)).toMatchObject({
      location: advancedConfig.location,
      progress: advancedConfig.progress,
    });
  });

  it('persists a genuine page turn after initialization', async () => {
    useReaderStore.getState().setViewInited(bookKey, true);
    render(<AutoSaveProbe />);

    act(() => relocate('epubcfi(/6/6)', 2));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(appServiceMock.saveBookConfig).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ location: 'epubcfi(/6/6)', progress: [3, 10] }),
      expect.anything(),
    );
  });
});
