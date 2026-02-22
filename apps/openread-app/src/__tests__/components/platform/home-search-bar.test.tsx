import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { HomeSearchBar } from '@/components/platform/HomeSearchBar';
import type { Book } from '@/types/book';

// Mock functions
const mockPush = vi.fn();
const mockGetVisibleLibrary = vi.fn<() => Book[]>();

// Mock the translation hook
vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock the library store
// The component calls useLibraryStore((state) => state.library),
// so the mock must provide `library` (not just `getVisibleLibrary`).
vi.mock('@/store/libraryStore', () => ({
  useLibraryStore: (selector: (state: { library: Book[] }) => unknown) =>
    selector({ library: mockGetVisibleLibrary() }),
}));

// Mock cn utility
vi.mock('@/utils/tailwind', () => ({
  cn: (...args: (string | boolean | undefined)[]) => args.filter(Boolean).join(' '),
}));

// Mock Input component
vi.mock('@/components/primitives/input', async () => {
  const { forwardRef } = await import('react');
  const MockInput = forwardRef<
    HTMLInputElement,
    {
      type?: string;
      placeholder?: string;
      value?: string;
      onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
      onFocus?: () => void;
      className?: string;
      'data-testid'?: string;
    }
  >(({ type, placeholder, value, onChange, onFocus, className, 'data-testid': testId }, ref) => (
    <input
      ref={ref}
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      onFocus={onFocus}
      className={className}
      data-testid={testId || 'input'}
    />
  ));
  MockInput.displayName = 'MockInput';
  return { Input: MockInput };
});

// Sample books for testing
const mockBooks: Book[] = [
  {
    hash: 'hash-1',
    title: 'The Great Gatsby',
    author: 'F. Scott Fitzgerald',
    format: 'epub',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    hash: 'hash-2',
    title: 'To Kill a Mockingbird',
    author: 'Harper Lee',
    format: 'pdf',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    hash: 'hash-3',
    title: '1984',
    author: 'George Orwell',
    format: 'epub',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    hash: 'hash-4',
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    format: 'mobi',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    hash: 'hash-5',
    title: 'The Catcher in the Rye',
    author: 'J.D. Salinger',
    format: 'epub',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    hash: 'hash-6',
    title: 'Lord of the Flies',
    author: 'William Golding',
    format: 'pdf',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    hash: 'hash-7',
    title: 'Animal Farm',
    author: 'George Orwell',
    format: 'epub',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    hash: 'hash-8',
    title: 'Brave New World',
    author: 'Aldous Huxley',
    format: 'pdf',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    hash: 'hash-9',
    title: 'The Hobbit',
    author: 'J.R.R. Tolkien',
    format: 'epub',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    hash: 'hash-10',
    title: 'Fahrenheit 451',
    author: 'Ray Bradbury',
    format: 'mobi',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

describe('HomeSearchBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockGetVisibleLibrary.mockReturnValue(mockBooks);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  describe('Rendering', () => {
    it('should render search bar with placeholder', () => {
      render(<HomeSearchBar />);
      const input = screen.getByTestId('home-search-input');
      expect(input).toBeTruthy();
      expect(input.getAttribute('placeholder')).toBe('Search your library...');
    });

    it('should render the search bar container', () => {
      render(<HomeSearchBar />);
      expect(screen.getByTestId('home-search-bar')).toBeTruthy();
    });

    it('should not show results dropdown initially', () => {
      render(<HomeSearchBar />);
      expect(screen.queryByTestId('home-search-results')).toBeNull();
    });

    it('should not show clear button when input is empty', () => {
      render(<HomeSearchBar />);
      expect(screen.queryByTestId('home-search-clear')).toBeNull();
    });
  });

  describe('Filtering by title', () => {
    it('should filter books by title (case-insensitive)', () => {
      render(<HomeSearchBar />);
      const input = screen.getByTestId('home-search-input');

      fireEvent.change(input, { target: { value: 'gatsby' } });

      // Wait for debounce
      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(screen.getByTestId('home-search-results')).toBeTruthy();
      expect(screen.getByTestId('home-search-result-hash-1')).toBeTruthy();
      expect(screen.getByText('The Great Gatsby')).toBeTruthy();
    });

    it('should match partial title', () => {
      render(<HomeSearchBar />);
      const input = screen.getByTestId('home-search-input');

      fireEvent.change(input, { target: { value: 'the' } });

      act(() => {
        vi.advanceTimersByTime(300);
      });

      // Should match "The Great Gatsby", "The Catcher in the Rye", "The Hobbit"
      expect(screen.getByTestId('home-search-result-hash-1')).toBeTruthy();
      expect(screen.getByTestId('home-search-result-hash-5')).toBeTruthy();
      expect(screen.getByTestId('home-search-result-hash-9')).toBeTruthy();
    });
  });

  describe('Filtering by author', () => {
    it('should filter books by author (case-insensitive)', () => {
      render(<HomeSearchBar />);
      const input = screen.getByTestId('home-search-input');

      fireEvent.change(input, { target: { value: 'orwell' } });

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(screen.getByTestId('home-search-results')).toBeTruthy();
      // Should find "1984" and "Animal Farm" by George Orwell
      expect(screen.getByTestId('home-search-result-hash-3')).toBeTruthy();
      expect(screen.getByTestId('home-search-result-hash-7')).toBeTruthy();
    });
  });

  describe('Results dropdown', () => {
    it('should show results dropdown when matches found', () => {
      render(<HomeSearchBar />);
      const input = screen.getByTestId('home-search-input');

      fireEvent.change(input, { target: { value: 'gatsby' } });

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(screen.getByTestId('home-search-results')).toBeTruthy();
    });

    it('should show empty state when no matches', () => {
      render(<HomeSearchBar />);
      const input = screen.getByTestId('home-search-input');

      fireEvent.change(input, { target: { value: 'zzzznonexistent' } });

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(screen.getByTestId('home-search-results')).toBeTruthy();
      expect(screen.getByTestId('home-search-empty')).toBeTruthy();
      expect(screen.getByText('No books found')).toBeTruthy();
    });

    it('should limit results to max 8', () => {
      render(<HomeSearchBar />);
      const input = screen.getByTestId('home-search-input');

      // Search for something that matches many books
      fireEvent.change(input, { target: { value: 'a' } });

      act(() => {
        vi.advanceTimersByTime(300);
      });

      // Count the number of result items
      const results = screen.getByTestId('home-search-results');
      const resultButtons = results.querySelectorAll('li');
      expect(resultButtons.length).toBeLessThanOrEqual(8);
    });
  });

  describe('Clear button', () => {
    it('should show clear button when query has text', () => {
      render(<HomeSearchBar />);
      const input = screen.getByTestId('home-search-input');

      fireEvent.change(input, { target: { value: 'test' } });

      expect(screen.getByTestId('home-search-clear')).toBeTruthy();
    });

    it('should clear search and close dropdown when clear button clicked', () => {
      render(<HomeSearchBar />);
      const input = screen.getByTestId('home-search-input');

      fireEvent.change(input, { target: { value: 'gatsby' } });

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(screen.getByTestId('home-search-results')).toBeTruthy();

      // Click clear
      fireEvent.click(screen.getByTestId('home-search-clear'));

      // Wait for debounce to settle after clearing
      act(() => {
        vi.advanceTimersByTime(300);
      });

      // Input should be cleared
      expect((input as HTMLInputElement).value).toBe('');
      // Dropdown should be closed
      expect(screen.queryByTestId('home-search-results')).toBeNull();
    });
  });

  describe('Navigation', () => {
    it('should navigate to reader when clicking a result', () => {
      render(<HomeSearchBar />);
      const input = screen.getByTestId('home-search-input');

      fireEvent.change(input, { target: { value: 'gatsby' } });

      act(() => {
        vi.advanceTimersByTime(300);
      });

      fireEvent.click(screen.getByTestId('home-search-result-hash-1'));
      expect(mockPush).toHaveBeenCalledWith('/reader?ids=hash-1');
    });

    it('should close dropdown after selecting a result', () => {
      render(<HomeSearchBar />);
      const input = screen.getByTestId('home-search-input');

      fireEvent.change(input, { target: { value: 'gatsby' } });

      act(() => {
        vi.advanceTimersByTime(300);
      });

      fireEvent.click(screen.getByTestId('home-search-result-hash-1'));

      // Dropdown should be closed after navigation
      expect(screen.queryByTestId('home-search-results')).toBeNull();
    });
  });

  describe('Keyboard shortcuts', () => {
    it('should close dropdown on Escape key', () => {
      render(<HomeSearchBar />);
      const input = screen.getByTestId('home-search-input');

      fireEvent.change(input, { target: { value: 'gatsby' } });

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(screen.getByTestId('home-search-results')).toBeTruthy();

      // Press Escape
      fireEvent.keyDown(window, { key: 'Escape' });

      expect(screen.queryByTestId('home-search-results')).toBeNull();
    });

    it('should focus input on Cmd+K', () => {
      render(<HomeSearchBar />);
      const input = screen.getByTestId('home-search-input');

      // Blur the input first
      fireEvent.blur(input);

      // Press Cmd+K
      fireEvent.keyDown(window, { key: 'k', metaKey: true });

      expect(document.activeElement).toBe(input);
    });

    it('should focus input on Ctrl+K', () => {
      render(<HomeSearchBar />);
      const input = screen.getByTestId('home-search-input');

      fireEvent.blur(input);

      fireEvent.keyDown(window, { key: 'k', ctrlKey: true });

      expect(document.activeElement).toBe(input);
    });
  });

  describe('Debouncing', () => {
    it('should not show results before debounce timeout', () => {
      render(<HomeSearchBar />);
      const input = screen.getByTestId('home-search-input');

      fireEvent.change(input, { target: { value: 'gatsby' } });

      // Before debounce timeout
      act(() => {
        vi.advanceTimersByTime(299);
      });

      expect(screen.queryByTestId('home-search-results')).toBeNull();
    });

    it('should show results after debounce timeout', () => {
      render(<HomeSearchBar />);
      const input = screen.getByTestId('home-search-input');

      fireEvent.change(input, { target: { value: 'gatsby' } });

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(screen.getByTestId('home-search-results')).toBeTruthy();
    });
  });

  describe('Click outside', () => {
    it('should close dropdown when clicking outside', () => {
      render(
        <div>
          <HomeSearchBar />
          <div data-testid='outside-element'>Outside</div>
        </div>,
      );
      const input = screen.getByTestId('home-search-input');

      fireEvent.change(input, { target: { value: 'gatsby' } });

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(screen.getByTestId('home-search-results')).toBeTruthy();

      // Click outside
      fireEvent.mouseDown(screen.getByTestId('outside-element'));

      expect(screen.queryByTestId('home-search-results')).toBeNull();
    });
  });

  describe('Empty library', () => {
    it('should show empty state when library has no books', () => {
      mockGetVisibleLibrary.mockReturnValue([]);
      render(<HomeSearchBar />);
      const input = screen.getByTestId('home-search-input');

      fireEvent.change(input, { target: { value: 'anything' } });

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(screen.getByTestId('home-search-empty')).toBeTruthy();
      expect(screen.getByText('No books found')).toBeTruthy();
    });
  });

  describe('Result display', () => {
    it('should display book title and author in results', () => {
      render(<HomeSearchBar />);
      const input = screen.getByTestId('home-search-input');

      fireEvent.change(input, { target: { value: 'gatsby' } });

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(screen.getByText('The Great Gatsby')).toBeTruthy();
      expect(screen.getByText('F. Scott Fitzgerald')).toBeTruthy();
    });

    it('should display book format', () => {
      render(<HomeSearchBar />);
      const input = screen.getByTestId('home-search-input');

      fireEvent.change(input, { target: { value: 'gatsby' } });

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(screen.getByText('epub')).toBeTruthy();
    });
  });
});
