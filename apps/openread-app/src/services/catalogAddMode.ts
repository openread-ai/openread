'use client';

import type { CatalogImportIntentMode } from '@openread/types';
import type { CatalogBook } from '@/types/catalog';

export type CatalogAddMode = CatalogImportIntentMode;

type CatalogAddBook = Pick<CatalogBook, 'is_cached'>;

export function getCatalogAddModeForPlatform(book: CatalogAddBook): CatalogAddMode {
  return book.is_cached ? 'cached' : 'user_device_fetch';
}

export function catalogAddModeLabel(mode: CatalogAddMode): string {
  return mode === 'user_device_fetch' ? 'Get from source' : 'Add to Library';
}
