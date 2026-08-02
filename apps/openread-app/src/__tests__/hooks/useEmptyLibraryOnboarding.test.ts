import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  emptyLibraryOnboardingKey,
  markEmptyLibraryOnboardingCompletedForUser,
  useEmptyLibraryOnboarding,
} from '@/hooks/useEmptyLibraryOnboarding';
import type { Book } from '@/types/book';

let mockUserId: string | null = 'user-a';
const mockLibraryState = {
  library: [] as Book[],
  lastSyncAt: null as number | null,
};

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: mockUserId ? { id: mockUserId } : null,
    token: mockUserId ? 'token' : null,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('@/store/libraryStore', () => ({
  useLibraryStore: (selector: (state: typeof mockLibraryState) => unknown) =>
    selector(mockLibraryState),
}));

describe('useEmptyLibraryOnboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUserId = 'user-a';
    mockLibraryState.library = [];
    mockLibraryState.lastSyncAt = null;
  });

  it('uses onboarding variant for an account with no onboarding state and no library history', () => {
    const { result } = renderHook(() => useEmptyLibraryOnboarding());
    expect(result.current.variant).toBe('onboarding');
    expect(result.current.shouldRouteToGetStarted).toBe(true);
  });

  it('uses empty-library variant after the same account completes onboarding', () => {
    const { result } = renderHook(() => useEmptyLibraryOnboarding());

    act(() => {
      result.current.completeOnboarding();
    });

    expect(localStorage.getItem(emptyLibraryOnboardingKey('user-a'))).toBe('completed');
    expect(result.current.variant).toBe('empty-library');
    expect(result.current.shouldRouteToGetStarted).toBe(false);
  });

  it('does not leak onboarding completion across accounts in the same browser', () => {
    markEmptyLibraryOnboardingCompletedForUser('user-a');
    mockUserId = 'user-b';

    const { result } = renderHook(() => useEmptyLibraryOnboarding());

    expect(localStorage.getItem(emptyLibraryOnboardingKey('user-a'))).toBe('completed');
    expect(result.current.variant).toBe('onboarding');
    expect(result.current.shouldRouteToGetStarted).toBe(true);
  });

  it('uses empty-library variant when tombstones or prior library records exist', () => {
    mockLibraryState.library = [
      {
        hash: 'book-1',
        title: 'Deleted Book',
        deletedAt: 123,
      } as Book,
    ];

    const { result } = renderHook(() => useEmptyLibraryOnboarding());

    expect(result.current.variant).toBe('empty-library');
    expect(result.current.shouldRouteToGetStarted).toBe(false);
  });

  it('uses empty-library variant when sync history exists', () => {
    mockLibraryState.lastSyncAt = 123;

    const { result } = renderHook(() => useEmptyLibraryOnboarding());

    expect(result.current.variant).toBe('empty-library');
    expect(result.current.shouldRouteToGetStarted).toBe(false);
  });
});
