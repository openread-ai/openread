import { act, cleanup, render } from '@testing-library/react';
import { createReaderBookKey } from '@openread/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProgressAutoSave } from '@/app/reader/hooks/useProgressAutoSave';
import { useBookDataStore } from '@/store/bookDataStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useReaderStore } from '@/store/readerStore';
import type { Book } from '@/types/book';

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

const books = [
  {
    hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    title: 'Book A',
    author: 'OpenRead',
    format: 'epub',
    progress: [1, 10],
    createdAt: 1,
    updatedAt: 1,
  },
  {
    hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    title: 'Book B',
    author: 'OpenRead',
    format: 'epub',
    progress: [1, 10],
    createdAt: 1,
    updatedAt: 1,
  },
] as Book[];

const [bookA, bookB] = books as [Book, Book];
const bookAKey = createReaderBookKey(bookA.hash);
const bookBKey = createReaderBookKey(bookB.hash);

const createViewState = (bookKey: string) => ({
  key: bookKey,
  view: null,
  viewerKey: bookKey,
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

function AutoSaveProbe({ bookKey }: { bookKey: string }) {
  useProgressAutoSave(bookKey);
  return null;
}

const relocate = (bookKey: string, location: string, current: number) => {
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

describe('useProgressAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(20_000);
    vi.clearAllMocks();
    useLibraryStore.setState({ library: books, libraryOwnerUserId: 'account-a' });
    useBookDataStore.setState({
      booksData: {
        [bookA.hash]: {
          id: bookA.hash,
          book: bookA,
          file: null,
          config: { location: 'epubcfi(/6/2)', progress: [1, 10], updatedAt: 1 },
          bookDoc: null,
          isFixedLayout: false,
        },
        [bookB.hash]: {
          id: bookB.hash,
          book: bookB,
          file: null,
          config: { location: 'epubcfi(/6/4)', progress: [2, 10], updatedAt: 1 },
          bookDoc: null,
          isFixedLayout: false,
        },
      },
      remoteConfigs: {},
    });
    useReaderStore.setState({
      viewStates: {
        [bookAKey]: createViewState(bookAKey),
        [bookBKey]: createViewState(bookBKey),
      },
      bookKeys: [bookAKey, bookBKey],
      hoveredBookKey: null,
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('writes only the newly opened book when the book changes before autosave', async () => {
    const { rerender } = render(<AutoSaveProbe bookKey={bookAKey} />);

    rerender(<AutoSaveProbe bookKey={bookBKey} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(appServiceMock.saveBookConfig).toHaveBeenCalledTimes(1);
    expect(appServiceMock.saveBookConfig).toHaveBeenCalledWith(
      expect.objectContaining({ hash: bookB.hash }),
      expect.objectContaining({ location: 'epubcfi(/6/4)', progress: [2, 10] }),
      expect.anything(),
    );
    expect(appServiceMock.saveBookConfig).not.toHaveBeenCalledWith(
      expect.objectContaining({ hash: bookA.hash }),
      expect.anything(),
      expect.anything(),
    );
  });

  it('writes one latest config after the throttle and debounce windows for one book', async () => {
    vi.setSystemTime(0);
    render(<AutoSaveProbe bookKey={bookAKey} />);

    act(() => {
      relocate(bookAKey, 'epubcfi(/6/4)', 1);
      relocate(bookAKey, 'epubcfi(/6/6)', 2);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(14_999);
    });
    expect(appServiceMock.saveBookConfig).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(appServiceMock.saveBookConfig).toHaveBeenCalledTimes(1);
    expect(appServiceMock.saveBookConfig).toHaveBeenCalledWith(
      expect.objectContaining({ hash: bookA.hash }),
      expect.objectContaining({ location: 'epubcfi(/6/6)', progress: [3, 10] }),
      expect.anything(),
    );
  });
});
