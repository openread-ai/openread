import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCollections } from '@/hooks/useCollections';

const mocks = vi.hoisted(() => {
  const state = {
    collectionsOwnerUserId: 'user-1' as string | null,
    collections: [
      {
        id: 'collection-1',
        name: 'Favorites',
        bookHashes: [],
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    addCollection: vi.fn((name: string) => {
      const collection = {
        id: 'new-collection',
        name,
        bookHashes: [],
        createdAt: '2026-01-02T00:00:00.000Z',
      };
      state.collections = [...state.collections, collection];
      return collection;
    }),
    removeCollection: vi.fn(),
    renameCollection: vi.fn(),
    resetAccountScopedCollections: vi.fn(() => {
      state.collections = [];
    }),
    setCollectionsOwnerUserId: vi.fn((userId: string | null) => {
      state.collectionsOwnerUserId = userId;
    }),
  };
  let user: { id: string } | null = { id: 'user-1' };

  return {
    state,
    get user() {
      return user;
    },
    setUser(nextUser: { id: string } | null) {
      user = nextUser;
    },
  };
});

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: mocks.user }),
}));

vi.mock('@/store/platformSidebarStore', () => ({
  usePlatformSidebarStore: (selector: (state: typeof mocks.state) => unknown) =>
    selector(mocks.state),
}));

describe('useCollections account-scoped paint cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setUser({ id: 'user-1' });
    mocks.state.collectionsOwnerUserId = 'user-1';
    mocks.state.collections = [
      {
        id: 'collection-1',
        name: 'Favorites',
        bookHashes: [],
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];
  });

  it('returns persisted collections immediately when they belong to the current account', () => {
    const { result } = renderHook(() => useCollections());

    expect(result.current.collections.map((collection) => collection.id)).toEqual(['collection-1']);
  });

  it('withholds persisted collections when they belong to another account', () => {
    mocks.state.collectionsOwnerUserId = 'previous-user';

    const { result } = renderHook(() => useCollections());

    expect(result.current.collections).toEqual([]);
  });

  it('clears previous-account collections before creating a collection for the current account', () => {
    mocks.state.collectionsOwnerUserId = 'previous-user';

    const { result } = renderHook(() => useCollections());
    const created = result.current.createCollection('Current User Collection');

    expect(mocks.state.resetAccountScopedCollections).toHaveBeenCalled();
    expect(mocks.state.setCollectionsOwnerUserId).toHaveBeenCalledWith('user-1');
    expect(created).toEqual(expect.objectContaining({ name: 'Current User Collection' }));
    expect(mocks.state.collections).toEqual([
      expect.objectContaining({ id: 'new-collection', name: 'Current User Collection' }),
    ]);
  });
});
