import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookConfig, BookNote } from '@/types/book';
import type { SyncableBookRef } from '@openread/types';
import { useSync } from '@/hooks/useSync';

const mocks = vi.hoisted(() => ({
  setSettings: vi.fn(),
  setIsSyncing: vi.fn(),
  subscribe: vi.fn(() => vi.fn()),
  pullBookConfigs: vi.fn(),
  pullBookNotes: vi.fn(),
  pullNow: vi.fn(),
  transformBookConfigFromDB: vi.fn(() => {
    throw new Error('DB config transform must not run for syncWorker canonical configs');
  }),
  transformBookNoteFromDB: vi.fn(() => {
    throw new Error('DB note transform must not run for syncWorker canonical notes');
  }),
  transformBookFromDB: vi.fn(),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: Object.assign(
    () => ({ settings: { keepLogin: true }, setSettings: mocks.setSettings }),
    { getState: () => ({ settings: { keepLogin: true }, setSettings: mocks.setSettings }) },
  ),
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: (selector?: (state: { setIsSyncing: typeof mocks.setIsSyncing }) => unknown) => {
    const state = { setIsSyncing: mocks.setIsSyncing };
    return selector ? selector(state) : state;
  },
}));

vi.mock('@/services/sync/syncWorker', () => ({
  syncWorker: {
    subscribe: mocks.subscribe,
    pullBookConfigs: mocks.pullBookConfigs,
    pullBookNotes: mocks.pullBookNotes,
    pullNow: mocks.pullNow,
  },
}));

vi.mock('@/utils/transform', () => ({
  transformBookConfigFromDB: mocks.transformBookConfigFromDB,
  transformBookNoteFromDB: mocks.transformBookNoteFromDB,
  transformBookFromDB: mocks.transformBookFromDB,
}));

vi.mock('@/services/sync/helpers', () => ({
  enqueueBookConfigsForSync: vi.fn(),
  enqueueBookNotesForSync: vi.fn(),
  enqueueBooksForSync: vi.fn(),
}));

vi.mock('@/utils/event', () => ({
  eventDispatcher: { dispatch: vi.fn() },
}));

describe('useSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.subscribe.mockReturnValue(vi.fn());
  });

  afterEach(() => {
    cleanup();
  });

  it('uses canonical configs returned by syncWorker on first remote config pull', async () => {
    const remoteConfig: BookConfig = {
      bookHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as SyncableBookRef,
      progress: [7, 10],
      location: 'epubcfi(/6/14)',
      updatedAt: 10_000,
    };
    mocks.pullBookConfigs.mockResolvedValueOnce([remoteConfig]);

    const { result } = renderHook(() => useSync(remoteConfig.bookHash));

    await act(async () => {
      await result.current.syncConfigs(undefined, remoteConfig.bookHash, null, 'pull');
    });

    await waitFor(() => expect(result.current.syncedConfigs).toEqual([remoteConfig]));
    expect(result.current.lastConfigPullAt).toBe(10_000);
    expect(mocks.transformBookConfigFromDB).not.toHaveBeenCalled();
    expect(result.current.syncError).toBeNull();
  });

  it('uses canonical notes returned by syncWorker without DB-row transformation', async () => {
    const remoteNote: BookNote = {
      bookHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as SyncableBookRef,
      id: 'note-1',
      type: 'annotation',
      cfi: 'epubcfi(/6/16)',
      text: 'Remote note',
      note: '',
      createdAt: 10_500,
      updatedAt: 11_000,
    };
    mocks.pullBookNotes.mockResolvedValueOnce([remoteNote]);

    const { result } = renderHook(() => useSync(remoteNote.bookHash));

    await act(async () => {
      await result.current.syncNotes(undefined, remoteNote.bookHash, null, 'pull');
    });

    await waitFor(() => expect(result.current.syncedNotes).toEqual([remoteNote]));
    expect(result.current.lastNotePullAt).toBe(11_000);
    expect(mocks.transformBookNoteFromDB).not.toHaveBeenCalled();
    expect(result.current.syncError).toBeNull();
  });
});
