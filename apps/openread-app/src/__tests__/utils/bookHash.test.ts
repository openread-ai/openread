import { describe, expect, test } from 'vitest';
import {
  isCatalogBookHash,
  isLocalBookHash,
  isOpenReadBookReference,
  isPlatformBookHash,
  isSyncableLibraryBookHash,
} from '@/utils/bookHash';

const localHash = '0123456789abcdef0123456789abcdef';
const platformHash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const catalogHash = 'catalog:7231ff9a-24b9-4074-9369-bc7f88ffb179';

describe('book hash validators', () => {
  test('classifies canonical user-uploaded and catalog identifiers', () => {
    expect(isLocalBookHash(localHash)).toBe(true);
    expect(isPlatformBookHash(platformHash)).toBe(true);
    expect(isCatalogBookHash(catalogHash)).toBe(true);
  });

  test('keeps sync row keys narrower than reader AI references', () => {
    expect(isSyncableLibraryBookHash(localHash)).toBe(true);
    expect(isSyncableLibraryBookHash(catalogHash)).toBe(true);
    expect(isSyncableLibraryBookHash(platformHash)).toBe(false);

    expect(isOpenReadBookReference(localHash)).toBe(true);
    expect(isOpenReadBookReference(platformHash)).toBe(true);
    expect(isOpenReadBookReference(catalogHash)).toBe(true);
  });

  test('rejects malformed catalog and arbitrary identifiers', () => {
    for (const value of ['catalog:not-a-uuid', 'book-hash', '../book', '', null]) {
      expect(isSyncableLibraryBookHash(value)).toBe(false);
      expect(isOpenReadBookReference(value)).toBe(false);
    }
  });
});
