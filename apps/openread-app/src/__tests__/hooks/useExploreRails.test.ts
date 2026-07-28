import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { useExploreRails } from '@/hooks/useExploreRails';

const mockListBooks = vi.fn();
const mockGetStats = vi.fn();
const mockListSubjects = vi.fn();

vi.mock('@/services/platform/client', () => ({
  platform: {
    catalog: {
      listBooks: (...args: unknown[]) => mockListBooks(...args),
      getStats: (...args: unknown[]) => mockGetStats(...args),
      listSubjects: (...args: unknown[]) => mockListSubjects(...args),
    },
  },
}));

const book = {
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
  source: 'gutenberg',
  source_id: 'gutenberg-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetStats.mockResolvedValue({ total_active: 12, total_cached: 3, total_sources: 2 });
  mockListSubjects.mockResolvedValue({
    subjects: [
      { subject_name: 'Literature & Fiction', book_count: 10 },
      { subject_name: 'History', book_count: 2 },
      { subject_name: 'Empty', book_count: 0 },
    ],
  });
  mockListBooks.mockResolvedValue({ books: [book], total: 1 });
});

afterEach(cleanup);

describe('useExploreRails', () => {
  it('builds category rails only from live non-zero counts', async () => {
    const { result } = renderHook(() => useExploreRails(10, ['en']));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.totalActive).toBe(12);
    expect(result.current.categories.map((category) => category.subject_name)).toEqual([
      'Literature & Fiction',
      'History',
    ]);
    expect(result.current.rails.map((rail) => rail.title)).toEqual([
      'Literature & Fiction',
      'History',
    ]);
    expect(mockListBooks).toHaveBeenCalledTimes(2);
    for (const [query] of mockListBooks.mock.calls) {
      expect(query).toEqual(expect.objectContaining({ languages: ['en'], page: 1, limit: 10 }));
    }
  });

  it('never renders a rail whose filtered query resolves to zero books', async () => {
    mockListBooks
      .mockResolvedValueOnce({ books: [book], total: 1 })
      .mockResolvedValueOnce({ books: [], total: 0 });

    const { result } = renderHook(() => useExploreRails(10, ['en']));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.rails).toHaveLength(1);
    expect(result.current.rails[0]?.title).toBe('Literature & Fiction');
  });

  it('omits the language parameter for All languages', async () => {
    const { result } = renderHook(() => useExploreRails(10, []));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    for (const [query] of mockListBooks.mock.calls) {
      expect(query.languages).toBeUndefined();
    }
  });
});
