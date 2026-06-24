import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import HomePage from '@/app/(platform)/home/page';
import type { ReactNode } from 'react';

const mockReplace = vi.fn();
let mockLibraryLoaded = true;
let mockVisibleBookCount = 0;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

vi.mock('@/hooks/useLibrary', () => ({
  useLibrary: () => ({ libraryLoaded: mockLibraryLoaded }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/store/libraryStore', () => ({
  useLibraryStore: (selector: (state: { getVisibleLibrary: () => unknown[] }) => unknown) =>
    selector({
      getVisibleLibrary: () =>
        Array.from({ length: mockVisibleBookCount }, (_, index) => ({
          hash: `book-${index}`,
        })),
    }),
}));

vi.mock('@/components/platform/platform-page-header', () => ({
  PlatformPageHeader: ({ title, actions }: { title: string; actions?: ReactNode }) => (
    <header data-testid='page-header'>
      <span>{title}</span>
      {actions}
    </header>
  ),
  platformPageFrameClassName: 'frame',
}));

vi.mock('@/components/platform/HomeSearchBar', () => ({
  HomeSearchBar: () => <div data-testid='home-search'>Search</div>,
}));

vi.mock('@/components/platform/book-section', () => ({
  BookSectionSkeleton: ({ title }: { title: string }) => <div data-testid='skeleton'>{title}</div>,
}));

vi.mock('@/app/(platform)/home/sections', () => ({
  ReadingNow: () => <section data-testid='reading-now'>Reading Now</section>,
  RecentlyAdded: () => <section data-testid='recently-added'>Recently Added</section>,
  WantToRead: () => <section data-testid='want-to-read'>Want to Read</section>,
}));

describe('Home empty-library routing', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockLibraryLoaded = true;
    mockVisibleBookCount = 0;
  });

  it('redirects loaded zero-visible-book libraries to /get-started', async () => {
    render(<HomePage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/get-started');
    });
    expect(screen.queryByTestId('reading-now')).toBeNull();
  });

  it('renders regular Home dashboard when visible books exist', () => {
    mockVisibleBookCount = 1;

    render(<HomePage />);

    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByTestId('reading-now')).toBeTruthy();
    expect(screen.getByTestId('recently-added')).toBeTruthy();
    expect(screen.getByTestId('want-to-read')).toBeTruthy();
    expect(screen.getByTestId('home-search')).toBeTruthy();
  });

  it('keeps loading skeletons while library is not loaded', () => {
    mockLibraryLoaded = false;

    render(<HomePage />);

    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getAllByTestId('skeleton').length).toBe(3);
  });
});
