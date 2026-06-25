/*
 * Canonical OpenRead book identity contract.
 *
 * Owns every runtime identity shape used to refer to books across app, API,
 * sync, catalog, storage, SDK, and MCP. Feature code must import these helpers
 * instead of guessing from raw string length, regexes, or `catalog:` prefixes.
 */

type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type BookId = Brand<string, 'BookId'>;
export type LocalBookHash = Brand<string, 'LocalBookHash'>;
export type PlatformBookHash = Brand<string, 'PlatformBookHash'>;
export type CatalogBookRef = Brand<`catalog:${string}`, 'CatalogBookRef'>;
export type MetaHash = Brand<string, 'MetaHash'>;
export type SyncableBookRef = LocalBookHash | CatalogBookRef;
export type OpenReadBookReference = LocalBookHash | PlatformBookHash | CatalogBookRef;
export type ReaderBookKey = Brand<string, 'ReaderBookKey'>;

export type BookReferenceKind = 'local' | 'platform' | 'catalog';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCAL_BOOK_HASH_PATTERN = /^[0-9a-f]{32}$/i;
const PLATFORM_BOOK_HASH_PATTERN = /^[0-9a-f]{64}$/i;
const META_HASH_PATTERN = /^[0-9a-f]{32}(?:[0-9a-f]{32})?$/i;
const CATALOG_PREFIX = 'catalog:';
const READER_KEY_SEPARATOR = '::';
const LEGACY_LOCAL_HASH_READER_KEY_PATTERN = /^([0-9a-f]{32})-[a-z0-9]{7}$/i;

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeLowercase(value: unknown, pattern: RegExp): string | null {
  const normalized = normalizeString(value);
  if (!normalized || !pattern.test(normalized)) return null;
  return normalized.toLowerCase();
}

export function parseBookId(value: unknown): BookId | null {
  const normalized = normalizeLowercase(value, UUID_PATTERN);
  return normalized ? (normalized as BookId) : null;
}

export function isBookId(value: unknown): value is BookId {
  return parseBookId(value) !== null;
}

export function parseLocalBookHash(value: unknown): LocalBookHash | null {
  const normalized = normalizeLowercase(value, LOCAL_BOOK_HASH_PATTERN);
  return normalized ? (normalized as LocalBookHash) : null;
}

export function isLocalBookHash(value: unknown): value is LocalBookHash {
  return parseLocalBookHash(value) !== null;
}

export function parsePlatformBookHash(value: unknown): PlatformBookHash | null {
  const normalized = normalizeLowercase(value, PLATFORM_BOOK_HASH_PATTERN);
  return normalized ? (normalized as PlatformBookHash) : null;
}

export function isPlatformBookHash(value: unknown): value is PlatformBookHash {
  return parsePlatformBookHash(value) !== null;
}

export function parseCatalogBookRef(value: unknown): CatalogBookRef | null {
  const normalized = normalizeString(value);
  if (!normalized || !normalized.toLowerCase().startsWith(CATALOG_PREFIX)) return null;
  const catalogBookId = parseBookId(normalized.slice(CATALOG_PREFIX.length));
  return catalogBookId ? (`${CATALOG_PREFIX}${catalogBookId}` as CatalogBookRef) : null;
}

export function isCatalogBookRef(value: unknown): value is CatalogBookRef {
  return parseCatalogBookRef(value) !== null;
}

export function createCatalogBookRef(catalogBookId: BookId | string): CatalogBookRef {
  const parsed = parseBookId(catalogBookId);
  if (!parsed) throw new Error('Invalid catalog book id');
  return `${CATALOG_PREFIX}${parsed}` as CatalogBookRef;
}

export function getBookIdFromCatalogBookRef(catalogBookRef: CatalogBookRef | string): BookId | null {
  const parsed = parseCatalogBookRef(catalogBookRef);
  return parsed ? parseBookId(parsed.slice(CATALOG_PREFIX.length)) : null;
}

export function parseMetaHash(value: unknown): MetaHash | null {
  const normalized = normalizeLowercase(value, META_HASH_PATTERN);
  return normalized ? (normalized as MetaHash) : null;
}

export function isMetaHash(value: unknown): value is MetaHash {
  return parseMetaHash(value) !== null;
}

export function parseSyncableBookRef(value: unknown): SyncableBookRef | null {
  return parseLocalBookHash(value) ?? parseCatalogBookRef(value);
}

export function isSyncableBookRef(value: unknown): value is SyncableBookRef {
  return parseSyncableBookRef(value) !== null;
}

export function parseOpenReadBookReference(value: unknown): OpenReadBookReference | null {
  return parseLocalBookHash(value) ?? parsePlatformBookHash(value) ?? parseCatalogBookRef(value);
}

export function isOpenReadBookReference(value: unknown): value is OpenReadBookReference {
  return parseOpenReadBookReference(value) !== null;
}

export function normalizeBookReference(value: unknown): OpenReadBookReference | null {
  return parseOpenReadBookReference(value);
}

export function getBookReferenceKind(value: OpenReadBookReference | string): BookReferenceKind | null {
  if (parseLocalBookHash(value)) return 'local';
  if (parsePlatformBookHash(value)) return 'platform';
  if (parseCatalogBookRef(value)) return 'catalog';
  return null;
}

function createReaderKeyNonce(): string {
  const crypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (crypto && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function createReaderBookKey(
  bookRef: OpenReadBookReference | string,
  nonce: string = createReaderKeyNonce(),
): ReaderBookKey {
  const parsed = parseOpenReadBookReference(bookRef);
  if (!parsed) throw new Error('Invalid OpenRead book reference');
  return `${parsed}${READER_KEY_SEPARATOR}${nonce}` as ReaderBookKey;
}

export function parseBookRefFromReaderBookKey(value: unknown): OpenReadBookReference | null {
  const normalized = normalizeString(value);
  if (!normalized) return null;

  const separatorIndex = normalized.lastIndexOf(READER_KEY_SEPARATOR);
  const canonicalCandidate = separatorIndex === -1 ? normalized : normalized.slice(0, separatorIndex);
  const canonicalRef = parseOpenReadBookReference(canonicalCandidate);
  if (canonicalRef) return canonicalRef;

  // Legacy migration path for pre-canonical reader keys: <32-char-local-hash>-<7-char-session-id>.
  // Keep this compatibility only here so feature code never parses session keys itself.
  const legacyLocalHash = normalized.match(LEGACY_LOCAL_HASH_READER_KEY_PATTERN)?.[1];
  return parseLocalBookHash(legacyLocalHash);
}

export function isReaderBookKeyOrRef(value: unknown): value is ReaderBookKey | OpenReadBookReference {
  return parseBookRefFromReaderBookKey(value) !== null;
}

export function getBookRefFromReaderBookKey(readerBookKey: ReaderBookKey | string): OpenReadBookReference {
  const parsed = parseBookRefFromReaderBookKey(readerBookKey);
  if (parsed) return parsed;

  throw new Error('Invalid reader book key');
}
