import React from 'react';
import { testOpenReadBookRef } from '../utils/bookIdentityFixtures';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BookCover from '@/components/BookCover';
import ReaderSidebarBookCard from '@/app/reader/components/sidebar/BookCard';
import type { Book } from '@/types/book';

vi.mock('next/image', () => ({
  default: ({ src, alt, onError, onLoad, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} onError={onError} onLoad={onLoad} {...props} />
  ),
}));

vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({ isDarkMode: false }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (value: string) => value,
}));

vi.mock('@/hooks/useResponsiveSize', () => ({
  useResponsiveSize: (value: number) => value,
}));

function book(overrides: Partial<Book> = {}): Book {
  return {
    hash: 'book-1',
    title: 'No Cover Book',
    author: 'Fallback Author',
    format: 'epub',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  } as Book;
}

describe('BookCover', () => {
  afterEach(() => cleanup());

  it('shows a readable text fallback when a book has no cover source', () => {
    render(<BookCover book={book()} />);

    expect(screen.getByText('No Cover Book')).toBeTruthy();
    expect(screen.getByText('Fallback Author')).toBeTruthy();
  });

  it('shows a readable text fallback when an image source fails', () => {
    render(<BookCover book={book({ coverImageUrl: '/broken-cover.jpg' })} />);

    const image = screen.getByRole('img', { name: 'No Cover Book' });
    fireEvent.error(image);

    expect(screen.getByText('No Cover Book')).toBeTruthy();
    expect(screen.getByText('Fallback Author')).toBeTruthy();
  });

  it('uses only the encoded by-ID URL for catalog books and ignores copied cover state', () => {
    render(
      <BookCover
        book={book({
          catalogBookId: 'catalog id/with?reserved',
          coverImageUrl: 'blob:generated-first-page',
          metadata: {
            title: 'No Cover Book',
            author: 'Fallback Author',
            language: 'en',
            coverImageUrl: '/stale-catalog-cover.jpg',
          },
        })}
      />,
    );

    expect(screen.getByRole('img', { name: 'No Cover Book' }).getAttribute('src')).toBe(
      'https://api.openread.ai/catalog/books/catalog%20id%2Fwith%3Freserved/cover',
    );
  });

  it('falls directly to text after one catalog failure and reports only the final error once', () => {
    const onImageError = vi.fn();
    render(
      <BookCover
        book={book({
          catalogBookId: 'catalog-1',
          metadata: {
            title: 'No Cover Book',
            author: 'Fallback Author',
            language: 'en',
            coverImageUrl: '/stale-catalog-cover.jpg',
          },
        })}
        onImageError={onImageError}
      />,
    );

    const image = screen.getByRole('img', { name: 'No Cover Book' });
    fireEvent.error(image);
    fireEvent.error(image);

    expect(image.getAttribute('src')).toBe('https://api.openread.ai/catalog/books/catalog-1/cover');
    expect(screen.getByText('No Cover Book')).toBeTruthy();
    expect(screen.getByText('Fallback Author')).toBeTruthy();
    expect(onImageError).toHaveBeenCalledTimes(1);
  });

  it('keeps the reader sidebar catalog fallback visible after the image fails', () => {
    render(
      <ReaderSidebarBookCard
        book={book({
          hash: testOpenReadBookRef('catalog:11111111-1111-4111-8111-111111111111'),
          catalogBookId: '11111111-1111-4111-8111-111111111111',
          storagePath: 'catalog/books/source/book.epub',
          metadata: {
            title: 'No Cover Book',
            author: 'Fallback Author',
            language: 'en',
            coverImageUrl: '/stale-catalog-cover.jpg',
          },
        })}
      />,
    );

    const image = screen.getByRole('img', { name: 'No Cover Book' });
    const sidebarCoverWrapper = image.parentElement?.parentElement;
    expect(sidebarCoverWrapper).toBeTruthy();

    fireEvent.error(image);

    expect(sidebarCoverWrapper?.style.display).toBe('');
    expect(screen.getAllByText('No Cover Book')).toHaveLength(2);
    expect(screen.getAllByText('Fallback Author')).toHaveLength(2);
  });

  it('constructs grid image URLs without issuing per-card detail JSON requests', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(
      <>
        <BookCover
          book={book({ hash: testOpenReadBookRef('book-1'), catalogBookId: 'catalog-1' })}
        />
        <BookCover
          book={book({ hash: testOpenReadBookRef('book-2'), catalogBookId: 'catalog-2' })}
        />
        <BookCover
          book={book({ hash: testOpenReadBookRef('book-3'), catalogBookId: 'catalog-3' })}
        />
      </>,
    );

    expect(screen.getAllByRole('img').map((image) => image.getAttribute('src'))).toEqual([
      'https://api.openread.ai/catalog/books/catalog-1/cover',
      'https://api.openread.ai/catalog/books/catalog-2/cover',
      'https://api.openread.ai/catalog/books/catalog-3/cover',
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('preserves local cover precedence without constructing a catalog URL', () => {
    render(
      <BookCover
        book={book({
          coverImageUrl: 'blob:local-cover',
          metadata: {
            title: 'No Cover Book',
            author: 'Fallback Author',
            language: 'en',
            coverImageUrl: '/metadata-cover.jpg',
          },
        })}
      />,
    );

    expect(screen.getByRole('img', { name: 'No Cover Book' }).getAttribute('src')).toBe(
      'blob:local-cover',
    );
  });

  it('contains generated PDF page covers instead of cropping them', () => {
    render(<BookCover book={book({ format: 'pdf', coverImageUrl: 'blob:pdf-first-page' })} />);

    const image = screen.getByRole('img', { name: 'No Cover Book' });
    expect(image.className).toContain('fit-cover-img');
    expect(image.className).not.toContain('crop-cover-img');
  });
});
