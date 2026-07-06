/**
 * Canonical catalog API contracts.
 *
 * apps/api owns catalog data, import/cache lifecycle, covers, and catalog-backed
 * library metadata. UI and SDK clients consume these response shapes instead of
 * rebuilding catalog ownership rules locally.
 */

import type { SyncableBookRef } from './book-identity.js';

export type CatalogSort = 'popularity' | 'relevance' | 'title_asc' | 'title_desc' | 'added_desc';

export interface CatalogBook {
  id: string;
  title: string;
  author_name: string;
  language: string;
  format_type: string;
  cover_image_key: string | null;
  cover_is_generated: boolean;
  cover_url?: string | null;
  is_cached: boolean;
  import_count: number;
  page_count: number | null;
  file_size_bytes: number | null;
  source?: string;
  source_id?: string;
  ia_identifier?: string;
}

export interface CatalogBookDetail extends CatalogBook {
  description?: string | null;
  license_type?: string | null;
  publication_year?: number | null;
  subjects?: string[];
}

export interface CatalogBrowseQuery {
  q?: string;
  subject?: string;
  language?: string;
  languages?: string[];
  sources?: string[];
  minPages?: number;
  maxPages?: number;
  region?: string;
  sort?: CatalogSort;
  page?: number;
  limit?: number;
}

export interface CatalogBrowseResponse {
  books: CatalogBook[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  error?: string;
}

export interface CatalogCollection {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
  book_count: number;
}

export interface CatalogCollectionsResponse {
  collections: CatalogCollection[];
}

export interface CatalogCollectionBooksResponse extends CatalogBrowseResponse {}

export interface CatalogCollectionDetail extends CatalogCollection {}

export interface CollectionWithBooks extends CatalogCollection {
  books: CatalogBook[];
}

export type CatalogImportStatus = 'ready' | 'preparing';

export interface CatalogImportResponse {
  status: CatalogImportStatus;
  /** Canonical catalog_book UUID used by backend status/import routes. */
  catalog_book_id?: string;
  download_url?: string;
  book_id?: string;
  book_hash?: SyncableBookRef | string;
}

export interface CatalogStatusResponse {
  caching_status: string;
  health_check_status?: string | null;
  source_available?: boolean;
}

export interface CatalogDownloadUrlRequest {
  bookHash: SyncableBookRef | string;
}

export interface CatalogDownloadUrlResponse {
  downloadUrl: string;
  expiresAt: number;
  sizeBytes: number | null;
  format: string | null;
}

export type CatalogWishlistBook = CatalogBook & { wishlisted_at: string };

export interface CatalogWishlistResponse {
  books: CatalogWishlistBook[];
}
