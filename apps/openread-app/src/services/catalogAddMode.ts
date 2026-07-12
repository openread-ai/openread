'use client';

import type { CatalogBook } from '@/types/catalog';

export type CatalogAddMode = 'server';

type CatalogAddBook = Pick<CatalogBook, 'is_cached'>;

export function getCatalogAddModeForPlatform(_book: CatalogAddBook): CatalogAddMode {
  return 'server';
}

export function catalogAddModeLabel(_mode: CatalogAddMode): string {
  return 'Add to Library';
}
