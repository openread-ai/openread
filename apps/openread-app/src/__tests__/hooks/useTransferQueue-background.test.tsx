import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Book } from '@/types/book';
import { testOpenReadBookRef } from '../utils/bookIdentityFixtures';

const { mocks } = vi.hoisted(() => {
  const library: Book[] = [];
  const appService = { exists: vi.fn(async () => true) };
  const envConfig = { appService };
  const transferManager = {
    initialize: vi.fn(async () => {}),
    isReady: vi.fn(() => true),
    queueBatchUploads: vi.fn(),
    queueUpload: vi.fn(),
    queueDownload: vi.fn(),
    cancelTransfer: vi.fn(),
    retryTransfer: vi.fn(),
    retryAllFailed: vi.fn(),
    pauseQueue: vi.fn(),
    resumeQueue: vi.fn(),
  };
  const transferState = {
    transfers: {},
    isQueuePaused: false,
    setIsTransferQueueOpen: vi.fn(),
  };
  const settingsState = { settings: { autoUpload: true } };
  const libraryState = { library, updateBook: vi.fn(async () => {}) };

  const useLibraryStore = vi.fn((selector: (state: typeof libraryState) => unknown) =>
    selector(libraryState),
  ) as unknown as ((selector: (state: typeof libraryState) => unknown) => unknown) & {
    getState: () => typeof libraryState;
  };
  useLibraryStore.getState = () => libraryState;

  const useSettingsStore = vi.fn((selector: (state: typeof settingsState) => unknown) =>
    selector(settingsState),
  ) as unknown as ((selector: (state: typeof settingsState) => unknown) => unknown) & {
    getState: () => typeof settingsState;
  };
  useSettingsStore.getState = () => settingsState;

  const useTransferStore = vi.fn((selector: (state: typeof transferState) => unknown) =>
    selector(transferState),
  ) as unknown as ((selector: (state: typeof transferState) => unknown) => unknown) & {
    getState: () => typeof transferState;
  };
  useTransferStore.getState = () => transferState;

  return {
    mocks: {
      appService,
      envConfig,
      library,
      libraryState,
      settingsState,
      transferManager,
      transferState,
      useLibraryStore,
      useSettingsStore,
      useTransferStore,
    },
  };
});

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig: mocks.envConfig, appService: mocks.appService }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/store/libraryStore', () => ({
  useLibraryStore: mocks.useLibraryStore,
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: mocks.useSettingsStore,
}));

vi.mock('@/store/transferStore', () => ({
  useTransferStore: mocks.useTransferStore,
}));

vi.mock('@/services/transferManager', () => ({
  transferManager: mocks.transferManager,
}));

function book(overrides: Partial<Book> = {}): Book {
  return {
    hash: testOpenReadBookRef('0123456789abcdef0123456789abcdef'),
    title: 'Local Book',
    sourceTitle: 'Local Book',
    author: 'Author',
    format: 'epub',
    createdAt: 1,
    updatedAt: 1,
    downloadedAt: 1,
    uploadedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

describe('useTransferQueue background backup recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.library.splice(0, mocks.library.length);
    mocks.library.push(book());
    mocks.appService.exists.mockResolvedValue(true);
    mocks.settingsState.settings.autoUpload = true;
    mocks.transferManager.isReady.mockReturnValue(true);
  });

  it('queues eligible local-only books as background uploads on startup recovery', async () => {
    const { useTransferQueue } = await import('@/hooks/useTransferQueue');

    renderHook(() => useTransferQueue(true, 0));

    await waitFor(() =>
      expect(mocks.transferManager.queueBatchUploads).toHaveBeenCalledWith(
        [expect.objectContaining({ title: 'Local Book' })],
        1,
        true,
      ),
    );
  });

  it('does not queue startup backup recovery when autoUpload is disabled', async () => {
    mocks.settingsState.settings.autoUpload = false;
    const { useTransferQueue } = await import('@/hooks/useTransferQueue');

    renderHook(() => useTransferQueue(true, 0));

    await waitFor(() => expect(mocks.transferManager.initialize).toHaveBeenCalled());
    expect(mocks.transferManager.queueBatchUploads).not.toHaveBeenCalled();
  });
});
