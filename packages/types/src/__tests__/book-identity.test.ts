import { describe, expect, it } from 'vitest';
import {
  createCatalogBookRef,
  createReaderBookKey,
  getBookIdFromCatalogBookRef,
  getBookReferenceKind,
  getBookRefFromReaderBookKey,
  isOpenReadBookReference,
  isReaderBookKeyOrRef,
  isSyncableBookRef,
  normalizeBookReference,
  parseBookId,
  parseBookRefFromReaderBookKey,
  parseCatalogBookRef,
  parseLocalBookHash,
  parseMetaHash,
  parseOpenReadBookReference,
  parsePlatformBookHash,
  parseSyncableBookRef,
} from '../book-identity.js';

const BOOK_ID = '550e8400-e29b-41d4-a716-446655440000';
const LOCAL_HASH = 'd41d8cd98f00b204e9800998ecf8427e';
const PLATFORM_HASH = 'a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a';
const META_HASH_64 = 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9';

describe('book identity contract', () => {
  it('normalizes DB UUID book ids', () => {
    expect(parseBookId(BOOK_ID.toUpperCase())).toBe(BOOK_ID);
    expect(parseBookId('not-a-uuid')).toBeNull();
  });

  it('separates local, platform, catalog, and meta hashes', () => {
    expect(parseLocalBookHash(LOCAL_HASH.toUpperCase())).toBe(LOCAL_HASH);
    expect(parseLocalBookHash(PLATFORM_HASH)).toBeNull();
    expect(parsePlatformBookHash(PLATFORM_HASH.toUpperCase())).toBe(PLATFORM_HASH);
    expect(parsePlatformBookHash(LOCAL_HASH)).toBeNull();
    expect(parseMetaHash(LOCAL_HASH)).toBe(LOCAL_HASH);
    expect(parseMetaHash(META_HASH_64)).toBe(META_HASH_64);
  });

  it('creates and parses catalog refs with catalog:<uuid> semantics', () => {
    const ref = createCatalogBookRef(BOOK_ID);
    expect(ref).toBe(`catalog:${BOOK_ID}`);
    expect(parseCatalogBookRef(`CATALOG:${BOOK_ID.toUpperCase()}`)).toBe(`catalog:${BOOK_ID}`);
    expect(getBookIdFromCatalogBookRef(ref)).toBe(BOOK_ID);
    expect(parseCatalogBookRef('catalog:not-a-uuid')).toBeNull();
  });

  it('allows only local hashes and catalog refs as syncable book refs', () => {
    expect(parseSyncableBookRef(LOCAL_HASH)).toBe(LOCAL_HASH);
    expect(parseSyncableBookRef(`catalog:${BOOK_ID}`)).toBe(`catalog:${BOOK_ID}`);
    expect(parseSyncableBookRef(PLATFORM_HASH)).toBeNull();
    expect(isSyncableBookRef(PLATFORM_HASH)).toBe(false);
  });

  it('allows local, platform, and catalog refs as OpenRead references', () => {
    expect(parseOpenReadBookReference(LOCAL_HASH)).toBe(LOCAL_HASH);
    expect(parseOpenReadBookReference(PLATFORM_HASH)).toBe(PLATFORM_HASH);
    expect(parseOpenReadBookReference(`catalog:${BOOK_ID}`)).toBe(`catalog:${BOOK_ID}`);
    expect(isOpenReadBookReference('book-1')).toBe(false);
    expect(normalizeBookReference(` CATALOG:${BOOK_ID.toUpperCase()} `)).toBe(`catalog:${BOOK_ID}`);
  });

  it('reports reference kind without feature-code shape guesses', () => {
    expect(getBookReferenceKind(LOCAL_HASH)).toBe('local');
    expect(getBookReferenceKind(PLATFORM_HASH)).toBe('platform');
    expect(getBookReferenceKind(`catalog:${BOOK_ID}`)).toBe('catalog');
  });

  it('round-trips reader book keys while keeping them session-only', () => {
    const key = createReaderBookKey(`catalog:${BOOK_ID}`, 'session-a');
    expect(key).toBe(`catalog:${BOOK_ID}::session-a`);
    expect(getBookRefFromReaderBookKey(key)).toBe(`catalog:${BOOK_ID}`);
  });

  it('keeps legacy local-hash reader key compatibility inside the identity module', () => {
    expect(getBookRefFromReaderBookKey(`${LOCAL_HASH}-abc1234`)).toBe(LOCAL_HASH);
  });

  it('non-throwingly parses reader keys and direct reader refs', () => {
    expect(parseBookRefFromReaderBookKey(LOCAL_HASH)).toBe(LOCAL_HASH);
    expect(parseBookRefFromReaderBookKey(PLATFORM_HASH)).toBe(PLATFORM_HASH);
    expect(parseBookRefFromReaderBookKey(`catalog:${BOOK_ID}`)).toBe(`catalog:${BOOK_ID}`);
    expect(parseBookRefFromReaderBookKey(`${PLATFORM_HASH}::session-a`)).toBe(PLATFORM_HASH);
    expect(parseBookRefFromReaderBookKey(`${LOCAL_HASH}-abc1234`)).toBe(LOCAL_HASH);
  });

  it('rejects invalid reader key/ref shapes without throwing', () => {
    for (const invalid of [BOOK_ID, '_placeholder', '', '   ', null, undefined, 'not-a-book']) {
      expect(parseBookRefFromReaderBookKey(invalid)).toBeNull();
      expect(isReaderBookKeyOrRef(invalid)).toBe(false);
    }
    expect(() => getBookRefFromReaderBookKey(BOOK_ID)).toThrow('Invalid reader book key');
  });
});
