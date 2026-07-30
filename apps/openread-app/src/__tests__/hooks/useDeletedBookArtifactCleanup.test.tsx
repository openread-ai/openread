import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useLibraryStore } from '@/store/libraryStore';
import { useReaderStore } from '@/store/readerStore';
import { useTransferStore } from '@/store/transferStore';
import type { Book } from '@/types/book';
import { testLocalBookHash } from '../utils/bookIdentityFixtures';

const mocks = vi.hoisted(() => ({
  cleanupDeletedBookArtifacts: vi.fn(async () => ({
    candidates: 1,
    evicted: 0,
    retained: 1,
    failed: 0,
    bytesReclaimed: 0,
    localStorageKeysRemoved: 0,
  })),
  appService: {},
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-a' } }),
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: mocks.appService }),
}));

vi.mock('@/services/auth/clientAuth', () => ({
  clientAuth: { getSnapshot: () => ({ user: { id: 'user-a' } }) },
}));

vi.mock('@/services/deletedBookArtifactCleanup', () => ({
  cleanupDeletedBookArtifacts: mocks.cleanupDeletedBookArtifacts,
}));

const hash = testLocalBookHash('cleanup-hook');
const tombstone: Book = {
  hash,
  title: 'Deleted Book',
  author: 'Author',
  format: 'epub',
  createdAt: 1,
  updatedAt: 2,
  deletedAt: 2,
};

describe('useDeletedBookArtifactCleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLibraryStore.setState({
      library: [tombstone],
      libraryLoaded: true,
      libraryOwnerUserId: 'user-a',
      isReconciling: false,
    });
    useTransferStore.setState({ transfers: {}, isQueuePaused: false });
    useReaderStore.setState({ bookKeys: [] });
  });

  it('reruns when transfer and reader eligibility changes', async () => {
    const { useDeletedBookArtifactCleanup } = await import('@/hooks/useDeletedBookArtifactCleanup');
    renderHook(() => useDeletedBookArtifactCleanup(true, true));
    await waitFor(() => expect(mocks.cleanupDeletedBookArtifacts).toHaveBeenCalledTimes(1));

    let transferId = '';
    act(() => {
      transferId = useTransferStore
        .getState()
        .addTransfer(hash, tombstone.title, 'upload', 1, true, 'user-a');
    });
    await waitFor(() => expect(mocks.cleanupDeletedBookArtifacts).toHaveBeenCalledTimes(2));

    act(() => {
      useTransferStore.getState().setTransferStatus(transferId, 'completed');
    });
    await waitFor(() => expect(mocks.cleanupDeletedBookArtifacts).toHaveBeenCalledTimes(3));

    act(() => {
      useReaderStore.getState().setBookKeys([`${hash}::reader-session`]);
    });
    await waitFor(() => expect(mocks.cleanupDeletedBookArtifacts).toHaveBeenCalledTimes(4));

    act(() => {
      useReaderStore.getState().setBookKeys([]);
    });
    await waitFor(() => expect(mocks.cleanupDeletedBookArtifacts).toHaveBeenCalledTimes(5));
  });
});
