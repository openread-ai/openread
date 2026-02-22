import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { BookSection, BookSectionSkeleton } from '@/components/platform/book-section';
import type { Book } from '@/types/book';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock BookCard component
vi.mock('@/components/platform/book-card', () => ({
  BookCard: ({ book, showProgress }: { book: Book; showProgress?: boolean }) => (
    <div data-testid={`book-card-${book.hash}`} data-show-progress={showProgress}>
      {book.title}
    </div>
  ),
}));

// Mock Skeleton component
vi.mock('@/components/primitives/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid='skeleton' className={className} />
  ),
}));

const createMockBook = (overrides: Partial<Book> = {}): Book => ({
  hash: `hash-${Math.random().toString(36).substring(7)}`,
  title: 'Test Book',
  author: 'Test Author',
  format: 'epub',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  coverImageUrl: null,
  ...overrides,
});

describe('BookSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('Rendering', () => {
    it('should render section title', () => {
      render(<BookSection title='Reading Now' books={[]} />);
      expect(screen.getByText('Reading Now')).toBeTruthy();
    });

    it('should render all book cards', () => {
      const books = [
        createMockBook({ hash: 'book-1', title: 'Book One' }),
        createMockBook({ hash: 'book-2', title: 'Book Two' }),
        createMockBook({ hash: 'book-3', title: 'Book Three' }),
      ];
      render(<BookSection title='Library' books={books} />);

      expect(screen.getByTestId('book-card-book-1')).toBeTruthy();
      expect(screen.getByTestId('book-card-book-2')).toBeTruthy();
      expect(screen.getByTestId('book-card-book-3')).toBeTruthy();
    });

    it('should pass showProgress prop to BookCard', () => {
      const books = [createMockBook({ hash: 'book-1' })];
      render(<BookSection title='Reading' books={books} showProgress />);

      const card = screen.getByTestId('book-card-book-1');
      expect(card.getAttribute('data-show-progress')).toBe('true');
    });
  });

  describe('Empty State', () => {
    it('should show default empty message when no books', () => {
      render(<BookSection title='Library' books={[]} />);
      expect(screen.getByText('No books yet')).toBeTruthy();
    });

    it('should show custom empty message when provided', () => {
      render(
        <BookSection title='Library' books={[]} emptyMessage='Start reading to see books here' />,
      );
      expect(screen.getByText('Start reading to see books here')).toBeTruthy();
    });

    it('should not show empty message when books are present', () => {
      const books = [createMockBook()];
      render(<BookSection title='Library' books={books} emptyMessage='No books' />);
      expect(screen.queryByText('No books')).toBeNull();
    });
  });

  describe('See All Link', () => {
    it('should show See All link when href is provided and books exist', () => {
      const books = [createMockBook()];
      render(<BookSection title='Library' books={books} href='/library' limit={1} />);

      const seeAllLink = screen.getByText('See All');
      expect(seeAllLink).toBeTruthy();
      expect(seeAllLink.closest('a')?.getAttribute('href')).toBe('/library');
    });

    it('should not show See All link when no href is provided', () => {
      const books = [createMockBook()];
      render(<BookSection title='Library' books={books} />);
      expect(screen.queryByText('See All')).toBeNull();
    });

    it('should not show See All link when books array is empty', () => {
      render(<BookSection title='Library' books={[]} href='/library' />);
      expect(screen.queryByText('See All')).toBeNull();
    });
  });

  describe('Loading State', () => {
    it('should render skeleton when isLoading is true', () => {
      render(<BookSection title='Loading Section' books={[]} isLoading />);
      // Should show skeleton elements
      expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
    });

    it('should not render book cards when loading', () => {
      const books = [createMockBook({ hash: 'book-1' })];
      render(<BookSection title='Loading Section' books={books} isLoading />);
      expect(screen.queryByTestId('book-card-book-1')).toBeNull();
    });
  });

  describe('Styling', () => {
    it('should apply custom className', () => {
      const { container } = render(
        <BookSection title='Library' books={[]} className='custom-section-class' />,
      );
      expect(container.querySelector('.custom-section-class')).toBeTruthy();
    });
  });
});

describe('BookSectionSkeleton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('should render section title', () => {
    render(<BookSectionSkeleton title='Loading...' />);
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('should render default 5 skeleton items', () => {
    render(<BookSectionSkeleton title='Loading' />);
    // 5 items * 3 skeletons per item (cover + title + author) = 15 skeletons
    expect(screen.getAllByTestId('skeleton').length).toBe(15);
  });

  it('should render custom number of skeleton items', () => {
    render(<BookSectionSkeleton title='Loading' count={3} />);
    // 3 items * 3 skeletons per item = 9 skeletons
    expect(screen.getAllByTestId('skeleton').length).toBe(9);
  });

  it('should apply custom className', () => {
    const { container } = render(
      <BookSectionSkeleton title='Loading' className='custom-skeleton-class' />,
    );
    expect(container.querySelector('.custom-skeleton-class')).toBeTruthy();
  });
});
