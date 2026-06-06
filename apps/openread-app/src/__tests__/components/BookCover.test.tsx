import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BookCover from '@/components/BookCover';
import type { Book } from '@/types/book';

vi.mock('next/image', () => ({
  default: ({ src, alt, onError, onLoad, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} onError={onError} onLoad={onLoad} {...props} />
  ),
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
});
