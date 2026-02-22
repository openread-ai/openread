import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { LibraryHeader, SortOption, SortOrder } from '@/components/platform/library-header';

// Mock functions
const mockSetSearchQuery = vi.fn();
const mockSetGridSize = vi.fn();
const mockSetGroupBy = vi.fn();
const mockPush = vi.fn();

// Mock the translation hook
vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

// Mock the library view store
vi.mock('@/store/libraryViewStore', () => ({
  useLibraryViewStore: () => ({
    searchQuery: '',
    setSearchQuery: mockSetSearchQuery,
    gridSize: 'medium' as const,
    setGridSize: mockSetGridSize,
    groupBy: 'manual' as const,
    setGroupBy: mockSetGroupBy,
  }),
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock cn utility
vi.mock('@/utils/tailwind', () => ({
  cn: (...args: (string | boolean | undefined)[]) => args.filter(Boolean).join(' '),
}));

// Mock Radix Select components
vi.mock('@/components/primitives/select', () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    value: string;
    onValueChange: (value: string) => void;
  }) => (
    <div data-testid='select-root' data-value={value}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(
            child as React.ReactElement<{ onValueChange?: (value: string) => void }>,
            { onValueChange },
          );
        }
        return child;
      })}
    </div>
  ),
  SelectTrigger: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <button data-testid='select-trigger' className={className}>
      {children}
    </button>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span data-testid='select-value'>{placeholder}</span>
  ),
  SelectContent: ({
    children,
    className,
    onValueChange,
  }: {
    children: React.ReactNode;
    className?: string;
    onValueChange?: (value: string) => void;
  }) => (
    <div data-testid='select-content' className={className}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child as React.ReactElement<{ onClick?: () => void }>, {
            onClick: () => {
              const value = (child as React.ReactElement<{ value?: string }>).props.value;
              if (value && onValueChange) {
                onValueChange(value);
              }
            },
          });
        }
        return child;
      })}
    </div>
  ),
  SelectItem: ({
    children,
    value,
    onClick,
  }: {
    children: React.ReactNode;
    value: string;
    onClick?: () => void;
  }) => (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div data-testid={`select-item-${value}`} data-value={value} onClick={onClick}>
      {children}
    </div>
  ),
}));

// Mock Button component with support for variant detection
vi.mock('@/components/primitives/button', () => ({
  Button: ({
    children,
    onClick,
    title,
    variant,
    size,
    className,
    'data-testid': testId,
    'data-active': dataActive,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    title?: string;
    variant?: string;
    size?: string;
    className?: string;
    'data-testid'?: string;
    'data-active'?: boolean;
  }) => (
    <button
      data-testid={testId || 'button'}
      data-variant={variant}
      data-size={size}
      data-active={dataActive}
      onClick={onClick}
      title={title}
      className={`${className || ''} ${variant === 'secondary' ? 'bg-secondary' : ''}`}
    >
      {children}
    </button>
  ),
}));

// Mock Input component
vi.mock('@/components/primitives/input', () => ({
  Input: ({
    type,
    placeholder,
    value,
    onChange,
    className,
    'data-testid': testId,
  }: {
    type?: string;
    placeholder?: string;
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    className?: string;
    'data-testid'?: string;
  }) => (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      className={className}
      data-testid={testId || 'input'}
    />
  ),
}));

describe('LibraryHeader', () => {
  const defaultProps = {
    title: 'All Books',
    bookCount: 42,
    sort: 'addedAt' as SortOption,
    order: 'desc' as SortOrder,
    onSortChange: vi.fn(),
    onOrderChange: vi.fn(),
    onImport: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  describe('Rendering', () => {
    it('should render the title', () => {
      render(<LibraryHeader {...defaultProps} />);
      expect(screen.getByText('All Books')).toBeTruthy();
    });

    it('should render the book count with "books" text', () => {
      render(<LibraryHeader {...defaultProps} bookCount={42} />);
      expect(screen.getByText('42 books')).toBeTruthy();
    });

    it('should use singular "book" when count is 1', () => {
      render(<LibraryHeader {...defaultProps} bookCount={1} />);
      expect(screen.getByText('1 book')).toBeTruthy();
    });

    it('should render sort select', () => {
      render(<LibraryHeader {...defaultProps} />);
      const selects = screen.getAllByTestId('select-root');
      expect(selects.length).toBeGreaterThanOrEqual(1);
    });

    it('should render sort order toggle button', () => {
      render(<LibraryHeader {...defaultProps} />);
      expect(screen.getByTestId('sort-order-button')).toBeTruthy();
    });

    it('should render search input', () => {
      render(<LibraryHeader {...defaultProps} />);
      expect(screen.getByTestId('search-input')).toBeTruthy();
    });

    it('should render import button', () => {
      render(<LibraryHeader {...defaultProps} />);
      expect(screen.getByTestId('import-button')).toBeTruthy();
    });

    it('should render grid size toggle', () => {
      render(<LibraryHeader {...defaultProps} />);
      expect(screen.getByTestId('grid-size-toggle')).toBeTruthy();
      expect(screen.getByTestId('grid-size-small')).toBeTruthy();
      expect(screen.getByTestId('grid-size-medium')).toBeTruthy();
      expect(screen.getByTestId('grid-size-large')).toBeTruthy();
    });
  });

  describe('Search', () => {
    it('should show search input with placeholder', () => {
      render(<LibraryHeader {...defaultProps} />);
      const input = screen.getByTestId('search-input');
      expect(input.getAttribute('placeholder')).toBe('Search books...');
    });

    it('should debounce search input (300ms)', async () => {
      render(<LibraryHeader {...defaultProps} />);
      const input = screen.getByTestId('search-input');

      fireEvent.change(input, { target: { value: 'test query' } });

      // Should not be called immediately
      expect(mockSetSearchQuery).not.toHaveBeenCalled();

      // Advance time by 299ms - should still not be called
      act(() => {
        vi.advanceTimersByTime(299);
      });
      expect(mockSetSearchQuery).not.toHaveBeenCalled();

      // Advance to 300ms - should now be called
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(mockSetSearchQuery).toHaveBeenCalledWith('test query');
    });

    it('should show clear button when search has value', () => {
      render(<LibraryHeader {...defaultProps} />);
      const input = screen.getByTestId('search-input');

      // Initially no clear button
      expect(screen.queryByTestId('clear-search-button')).toBeNull();

      // Type something
      fireEvent.change(input, { target: { value: 'test' } });

      // Now clear button should appear
      expect(screen.getByTestId('clear-search-button')).toBeTruthy();
    });

    it('should clear search when X button clicked', () => {
      render(<LibraryHeader {...defaultProps} />);
      const input = screen.getByTestId('search-input');

      // Type something
      fireEvent.change(input, { target: { value: 'test' } });

      // Click clear button
      const clearButton = screen.getByTestId('clear-search-button');
      fireEvent.click(clearButton);

      // Should call setSearchQuery with empty string
      expect(mockSetSearchQuery).toHaveBeenCalledWith('');
    });
  });

  describe('Import Button', () => {
    it('should call onImport when clicked', () => {
      render(<LibraryHeader {...defaultProps} />);
      fireEvent.click(screen.getByTestId('import-button'));
      expect(defaultProps.onImport).toHaveBeenCalled();
    });
  });

  describe('Grid Size Toggle', () => {
    it('should call setGridSize with small when small button clicked', () => {
      render(<LibraryHeader {...defaultProps} />);
      fireEvent.click(screen.getByTestId('grid-size-small'));
      expect(mockSetGridSize).toHaveBeenCalledWith('small');
    });

    it('should call setGridSize with medium when medium button clicked', () => {
      render(<LibraryHeader {...defaultProps} />);
      fireEvent.click(screen.getByTestId('grid-size-medium'));
      expect(mockSetGridSize).toHaveBeenCalledWith('medium');
    });

    it('should call setGridSize with large when large button clicked', () => {
      render(<LibraryHeader {...defaultProps} />);
      fireEvent.click(screen.getByTestId('grid-size-large'));
      expect(mockSetGridSize).toHaveBeenCalledWith('large');
    });

    it('should highlight active grid size (medium)', () => {
      render(<LibraryHeader {...defaultProps} />);
      const mediumButton = screen.getByTestId('grid-size-medium');
      expect(mediumButton.getAttribute('data-active')).toBe('true');
      expect(mediumButton.getAttribute('data-variant')).toBe('ghost');
      expect(mediumButton.className).toContain('bg-base-300/50');
    });

    it('should not highlight inactive grid sizes', () => {
      render(<LibraryHeader {...defaultProps} />);
      const smallButton = screen.getByTestId('grid-size-small');
      const largeButton = screen.getByTestId('grid-size-large');
      expect(smallButton.getAttribute('data-active')).toBe('false');
      expect(smallButton.getAttribute('data-variant')).toBe('ghost');
      expect(largeButton.getAttribute('data-active')).toBe('false');
      expect(largeButton.getAttribute('data-variant')).toBe('ghost');
    });

    it('should have correct titles for accessibility', () => {
      render(<LibraryHeader {...defaultProps} />);
      expect(screen.getByTitle('Small grid')).toBeTruthy();
      expect(screen.getByTitle('Medium grid')).toBeTruthy();
      expect(screen.getByTitle('Large grid')).toBeTruthy();
    });
  });

  describe('Sort Options', () => {
    it('should render all sort options', () => {
      render(<LibraryHeader {...defaultProps} />);
      expect(screen.getByTestId('select-item-addedAt')).toBeTruthy();
      expect(screen.getByTestId('select-item-title')).toBeTruthy();
      // 'author' appears in both group-by and sort selects
      expect(screen.getAllByTestId('select-item-author').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByTestId('select-item-progress')).toBeTruthy();
    });

    it('should show correct current sort value', () => {
      render(<LibraryHeader {...defaultProps} sort='title' />);
      const selects = screen.getAllByTestId('select-root');
      const sortSelect = selects.find((el) => el.getAttribute('data-value') === 'title');
      expect(sortSelect).toBeTruthy();
    });

    it('should call onSortChange when a new sort option is selected', () => {
      const onSortChange = vi.fn();
      render(<LibraryHeader {...defaultProps} onSortChange={onSortChange} />);

      // Click on title option
      fireEvent.click(screen.getByTestId('select-item-title'));
      expect(onSortChange).toHaveBeenCalledWith('title');
    });
  });

  describe('Sort Order Toggle', () => {
    it('should show ascending title when order is descending', () => {
      render(<LibraryHeader {...defaultProps} order='desc' />);
      const button = screen.getByTestId('sort-order-button');
      expect(button.getAttribute('title')).toBe('Sort ascending');
    });

    it('should show descending title when order is ascending', () => {
      render(<LibraryHeader {...defaultProps} order='asc' />);
      const button = screen.getByTestId('sort-order-button');
      expect(button.getAttribute('title')).toBe('Sort descending');
    });

    it('should call onOrderChange with desc when current order is asc', () => {
      const onOrderChange = vi.fn();
      render(<LibraryHeader {...defaultProps} order='asc' onOrderChange={onOrderChange} />);

      fireEvent.click(screen.getByTestId('sort-order-button'));
      expect(onOrderChange).toHaveBeenCalledWith('desc');
    });

    it('should call onOrderChange with asc when current order is desc', () => {
      const onOrderChange = vi.fn();
      render(<LibraryHeader {...defaultProps} order='desc' onOrderChange={onOrderChange} />);

      fireEvent.click(screen.getByTestId('sort-order-button'));
      expect(onOrderChange).toHaveBeenCalledWith('asc');
    });
  });

  describe('Styling', () => {
    it('should have responsive layout classes', () => {
      const { container } = render(<LibraryHeader {...defaultProps} />);
      const headerDiv = container.firstChild as HTMLElement;
      expect(headerDiv.className).toContain('space-y-4');
    });

    it('should have title styled as h1 with proper classes', () => {
      render(<LibraryHeader {...defaultProps} />);
      const title = screen.getByText('All Books');
      expect(title.tagName).toBe('H1');
      expect(title.className).toContain('text-2xl');
      expect(title.className).toContain('font-bold');
    });

    it('should have book count with muted styling', () => {
      render(<LibraryHeader {...defaultProps} />);
      const count = screen.getByText('42 books');
      expect(count.tagName).toBe('P');
      expect(count.className).toContain('text-sm');
    });
  });

  describe('Different Sort Values', () => {
    it('should handle addedAt sort', () => {
      render(<LibraryHeader {...defaultProps} sort='addedAt' />);
      const selects = screen.getAllByTestId('select-root');
      const sortSelect = selects.find((el) => el.getAttribute('data-value') === 'addedAt');
      expect(sortSelect).toBeTruthy();
    });

    it('should handle author sort', () => {
      render(<LibraryHeader {...defaultProps} sort='author' />);
      const selects = screen.getAllByTestId('select-root');
      // Both group-by and sort may have 'author' value, but sort select should have it
      const sortSelects = selects.filter((el) => el.getAttribute('data-value') === 'author');
      expect(sortSelects.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle progress sort', () => {
      render(<LibraryHeader {...defaultProps} sort='progress' />);
      const selects = screen.getAllByTestId('select-root');
      const sortSelect = selects.find((el) => el.getAttribute('data-value') === 'progress');
      expect(sortSelect).toBeTruthy();
    });
  });
});
