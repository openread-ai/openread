import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TransferItem } from '@/store/transferStore';
import type { Book } from '@/types/book';
import { testOpenReadBookRef } from '../utils/bookIdentityFixtures';

const { mocks } = vi.hoisted(() => {
  const library: Book[] = [];
  const appService = { exists: vi.fn(async () => true) };
  const envConfig = { appService };
  const transferManager = {
    initialize: vi.fn(async () => {}),
    setActiveOwnerUserId: vi.fn(),
    isReady: vi.fn(() => true),
    recoverTerminalBackgroundUploads: vi.fn(),
    queueBatchUploads: vi.fn(),
    queueUpload: vi.fn(),
    queueDownload: vi.fn(),
    cancelTransfer: vi.fn(),
    retryTransfer: vi.fn(),
    retryAllFailed: vi.fn(),
    pauseQueue: vi.fn(),
    resumeQueue: vi.fn(),
  };
  const transferState: {
    transfers: Record<string, TransferItem>;
    isQueuePaused: boolean;
    removeTransfer: (transferId: string) => void;
  } = {
    transfers: {},
    isQueuePaused: false,
    removeTransfer: vi.fn((transferId: string) => {
      delete transferState.transfers[transferId];
    }),
  };
  const settingsState = { settings: { autoUpload: true } };
  const libraryState = {
    library,
    libraryOwnerUserId: 'user-a' as string | null,
    updateBook: vi.fn(async () => {}),
  };

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

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-a' } }),
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
  isTransferOwnedBy: (transfer: TransferItem, ownerUserId: string | null) =>
    Boolean(ownerUserId && transfer.ownerUserId === ownerUserId),
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
    mocks.libraryState.libraryOwnerUserId = 'user-a';
    mocks.transferState.transfers = {};
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
    expect(mocks.transferManager.recoverTerminalBackgroundUploads).toHaveBeenCalledWith([
      expect.objectContaining({ title: 'Local Book' }),
    ]);
    expect(mocks.transferManager.initialize).toHaveBeenCalledWith(
      mocks.appService,
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      'user-a',
    );
  });

  it('recovers terminal background uploads before lifecycle enqueue', async () => {
    const { useTransferQueue } = await import('@/hooks/useTransferQueue');

    renderHook(() => useTransferQueue(true, 0));

    await waitFor(() => expect(mocks.transferManager.queueBatchUploads).toHaveBeenCalled());
    expect(
      mocks.transferManager.recoverTerminalBackgroundUploads.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.transferManager.queueBatchUploads.mock.invocationCallOrder[0]);
  });

  it('does not recover or queue startup backup recovery when autoUpload is disabled', async () => {
    mocks.settingsState.settings.autoUpload = false;
    const { useTransferQueue } = await import('@/hooks/useTransferQueue');

    renderHook(() => useTransferQueue(true, 0));

    await waitFor(() => expect(mocks.transferManager.initialize).toHaveBeenCalled());
    expect(mocks.transferManager.recoverTerminalBackgroundUploads).not.toHaveBeenCalled();
    expect(mocks.transferManager.queueBatchUploads).not.toHaveBeenCalled();
  });

  it('does not recover or queue books without an upload source', async () => {
    mocks.appService.exists.mockResolvedValue(false);
    const { useTransferQueue } = await import('@/hooks/useTransferQueue');

    renderHook(() => useTransferQueue(true, 0));

    await waitFor(() => expect(mocks.transferManager.initialize).toHaveBeenCalled());
    await waitFor(() => expect(mocks.appService.exists).toHaveBeenCalled());
    expect(mocks.transferManager.recoverTerminalBackgroundUploads).not.toHaveBeenCalled();
    expect(mocks.transferManager.queueBatchUploads).not.toHaveBeenCalled();
  });

  it('does not treat same-owner reconciliation readiness as owner loss', async () => {
    const hash = book().hash;
    mocks.transferState.transfers = {
      own: {
        id: 'own',
        ownerUserId: 'user-a',
        bookHash: hash,
        bookTitle: 'Active upload',
        type: 'upload',
        status: 'in_progress',
        progress: 25,
        totalBytes: 100,
        transferredBytes: 25,
        transferSpeed: 1,
        retryCount: 0,
        maxRetries: 3,
        createdAt: 1,
        priority: 1,
        isBackground: true,
      },
    };
    const { useTransferQueue } = await import('@/hooks/useTransferQueue');
    const { rerender } = renderHook(({ ready }) => useTransferQueue(ready, 0), {
      initialProps: { ready: true },
    });
    await waitFor(() => expect(mocks.transferManager.initialize).toHaveBeenCalled());
    mocks.transferManager.setActiveOwnerUserId.mockClear();

    rerender({ ready: false });

    await waitFor(() => expect(mocks.transferManager.setActiveOwnerUserId).toHaveBeenCalled());
    expect(mocks.transferManager.setActiveOwnerUserId).toHaveBeenCalledWith('user-a');
    expect(mocks.transferManager.setActiveOwnerUserId).not.toHaveBeenCalledWith(null);
    expect(mocks.transferState.transfers['own']?.status).toBe('in_progress');
  });

  it('exposes and clears only transfers owned by the active account', async () => {
    const hash = book().hash;
    const makeTransfer = (
      id: string,
      ownerUserId?: string,
      status: TransferItem['status'] = 'pending',
    ): TransferItem => ({
      id,
      ownerUserId,
      bookHash: hash,
      bookTitle: `${id} title`,
      type: 'upload',
      status,
      progress: 25,
      totalBytes: 100,
      transferredBytes: 25,
      transferSpeed: 1,
      retryCount: 0,
      maxRetries: 3,
      createdAt: 1,
      priority: 1,
      isBackground: true,
    });
    mocks.transferState.transfers = {
      foreign: makeTransfer('foreign', 'user-b'),
      'foreign-completed': makeTransfer('foreign-completed', 'user-b', 'completed'),
      'foreign-failed': makeTransfer('foreign-failed', 'user-b', 'failed'),
      legacy: makeTransfer('legacy'),
      'own-completed': makeTransfer('own-completed', 'user-a', 'completed'),
      'own-failed': makeTransfer('own-failed', 'user-a', 'failed'),
      own: makeTransfer('own', 'user-a'),
    };
    const { useTransferQueue } = await import('@/hooks/useTransferQueue');

    const { result } = renderHook(() => useTransferQueue(true, 0));

    expect(result.current.transfers.map((transfer) => transfer.id)).toEqual([
      'own-completed',
      'own-failed',
      'own',
    ]);
    expect(result.current.pendingTransfers.map((transfer) => transfer.id)).toEqual(['own']);
    expect(result.current.completedTransfers.map((transfer) => transfer.id)).toEqual([
      'own-completed',
    ]);
    expect(result.current.failedTransfers.map((transfer) => transfer.id)).toEqual(['own-failed']);
    expect(result.current.stats).toEqual({
      pending: 1,
      active: 0,
      completed: 1,
      failed: 1,
      total: 3,
    });
    expect(result.current.getTransferProgress(hash, 'upload')?.id).toBe('own');

    act(() => result.current.clearCompleted());
    expect(mocks.transferState.transfers['own-completed']).toBeUndefined();
    expect(mocks.transferState.transfers['foreign-completed']).toBeDefined();

    act(() => result.current.clearFailed());
    expect(mocks.transferState.transfers['own-failed']).toBeUndefined();
    expect(mocks.transferState.transfers['foreign-failed']).toBeDefined();

    act(() => result.current.clearAll());
    expect(Object.keys(mocks.transferState.transfers).sort()).toEqual([
      'foreign',
      'foreign-completed',
      'foreign-failed',
      'legacy',
    ]);
  });
});
