import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testOpenReadBookRef } from '../utils/bookIdentityFixtures';
import type { Book } from '@/types/book';
import type { CatalogBook } from '@/types/catalog';

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(),
  importBook: vi.fn(),
  getImportState: vi.fn(() => ({ status: 'idle' as const })),
  useLibraryBooks: vi.fn(),
  useExploreRails: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.routerPush }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/hooks/useLibraryBooks', () => ({
  useLibraryBooks: mocks.useLibraryBooks,
}));

vi.mock('@/hooks/useExploreRails', () => ({
  useExploreRails: mocks.useExploreRails,
}));

vi.mock('@/hooks/useCatalogImport', () => ({
  useCatalogImport: () => ({
    importBook: mocks.importBook,
    getImportState: mocks.getImportState,
  }),
}));

vi.mock('@/utils/nav', () => ({
  navigateToReader: vi.fn(),
}));

vi.mock('@/components/platform/book-section', () => ({
  BookSection: ({
    title,
    books,
    emptyMessage,
    variant,
  }: {
    title: string;
    books: Book[];
    emptyMessage?: string;
    variant?: 'row' | 'hero';
  }) => (
    <section data-testid={`section-${title}`} data-variant={variant ?? 'row'}>
      {books.length === 0 ? emptyMessage : null}
      {books.map((book) => (
        <div key={book.hash}>{book.title}</div>
      ))}
    </section>
  ),
}));

vi.mock('@/components/explore/CollectionRow', () => ({
  CollectionRow: ({
    title,
    books,
    isLoading,
    seeAllHref,
    onImport,
    onCardTap,
  }: {
    title: string;
    books: CatalogBook[];
    isLoading?: boolean;
    seeAllHref?: string;
    onImport?: (bookId: string) => void;
    onCardTap?: (bookId: string) => void;
  }) => (
    <section data-testid='featured-row' data-loading={String(Boolean(isLoading))}>
      <h2>{title}</h2>
      <a href={seeAllHref}>See All</a>
      {books.map((book) => (
        <button key={book.id} type='button' onClick={() => onCardTap?.(book.id)}>
          {book.title}
        </button>
      ))}
      {books[0] && (
        <button type='button' onClick={() => onImport?.(books[0].id)}>
          Import first
        </button>
      )}
    </section>
  ),
}));

const book = (hash: string, title: string): Book => ({
  hash: testOpenReadBookRef(hash),
  title,
  author: 'Author',
  format: 'epub',
  createdAt: 1,
  updatedAt: 1,
  deletedAt: null,
});

const catalogBook = (id: string, title: string): CatalogBook => ({
  id,
  title,
  author_name: 'Author',
  language: 'en',
  format_type: 'epub',
  cover_image_key: null,
  cover_is_generated: false,
  cover_url: null,
  is_cached: false,
  import_count: 0,
  page_count: null,
  file_size_bytes: null,
  source: 'gutenberg',
  source_id: id,
});

describe('HomeSections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getImportState.mockReturnValue({ status: 'idle' });
    mocks.useExploreRails.mockReturnValue({ rails: [], isLoading: false, error: null });
  });

  afterEach(() => cleanup());

  it('renders Continue Reading hero before deduped Recently Added and Featured Explore', async () => {
    const reading = [book('reading-book', 'Reading Book')];
    const recent = [book('fresh-book', 'Fresh Book')];
    mocks.useLibraryBooks.mockImplementation(
      (options: { filter?: string; excludeHashes?: Set<string> }) => {
        if (options.filter === 'reading') return { books: reading, isLoading: false };
        if (options.filter === 'recent') {
          expect(options.excludeHashes?.has(testOpenReadBookRef('reading-book'))).toBe(true);
          return { books: recent, isLoading: false };
        }
        return { books: [], isLoading: false };
      },
    );
    mocks.useExploreRails.mockReturnValue({
      rails: [
        {
          id: 'featured',
          title: 'Featured',
          href: '/explore?rail=featured',
          books: [catalogBook('catalog-1', 'Catalog One')],
          total: 1,
        },
      ],
      isLoading: false,
      error: null,
    });

    const { HomeSections } = await import('@/app/(platform)/home/sections');
    render(<HomeSections />);

    const sections = screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent);
    expect(screen.getByTestId('section-Continue Reading').getAttribute('data-variant')).toBe(
      'hero',
    );
    expect(screen.getByText('Reading Book')).toBeTruthy();
    expect(screen.getByText('Fresh Book')).toBeTruthy();
    expect(sections).toEqual(['Featured from Explore']);
  });

  it('keeps category-specific empty messaging when the library is only partially empty', async () => {
    const recent = [book('fresh-book', 'Fresh Book')];
    mocks.useLibraryBooks.mockImplementation((options: { filter?: string }) => {
      if (options.filter === 'reading') return { books: [], isLoading: false };
      if (options.filter === 'recent') return { books: recent, isLoading: false };
      return { books: [], isLoading: false };
    });

    const { HomeSections } = await import('@/app/(platform)/home/sections');
    render(<HomeSections />);

    expect(screen.getByTestId('section-Continue Reading').textContent).toContain(
      'Start reading a book to see it here',
    );
    expect(screen.getByTestId('section-Recently Added').textContent).toContain('Fresh Book');
  });

  it('hides Featured Explore when rails fail or are empty', async () => {
    mocks.useLibraryBooks.mockReturnValue({ books: [], isLoading: false });
    mocks.useExploreRails.mockReturnValue({ rails: [], isLoading: false, error: 'offline' });

    const { FeaturedFromExplore } = await import('@/app/(platform)/home/sections');
    const { container } = render(<FeaturedFromExplore />);

    expect(container.firstChild).toBeNull();
  });

  it('uses existing Explore import and card navigation flow', async () => {
    mocks.useExploreRails.mockReturnValue({
      rails: [
        {
          id: 'featured',
          title: 'Featured',
          href: '/explore?rail=featured',
          books: [catalogBook('catalog-1', 'Catalog One')],
          total: 1,
        },
      ],
      isLoading: false,
      error: null,
    });

    const { FeaturedFromExplore } = await import('@/app/(platform)/home/sections');
    render(<FeaturedFromExplore />);

    fireEvent.click(screen.getByText('Import first'));
    expect(mocks.importBook).toHaveBeenCalledWith('catalog-1');

    fireEvent.click(screen.getByText('Catalog One'));
    expect(mocks.routerPush).toHaveBeenCalledWith('/explore?book=catalog-1', { scroll: false });
  });
});
