import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import CollectionClient from '@/app/(platform)/explore/collection/[slug]/client';

const mockRouterPush = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: 'staff-picks' }),
  useRouter: () => ({
    push: mockRouterPush,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/hooks/useIntersectionLoader', () => ({
  useIntersectionLoader: () => vi.fn(),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token', user: { id: 'user-1' } }),
}));

vi.mock('@/hooks/useWishlist', () => ({
  useWishlist: () => ({
    isWishlisted: () => false,
    toggle: vi.fn(),
  }),
}));

const mockGetImportState = vi.fn(() => ({ status: 'idle', progress: 0 }));
const mockImportBook = vi.fn();

vi.mock('@/hooks/useCatalogImport', () => ({
  useCatalogImport: () => ({
    importBook: mockImportBook,
    getImportState: mockGetImportState,
  }),
}));

vi.mock('@/utils/nav', () => ({
  navigateToReader: vi.fn(),
}));

vi.mock('@/components/explore/BookDetailSheet', () => ({
  BookDetailSheet: () => null,
}));

function book(index: number) {
  return {
    id: `book-${index}`,
    title: `Collection Book ${index}`,
    author_name: `Author ${index}`,
    language: 'en',
    format_type: 'epub',
    cover_image_key: null,
    cover_is_generated: false,
    is_cached: true,
    import_count: index,
    page_count: 100 + index,
    file_size_bytes: 1_000_000 + index,
  };
}

describe('CollectionClient pagination', () => {
  beforeEach(() => {
    mockRouterPush.mockClear();
    mockSearchParams = new URLSearchParams();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/catalog/collections/staff-picks/books')) {
          const parsed = new URL(url, 'http://localhost');
          const page = Number(parsed.searchParams.get('page') ?? '1');
          const books = page === 1 ? Array.from({ length: 20 }, (_, i) => book(i + 1)) : [book(21)];
          return new Response(JSON.stringify({ books, total: 21 }), { status: 200 });
        }

        if (url.includes('/catalog/collections/staff-picks')) {
          return new Response(
            JSON.stringify({ name: 'Staff Picks', description: 'Curated', book_count: 21 }),
            { status: 200 },
          );
        }

        return new Response('{}', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows a visible load-more control and appends the next collection page', async () => {
    render(<CollectionClient />);

    await waitFor(() => {
      expect(screen.getAllByText('Collection Book 20').length).toBeGreaterThan(0);
    });

    expect(screen.getByText('Showing {{shown}} of {{total}} books')).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Load more' });
    expect(button).toBeTruthy();

    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getAllByText('Collection Book 21').length).toBeGreaterThan(0);
    });
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('page=2'), expect.any(Object));
    });
  });
});
