import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import { RemoveBookDialog } from '@/components/platform/remove-book-dialog';
import type { Book } from '@/types/book';

// Mock useBookActions hook - removeBook and bulkRemove are now synchronous (fire-and-forget)
const mockRemoveBook = vi.fn();
const mockBulkRemove = vi.fn();

vi.mock('@/hooks/useBookActions', () => ({
  useBookActions: () => ({
    removeBook: mockRemoveBook,
    bulkRemove: mockBulkRemove,
    setReadingStatus: vi.fn(),
    renameBook: vi.fn(),
    bulkSetReadingStatus: vi.fn(),
    bulkAddToCollection: vi.fn(),
  }),
}));

// Mock alert dialog components
vi.mock('@/components/primitives/alert-dialog', () => ({
  AlertDialog: ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange?: (open: boolean) => void;
  }) =>
    open ? (
      <div data-testid='alert-dialog' data-open-change={onOpenChange ? 'true' : 'false'}>
        {children}
      </div>
    ) : null,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='alert-dialog-content'>{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='alert-dialog-header'>{children}</div>
  ),
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2 data-testid='alert-dialog-title'>{children}</h2>
  ),
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p data-testid='alert-dialog-description'>{children}</p>
  ),
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='alert-dialog-footer'>{children}</div>
  ),
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => (
    <button data-testid='cancel-button'>{children}</button>
  ),
}));

// Mock Button component from primitives
vi.mock('@/components/primitives/button', () => ({
  Button: ({
    children,
    onClick,
    className,
    ...props
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
    [key: string]: unknown;
  }) => (
    <button onClick={onClick} className={className} {...props}>
      {children}
    </button>
  ),
}));

const createMockBook = (overrides: Partial<Book> = {}): Book => ({
  hash: 'book-123',
  title: 'Test Book',
  author: 'Test Author',
  format: 'epub',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ...overrides,
});

describe('RemoveBookDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('Rendering', () => {
    it('should not render when open is false', () => {
      const mockBook = createMockBook();
      render(<RemoveBookDialog book={mockBook} open={false} onOpenChange={() => {}} />);

      expect(screen.queryByTestId('alert-dialog')).toBeNull();
    });

    it('should render when open is true', () => {
      const mockBook = createMockBook();
      render(<RemoveBookDialog book={mockBook} open={true} onOpenChange={() => {}} />);

      expect(screen.getByTestId('alert-dialog')).toBeTruthy();
    });

    it('should render Cancel and Remove buttons', () => {
      const mockBook = createMockBook();
      render(<RemoveBookDialog book={mockBook} open={true} onOpenChange={() => {}} />);

      expect(screen.getByText('Cancel')).toBeTruthy();
      expect(screen.getByText('Remove')).toBeTruthy();
    });

    it('should not have loading state - button always shows "Remove"', () => {
      const mockBook = createMockBook();
      render(<RemoveBookDialog book={mockBook} open={true} onOpenChange={() => {}} />);

      // With optimistic updates, there is no loading state
      expect(screen.getByText('Remove')).toBeTruthy();
      expect(screen.queryByText('Removing...')).toBeNull();
    });
  });

  describe('Single book removal', () => {
    it('should show "Remove Book?" title for single book', () => {
      const mockBook = createMockBook({ title: 'The Great Gatsby' });
      render(<RemoveBookDialog book={mockBook} open={true} onOpenChange={() => {}} />);

      expect(screen.getByTestId('alert-dialog-title').textContent).toBe('Remove Book?');
    });

    it('should show book title in description', () => {
      const mockBook = createMockBook({ title: 'The Great Gatsby' });
      render(<RemoveBookDialog book={mockBook} open={true} onOpenChange={() => {}} />);

      const description = screen.getByTestId('alert-dialog-description');
      expect(description.textContent).toContain('The Great Gatsby');
      expect(description.textContent).toContain(
        'Are you sure you want to remove "The Great Gatsby" from your library?',
      );
    });

    it('should mention action can be undone', () => {
      const mockBook = createMockBook();
      render(<RemoveBookDialog book={mockBook} open={true} onOpenChange={() => {}} />);

      const description = screen.getByTestId('alert-dialog-description');
      expect(description.textContent).toContain('This action can be undone from settings.');
    });

    it('should call removeBook and close dialog immediately when Remove is clicked', () => {
      const mockBook = createMockBook();
      const onOpenChange = vi.fn();
      render(<RemoveBookDialog book={mockBook} open={true} onOpenChange={onOpenChange} />);

      fireEvent.click(screen.getByText('Remove'));

      // removeBook is fire-and-forget, dialog closes immediately
      expect(mockRemoveBook).toHaveBeenCalledWith(mockBook);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('should not call bulkRemove for single book', () => {
      const mockBook = createMockBook();
      render(<RemoveBookDialog book={mockBook} open={true} onOpenChange={vi.fn()} />);

      fireEvent.click(screen.getByText('Remove'));

      expect(mockRemoveBook).toHaveBeenCalled();
      expect(mockBulkRemove).not.toHaveBeenCalled();
    });
  });

  describe('Bulk removal', () => {
    it('should show count in title for multiple books', () => {
      render(
        <RemoveBookDialog
          bookHashes={['book-1', 'book-2', 'book-3']}
          open={true}
          onOpenChange={() => {}}
        />,
      );

      expect(screen.getByTestId('alert-dialog-title').textContent).toBe('Remove 3 Books?');
    });

    it('should show singular "Book" for single item in bulk mode', () => {
      render(<RemoveBookDialog bookHashes={['book-1']} open={true} onOpenChange={() => {}} />);

      expect(screen.getByTestId('alert-dialog-title').textContent).toBe('Remove 1 Book?');
    });

    it('should show count in description for multiple books', () => {
      render(
        <RemoveBookDialog
          bookHashes={['book-1', 'book-2', 'book-3']}
          open={true}
          onOpenChange={() => {}}
        />,
      );

      const description = screen.getByTestId('alert-dialog-description');
      expect(description.textContent).toContain('Are you sure you want to remove 3 books');
    });

    it('should show singular in description for single item bulk', () => {
      render(<RemoveBookDialog bookHashes={['book-1']} open={true} onOpenChange={() => {}} />);

      const description = screen.getByTestId('alert-dialog-description');
      expect(description.textContent).toContain('Are you sure you want to remove 1 book');
    });

    it('should call bulkRemove and close dialog immediately when Remove is clicked', () => {
      const hashes = ['book-1', 'book-2', 'book-3'];
      const onOpenChange = vi.fn();
      render(<RemoveBookDialog bookHashes={hashes} open={true} onOpenChange={onOpenChange} />);

      fireEvent.click(screen.getByText('Remove'));

      // bulkRemove is fire-and-forget, dialog closes immediately
      expect(mockBulkRemove).toHaveBeenCalledWith(hashes);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('should not call removeBook for bulk operation', () => {
      const hashes = ['book-1', 'book-2'];
      render(<RemoveBookDialog bookHashes={hashes} open={true} onOpenChange={vi.fn()} />);

      fireEvent.click(screen.getByText('Remove'));

      expect(mockBulkRemove).toHaveBeenCalled();
      expect(mockRemoveBook).not.toHaveBeenCalled();
    });

    it('should prefer bulk mode when both book and bookHashes are provided', () => {
      const mockBook = createMockBook();
      const hashes = ['book-1', 'book-2'];
      render(
        <RemoveBookDialog book={mockBook} bookHashes={hashes} open={true} onOpenChange={vi.fn()} />,
      );

      // Should show bulk title
      expect(screen.getByTestId('alert-dialog-title').textContent).toBe('Remove 2 Books?');

      fireEvent.click(screen.getByText('Remove'));

      expect(mockBulkRemove).toHaveBeenCalledWith(hashes);
      expect(mockRemoveBook).not.toHaveBeenCalled();
    });
  });

  describe('Cancel behavior', () => {
    it('should render Cancel button', () => {
      const mockBook = createMockBook();
      render(<RemoveBookDialog book={mockBook} open={true} onOpenChange={() => {}} />);

      expect(screen.getByText('Cancel')).toBeTruthy();
    });

    it('should not call removeBook when Cancel is clicked', () => {
      const mockBook = createMockBook();
      const onOpenChange = vi.fn();
      render(<RemoveBookDialog book={mockBook} open={true} onOpenChange={onOpenChange} />);

      fireEvent.click(screen.getByTestId('cancel-button'));

      expect(mockRemoveBook).not.toHaveBeenCalled();
      expect(mockBulkRemove).not.toHaveBeenCalled();
    });
  });

  describe('Styling', () => {
    it('should have destructive styling on Remove button', () => {
      const mockBook = createMockBook();
      render(<RemoveBookDialog book={mockBook} open={true} onOpenChange={() => {}} />);

      const removeButton = screen.getByText('Remove');
      expect(removeButton.className).toContain('bg-error');
      expect(removeButton.className).toContain('text-error-content');
      expect(removeButton.className).toContain('hover:bg-error/90');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty bookHashes array (not bulk mode)', () => {
      const mockBook = createMockBook({ title: 'My Book' });
      render(
        <RemoveBookDialog book={mockBook} bookHashes={[]} open={true} onOpenChange={() => {}} />,
      );

      // Should fall back to single book mode
      expect(screen.getByTestId('alert-dialog-title').textContent).toBe('Remove Book?');
      expect(screen.getByTestId('alert-dialog-description').textContent).toContain('My Book');
    });

    it('should handle undefined book in single mode', () => {
      const onOpenChange = vi.fn();
      render(<RemoveBookDialog book={null} open={true} onOpenChange={onOpenChange} />);

      fireEvent.click(screen.getByText('Remove'));

      // Should not call removeBook since book is null, but dialog still closes
      expect(mockRemoveBook).not.toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('should close dialog immediately after removal (optimistic update)', () => {
      const mockBook = createMockBook();
      const onOpenChange = vi.fn();
      render(<RemoveBookDialog book={mockBook} open={true} onOpenChange={onOpenChange} />);

      fireEvent.click(screen.getByText('Remove'));

      // Dialog closes synchronously - no waiting for server response
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
