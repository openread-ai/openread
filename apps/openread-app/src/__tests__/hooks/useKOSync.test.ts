import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useKOSync } from '@/app/reader/hooks/useKOSync';

const mocks = vi.hoisted(() => ({
  KOSyncClient: vi.fn(),
  eventOn: vi.fn(),
  eventOff: vi.fn(),
  settings: {
    kosync: {
      enabled: true,
      serverUrl: 'https://sync.example.com',
      username: 'saved-user',
      userkey: 'saved-key',
      deviceId: 'device-1',
      deviceName: 'Openread',
      checksumMethod: 'binary',
      strategy: 'silent',
    },
  },
}));

vi.mock('@/services/sync/KOSyncClient', () => ({
  KOSyncClient: mocks.KOSyncClient,
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: { appPlatform: 'web' } }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({ settings: mocks.settings }),
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({
    getProgress: () => ({ location: '/body/1', updatedAt: Date.now() }),
    getView: () => null,
  }),
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({
    getBookDataByReaderKey: () => ({
      book: { hash: 'book-1', title: 'Book', format: 'epub', updatedAt: Date.now() },
      bookDoc: {},
      config: { updatedAt: Date.now() },
    }),
  }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/utils/event', () => ({
  eventDispatcher: {
    on: mocks.eventOn,
    off: mocks.eventOff,
    dispatch: vi.fn(),
  },
}));

describe('useKOSync launch holdback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stays inert even when saved KOReader sync settings are enabled', async () => {
    const { result } = renderHook(() => useKOSync('book-1'));

    await waitFor(() => expect(result.current.syncState).toBe('idle'));
    expect(result.current.conflictDetails).toBeNull();
    expect(mocks.KOSyncClient).not.toHaveBeenCalled();
    expect(mocks.eventOn).not.toHaveBeenCalledWith('push-kosync', expect.any(Function));
    expect(mocks.eventOn).not.toHaveBeenCalledWith('pull-kosync', expect.any(Function));
  });
});
