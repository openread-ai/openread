import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { EXPLORE_RAILS } from '@/components/explore/exploreRails';
import { useExploreRails } from '@/hooks/useExploreRails';

const mockListBooks = vi.fn();
const mockGetStats = vi.fn();

vi.mock('@/services/platform/client', () => ({
  platform: {
    catalog: {
      listBooks: (...args: unknown[]) => mockListBooks(...args),
      getStats: (...args: unknown[]) => mockGetStats(...args),
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetStats.mockResolvedValue({ total_active: 12, total_cached: 3, total_sources: 2 });
  mockListBooks.mockResolvedValue({ books: [], total: 0 });
});

afterEach(() => {
  cleanup();
});

describe('useExploreRails', () => {
  it('threads English through every rail and returns unfiltered canonical stats', async () => {
    const { result } = renderHook(() => useExploreRails(10, ['en']));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.totalActive).toBe(12);
    expect(mockGetStats).toHaveBeenCalledTimes(1);
    expect(mockListBooks).toHaveBeenCalledTimes(EXPLORE_RAILS.length);
    for (const [query] of mockListBooks.mock.calls) {
      expect(query).toEqual(expect.objectContaining({ languages: ['en'], page: 1, limit: 10 }));
    }
  });

  it('keeps successful rails available when the rebuilding stats request fails', async () => {
    mockGetStats.mockRejectedValueOnce(new Error('stats unavailable'));
    mockListBooks.mockResolvedValue({
      books: [
        {
          id: 'rail-book',
          title: 'Rail Book',
          author_name: 'Author',
          language: 'en',
          format_type: 'epub',
          cover_image_key: null,
          cover_is_generated: false,
          is_cached: false,
          import_count: 0,
          page_count: 100,
          file_size_bytes: 1000,
        },
      ],
      total: 1,
    });

    const { result } = renderHook(() => useExploreRails(10, ['en']));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.totalActive).toBeNull();
    expect(result.current.rails).toHaveLength(EXPLORE_RAILS.length);
  });

  it('omits the language parameter for All languages', async () => {
    const { result } = renderHook(() => useExploreRails(10, []));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    for (const [query] of mockListBooks.mock.calls) {
      expect(query.languages).toBeUndefined();
    }
  });
});
