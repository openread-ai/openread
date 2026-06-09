const LOCAL_BOOK_HASH_REGEX = /^[0-9a-f]{32}$/i;
const PLATFORM_BOOK_HASH_REGEX = /^[0-9a-f]{64}$/i;
const CATALOG_BOOK_HASH_REGEX =
  /^catalog:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isLocalBookHash(value: unknown): value is string {
  return typeof value === 'string' && LOCAL_BOOK_HASH_REGEX.test(value);
}

export function isPlatformBookHash(value: unknown): value is string {
  return typeof value === 'string' && PLATFORM_BOOK_HASH_REGEX.test(value);
}

export function isCatalogBookHash(value: unknown): value is string {
  return typeof value === 'string' && CATALOG_BOOK_HASH_REGEX.test(value);
}

/**
 * Hashes that identify rows in the Library books table.
 *
 * User-uploaded books use the local 32-char book hash. Catalog-imported books
 * use the durable catalog:<uuid> namespace. Platform SHA-256 hashes are not
 * library row keys and must not be accepted for sync/delete row targeting.
 */
export function isSyncableLibraryBookHash(value: unknown): value is string {
  return isLocalBookHash(value) || isCatalogBookHash(value);
}

/**
 * Reader/AI book reference accepted by user-facing chat flows.
 *
 * Uploaded books may be referenced by either their local book hash or their
 * full-file platform hash. Catalog imports use catalog:<uuid> because that is
 * their canonical Library identity.
 */
export function isOpenReadBookReference(value: unknown): value is string {
  return isLocalBookHash(value) || isPlatformBookHash(value) || isCatalogBookHash(value);
}
