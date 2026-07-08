'use client';

import type { CatalogImportIntentMode } from '@openread/types';
import type { CatalogBook } from '@/types/catalog';
import { isMobilePlatform, isTauriAppPlatform } from '@/services/environment';

export type CatalogAddMode = CatalogImportIntentMode;

type CatalogAddBook = Pick<CatalogBook, 'is_cached'> & {
  browser_device_fetch_executable?: boolean;
};

/**
 * Browser/device-fetch is intentionally opt-in from API data. Until the API can
 * prove a source is browser-executable, web and mobile-web must not surface a
 * device-fetch Add action for non-cached rows.
 */
export function canExecuteCatalogUserDeviceFetchMode(book?: CatalogAddBook): boolean {
  if (book?.browser_device_fetch_executable === true) return true;
  return isTauriAppPlatform() && !isMobilePlatform();
}

export function getCatalogAddModeForPlatform(book: CatalogAddBook): CatalogAddMode | null {
  if (book.is_cached) return 'cached';
  return canExecuteCatalogUserDeviceFetchMode(book) ? 'user_device_fetch' : null;
}

export function filterExecutableCatalogBooks<T extends CatalogAddBook>(books: readonly T[]): T[] {
  return books.filter((book) => getCatalogAddModeForPlatform(book) !== null);
}

export function catalogAddModeLabel(mode: CatalogAddMode): string {
  return mode === 'user_device_fetch' ? 'Get from source' : 'Add to Library';
}
