import { testOpenReadBookRef } from './bookIdentityFixtures';
import { describe, expect, it } from 'vitest';

import {
  hasRemoteCopy,
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

const predicateCases = Array.from({ length: 16 }, (_, mask) => ({
  label: mask.toString(2).padStart(4, '0'),
  catalogBookId: Boolean(mask & 1),
  storagePath: Boolean(mask & 2),
  catalogHash: Boolean(mask & 4),
  uploadedAt: Boolean(mask & 8),
}));

describe('book upload eligibility', () => {
  it.each(predicateCases)(
    'classifies catalog origin and remote location for $label',
    ({ catalogBookId, storagePath, catalogHash, uploadedAt }) => {
      const book = baseBook({
        catalogBookId: catalogBookId ? '65119855-9d37-4caf-a7a4-4a5f9c9572d5' : null,
        storagePath: storagePath ? 'Openread/Books/manual/book.epub' : null,
        hash: catalogHash
          ? testOpenReadBookRef('catalog:65119855-9d37-4caf-a7a4-4a5f9c9572d5')
          : testOpenReadBookRef('0123456789abcdef0123456789abcdef'),
        uploadedAt: uploadedAt ? 1 : null,
      });
      const expectedCatalogOrigin = catalogBookId || catalogHash;
      const expectedRemoteCopy = catalogBookId || storagePath || catalogHash || uploadedAt;

      expect(isCatalogBackedBook(book)).toBe(expectedCatalogOrigin);
      expect(hasRemoteCopy(book)).toBe(expectedRemoteCopy);
      expect(isUserCloudUploadEligible(book)).toBe(!expectedRemoteCopy);
    },
  );
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

  it('does not infer catalog origin from a user book storage location', () => {
    const book = baseBook({ storagePath: 'Openread/Books/manual/book.epub' });

    expect(isCatalogBackedBook(book)).toBe(false);
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
