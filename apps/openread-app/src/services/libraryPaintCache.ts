import type { Book } from '@/types/book';

export const LIBRARY_OWNER_STORAGE_KEY = 'openread_library_owner_user_id';
const LIBRARY_PAINT_CACHE_KEY = 'openread_library_paint_cache_v1';
const LIBRARY_PAINT_CACHE_VERSION = 1;

interface LibraryPaintCacheEntry {
  version: typeof LIBRARY_PAINT_CACHE_VERSION;
  ownerUserId: string;
  books: Book[];
  timestamp: number;
}

function isDurableCoverImageUrl(url: string | null | undefined): url is string {
  if (!url || url === '_blank') return Boolean(url);
  if (url.startsWith('/')) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function sanitizeLibraryPaintCacheBooks(books: Book[]): Book[] {
  return books.map((book) => {
    const next: Book = { ...book };

    if (!isDurableCoverImageUrl(next.coverImageUrl)) {
      delete next.coverImageUrl;
    }

    if (next.metadata) {
      const metadata = { ...next.metadata };
      if (!isDurableCoverImageUrl(metadata.coverImageUrl)) {
        delete metadata.coverImageUrl;
      }
      delete metadata.coverImageBlobUrl;
      next.metadata = metadata;
    }

    return next;
  });
}

function getLocalStorage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

export function getLocalStorageUserId(): string | null {
  const storage = getLocalStorage();
  if (!storage) return null;

  try {
    const userJson = storage.getItem('user');
    if (!userJson) return null;
    const user = JSON.parse(userJson) as { id?: unknown } | null;
    return typeof user?.id === 'string' ? user.id : null;
  } catch {
    return null;
  }
}

export function readLibraryOwnerUserId(): string | null {
  return getLocalStorage()?.getItem(LIBRARY_OWNER_STORAGE_KEY) ?? null;
}

export function readLibraryPaintCache(
  userId = getLocalStorageUserId(),
): LibraryPaintCacheEntry | null {
  const storage = getLocalStorage();
  if (!storage || !userId || readLibraryOwnerUserId() !== userId) return null;

  try {
    const raw = storage.getItem(LIBRARY_PAINT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LibraryPaintCacheEntry>;
    if (
      parsed.version !== LIBRARY_PAINT_CACHE_VERSION ||
      parsed.ownerUserId !== userId ||
      !Array.isArray(parsed.books)
    ) {
      return null;
    }
    return {
      ...(parsed as LibraryPaintCacheEntry),
      books: sanitizeLibraryPaintCacheBooks(parsed.books as Book[]),
    };
  } catch {
    return null;
  }
}

export function writeLibraryPaintCache(ownerUserId: string | null, books: Book[]): void {
  const storage = getLocalStorage();
  if (!storage || !ownerUserId) return;

  try {
    storage.setItem(LIBRARY_OWNER_STORAGE_KEY, ownerUserId);
    storage.setItem(
      LIBRARY_PAINT_CACHE_KEY,
      JSON.stringify({
        version: LIBRARY_PAINT_CACHE_VERSION,
        ownerUserId,
        books: sanitizeLibraryPaintCacheBooks(books),
        timestamp: Date.now(),
      } satisfies LibraryPaintCacheEntry),
    );
  } catch {
    // Durable paint cache is an optimization; disk/appService remains source of truth.
  }
}

export function clearLibraryPaintCache(): void {
  getLocalStorage()?.removeItem(LIBRARY_PAINT_CACHE_KEY);
}
