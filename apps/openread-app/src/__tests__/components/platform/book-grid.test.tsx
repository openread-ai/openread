import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import {
  BookGrid,
  BookGridSkeleton,
  gridClasses,
  skeletonCounts,
} from '@/components/platform/book-grid';
import type { Book } from '@/types/book';
import type { GridSize } from '@/store/libraryViewStore';

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

// Mock libraryViewStore
const mockGridSize: { value: GridSize } = { value: 'medium' };
vi.mock('@/store/libraryViewStore', () => ({
  useLibraryViewStore: vi.fn((selector: (state: { gridSize: GridSize }) => GridSize) =>
    selector({ gridSize: mockGridSize.value }),
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

describe('BookGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGridSize.value = 'medium';
  });

  afterEach(() => {
    cleanup();
  });

  describe('Rendering', () => {
    it('should render all book cards in a grid', () => {
      const books = [
        createMockBook({ hash: 'book-1', title: 'Book One' }),
        createMockBook({ hash: 'book-2', title: 'Book Two' }),
        createMockBook({ hash: 'book-3', title: 'Book Three' }),
      ];
      render(<BookGrid books={books} />);

      expect(screen.getByTestId('book-card-book-1')).toBeTruthy();
      expect(screen.getByTestId('book-card-book-2')).toBeTruthy();
      expect(screen.getByTestId('book-card-book-3')).toBeTruthy();
    });

    it('should pass showProgress prop to BookCard', () => {
      const books = [createMockBook({ hash: 'book-1' })];
      render(<BookGrid books={books} />);

      const card = screen.getByTestId('book-card-book-1');
      // BookGrid always passes showProgress={true}
      expect(card.getAttribute('data-show-progress')).toBe('true');
    });

    it('should have responsive grid classes for medium size (default)', () => {
      const books = [createMockBook()];
      const { container } = render(<BookGrid books={books} />);
      const grid = container.querySelector('.grid');
      expect(grid).toBeTruthy();
      expect(grid?.className).toContain('grid-cols-2');
      expect(grid?.className).toContain('sm:grid-cols-3');
      expect(grid?.className).toContain('md:grid-cols-4');
      expect(grid?.className).toContain('lg:grid-cols-5');
      expect(grid?.className).toContain('xl:grid-cols-6');
    });

    it('should include transition-all class for smooth transitions', () => {
      const books = [createMockBook()];
      const { container } = render(<BookGrid books={books} />);
      const grid = container.querySelector('.grid');
      expect(grid?.className).toContain('transition-all');
    });
  });

  describe('Empty State', () => {
    it('should show default empty message when no books', () => {
      render(<BookGrid books={[]} />);
      expect(screen.getByText('No books found')).toBeTruthy();
    });

    it('should show custom empty message when provided', () => {
      render(<BookGrid books={[]} emptyMessage='Your library is empty' />);
      expect(screen.getByText('Your library is empty')).toBeTruthy();
    });

    it('should display BookOpen icon in empty state', () => {
      const { container } = render(<BookGrid books={[]} />);
      // Check for the lucide icon class or svg element
      const emptyContainer = container.querySelector('.border-dashed');
      expect(emptyContainer).toBeTruthy();
    });

    it('should not show empty state when books are present', () => {
      const books = [createMockBook()];
      render(<BookGrid books={books} emptyMessage='No books' />);
      expect(screen.queryByText('No books')).toBeNull();
    });
  });

  describe('Loading State', () => {
    it('should render skeleton when isLoading is true', () => {
      render(<BookGrid books={[]} isLoading />);
      expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
    });

    it('should not render book cards when loading', () => {
      const books = [createMockBook({ hash: 'book-1' })];
      render(<BookGrid books={books} isLoading />);
      expect(screen.queryByTestId('book-card-book-1')).toBeNull();
    });

    it('should not show empty state when loading', () => {
      render(<BookGrid books={[]} isLoading emptyMessage='No books' />);
      expect(screen.queryByText('No books')).toBeNull();
    });

    it('should use correct skeleton count based on grid size', () => {
      mockGridSize.value = 'medium';
      render(<BookGrid books={[]} isLoading />);
      // 12 items * 3 skeletons per item (cover + title + author) = 36 skeletons
      expect(screen.getAllByTestId('skeleton').length).toBe(36);
    });
  });

  describe('Styling', () => {
    it('should apply custom className', () => {
      const books = [createMockBook()];
      const { container } = render(<BookGrid books={books} className='custom-grid-class' />);
      expect(container.querySelector('.custom-grid-class')).toBeTruthy();
    });

    it('should have gap-4 for grid spacing', () => {
      const books = [createMockBook()];
      const { container } = render(<BookGrid books={books} />);
      const grid = container.querySelector('.gap-4');
      expect(grid).toBeTruthy();
    });
  });

  describe('Grid Sizes', () => {
    it('should apply small grid classes', () => {
      mockGridSize.value = 'small';
      const books = [createMockBook()];
      const { container } = render(<BookGrid books={books} />);
      const grid = container.querySelector('.grid');

      expect(grid?.className).toContain('grid-cols-3');
      expect(grid?.className).toContain('sm:grid-cols-4');
      expect(grid?.className).toContain('md:grid-cols-6');
      expect(grid?.className).toContain('lg:grid-cols-8');
    });

    it('should apply medium grid classes', () => {
      mockGridSize.value = 'medium';
      const books = [createMockBook()];
      const { container } = render(<BookGrid books={books} />);
      const grid = container.querySelector('.grid');

      expect(grid?.className).toContain('grid-cols-2');
      expect(grid?.className).toContain('sm:grid-cols-3');
      expect(grid?.className).toContain('md:grid-cols-4');
      expect(grid?.className).toContain('lg:grid-cols-5');
      expect(grid?.className).toContain('xl:grid-cols-6');
    });

    it('should apply large grid classes', () => {
      mockGridSize.value = 'large';
      const books = [createMockBook()];
      const { container } = render(<BookGrid books={books} />);
      const grid = container.querySelector('.grid');

      expect(grid?.className).toContain('grid-cols-2');
      expect(grid?.className).toContain('sm:grid-cols-2');
      expect(grid?.className).toContain('md:grid-cols-3');
      expect(grid?.className).toContain('lg:grid-cols-4');
    });

    it('should use correct skeleton count for small grid', () => {
      mockGridSize.value = 'small';
      render(<BookGrid books={[]} isLoading />);
      // 16 items * 3 skeletons per item = 48 skeletons
      expect(screen.getAllByTestId('skeleton').length).toBe(48);
    });

    it('should use correct skeleton count for large grid', () => {
      mockGridSize.value = 'large';
      render(<BookGrid books={[]} isLoading />);
      // 8 items * 3 skeletons per item = 24 skeletons
      expect(screen.getAllByTestId('skeleton').length).toBe(24);
    });
  });
});

describe('BookGridSkeleton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGridSize.value = 'medium';
  });

  afterEach(() => {
    cleanup();
  });

  it('should render default 12 skeleton items for medium grid', () => {
    render(<BookGridSkeleton />);
    // 12 items * 3 skeletons per item (cover + title + author) = 36 skeletons
    expect(screen.getAllByTestId('skeleton').length).toBe(36);
  });

  it('should render custom number of skeleton items', () => {
    render(<BookGridSkeleton count={6} />);
    // 6 items * 3 skeletons per item = 18 skeletons
    expect(screen.getAllByTestId('skeleton').length).toBe(18);
  });

  it('should have responsive grid classes for medium size (default)', () => {
    const { container } = render(<BookGridSkeleton />);
    const grid = container.querySelector('.grid');
    expect(grid).toBeTruthy();
    expect(grid?.className).toContain('grid-cols-2');
    expect(grid?.className).toContain('sm:grid-cols-3');
    expect(grid?.className).toContain('md:grid-cols-4');
    expect(grid?.className).toContain('lg:grid-cols-5');
    expect(grid?.className).toContain('xl:grid-cols-6');
  });

  it('should apply custom className', () => {
    const { container } = render(<BookGridSkeleton className='custom-skeleton-class' />);
    expect(container.querySelector('.custom-skeleton-class')).toBeTruthy();
  });

  it('should include transition-all class', () => {
    const { container } = render(<BookGridSkeleton />);
    const grid = container.querySelector('.grid');
    expect(grid?.className).toContain('transition-all');
  });

  describe('Grid Sizes', () => {
    it('should apply small grid classes and count', () => {
      const { container } = render(<BookGridSkeleton gridSize='small' />);
      const grid = container.querySelector('.grid');

      expect(grid?.className).toContain('grid-cols-3');
      expect(grid?.className).toContain('lg:grid-cols-8');
      // 16 items * 3 skeletons = 48
      expect(screen.getAllByTestId('skeleton').length).toBe(48);
    });

    it('should apply large grid classes and count', () => {
      const { container } = render(<BookGridSkeleton gridSize='large' />);
      const grid = container.querySelector('.grid');

      expect(grid?.className).toContain('grid-cols-2');
      expect(grid?.className).toContain('lg:grid-cols-4');
      // 8 items * 3 skeletons = 24
      expect(screen.getAllByTestId('skeleton').length).toBe(24);
    });

    it('should override default count with custom count', () => {
      render(<BookGridSkeleton gridSize='small' count={4} />);
      // 4 items * 3 skeletons = 12
      expect(screen.getAllByTestId('skeleton').length).toBe(12);
    });
  });
});

describe('Grid Configuration', () => {
  it('should have correct grid classes for each size', () => {
    expect(gridClasses.small).toBe('grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8');
    expect(gridClasses.medium).toBe(
      'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
    );
    expect(gridClasses.large).toBe('grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4');
  });

  it('should have correct skeleton counts for each size', () => {
    expect(skeletonCounts.small).toBe(16);
    expect(skeletonCounts.medium).toBe(12);
    expect(skeletonCounts.large).toBe(8);
  });
});
