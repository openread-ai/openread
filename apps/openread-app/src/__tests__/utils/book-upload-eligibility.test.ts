import { testOpenReadBookRef } from './bookIdentityFixtures';
import { describe, expect, it } from 'vitest';

import {
  hasUserBookUploadSource,
  isCatalogBackedBook,
  isUserCloudUploadEligible,
} from '@/utils/book';
import type { Book } from '@/types/book';

const baseBook = (overrides: Partial<Book> = {}): Book => ({
  hash: testOpenReadBookRef('0123456789abcdef0123456789abcdef'),
  title: 'Manual Book',
  author: 'Author',
  format: 'epub',
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

describe('book upload eligibility', () => {
  it('allows manual local books that are not deleted and not uploaded', () => {
    expect(isUserCloudUploadEligible(baseBook())).toBe(true);
  });

  it('excludes deleted and already-uploaded manual books', () => {
    expect(isUserCloudUploadEligible(baseBook({ deletedAt: Date.now() }))).toBe(false);
    expect(isUserCloudUploadEligible(baseBook({ uploadedAt: Date.now() }))).toBe(false);
  });

  it('treats catalog identifiers as catalog-backed and not user-upload eligible', () => {
    const book = baseBook({ catalogBookId: '65119855-9d37-4caf-a7a4-4a5f9c9572d5' });

    expect(isCatalogBackedBook(book)).toBe(true);
    expect(isUserCloudUploadEligible(book)).toBe(false);
  });

  it('treats catalog hashes as catalog-backed even before catalog metadata is hydrated', () => {
    const book = baseBook({
      hash: testOpenReadBookRef('catalog:65119855-9d37-4caf-a7a4-4a5f9c9572d5'),
    });

    expect(isCatalogBackedBook(book)).toBe(true);
    expect(isUserCloudUploadEligible(book)).toBe(false);
  });

  it('treats storage-backed books as already cloud-backed', () => {
    const book = baseBook({ storagePath: 'catalog/books/65119855/book.epub' });

    expect(isCatalogBackedBook(book)).toBe(true);
    expect(isUserCloudUploadEligible(book)).toBe(false);
  });

  it('requires a local file or recoverable source URL for background upload', async () => {
    const appService = {
      exists: async (path: string) => path === '0123456789abcdef0123456789abcdef/Manual Book.epub',
    };

    await expect(hasUserBookUploadSource(baseBook(), appService)).resolves.toBe(true);
    await expect(
      hasUserBookUploadSource(baseBook({ title: 'Missing Book' }), appService),
    ).resolves.toBe(false);
    await expect(
      hasUserBookUploadSource(
        baseBook({ title: 'Missing Book', url: 'https://example.com/book.epub' }),
        appService,
      ),
    ).resolves.toBe(true);
  });
});
