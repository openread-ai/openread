import type { BookFormat } from './book.js';

export interface PlatformBookEntry {
  r2Filename: string;
  format: BookFormat;
  platformHash: string;
  title: string;
}

export interface PlatformBookDownload extends PlatformBookEntry {
  downloadUrl: string;
}

export interface PlatformBooksResponse {
  books: PlatformBookDownload[];
}

export const PLATFORM_BOOKS_SEEDED_KEY = 'openread_platform_books_seeded';
export const PLATFORM_BOOKS_MANIFEST: PlatformBookEntry[] = [
  {
    r2Filename: 'alice-in-wonderland.epub',
    format: 'epub',
    platformHash: '0799700427fee87bfb1049b70885badf47a7d59d63ff520a0c85d198636816c9',
    title: "Alice's Adventures in Wonderland",
  },
];
