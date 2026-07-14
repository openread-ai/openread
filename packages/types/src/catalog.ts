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

export interface CatalogStatsResponse {
  total_active: number;
  total_cached: number;
  total_sources: number;
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

export const CATALOG_TERMINAL_MATERIALIZATION_FAILURE_CODES = [
  'SOURCE_URL_REJECTED',
  'SOURCE_REDIRECT_REJECTED',
  'SOURCE_RATE_LIMITED',
  'SOURCE_HTTP_REJECTED',
  'SOURCE_SIZE_INVALID',
  'SOURCE_MEDIA_TYPE_INVALID',
  'SOURCE_TOO_LARGE',
  'SOURCE_SIZE_MISMATCH',
  'PDF_SIGNATURE_INVALID',
  'PDF_ENCRYPTED',
  'PDF_STRUCTURE_INVALID',
  'UNSUPPORTED_SOURCE',
  'PDF_READER_INCOMPATIBLE',
  'OBJECT_MISMATCH',
] as const;

export const CATALOG_RETRYABLE_MATERIALIZATION_FAILURE_CODES = [
  'SOURCE_FETCH_TIMEOUT',
  'MATERIALIZATION_HEARTBEAT_LOST',
  'MATERIALIZATION_OPERATIONAL_FAILURE',
] as const;

export const CATALOG_MATERIALIZATION_FAILURE_CODES = [
  ...CATALOG_TERMINAL_MATERIALIZATION_FAILURE_CODES,
  ...CATALOG_RETRYABLE_MATERIALIZATION_FAILURE_CODES,
  'MATERIALIZATION_RETRY_EXHAUSTED',
] as const;

export const CATALOG_ADD_FAILURE_CODES = [
  ...CATALOG_TERMINAL_MATERIALIZATION_FAILURE_CODES,
  'MATERIALIZATION_RETRY_EXHAUSTED',
  'LIBRARY_LIMIT_REACHED',
] as const;

export type CatalogTerminalMaterializationFailureCode =
  (typeof CATALOG_TERMINAL_MATERIALIZATION_FAILURE_CODES)[number];
export type CatalogRetryableMaterializationFailureCode =
  (typeof CATALOG_RETRYABLE_MATERIALIZATION_FAILURE_CODES)[number];
export type CatalogMaterializationFailureCode =
  (typeof CATALOG_MATERIALIZATION_FAILURE_CODES)[number];
export type CatalogAddFailureCode = (typeof CATALOG_ADD_FAILURE_CODES)[number];

const catalogMaterializationFailureCodes: ReadonlySet<string> = new Set(
  CATALOG_MATERIALIZATION_FAILURE_CODES,
);
const catalogAddFailureCodes: ReadonlySet<string> = new Set(CATALOG_ADD_FAILURE_CODES);

export function isCatalogMaterializationFailureCode(
  value: unknown,
): value is CatalogMaterializationFailureCode {
  return typeof value === 'string' && catalogMaterializationFailureCodes.has(value);
}

export function isCatalogAddFailureCode(value: unknown): value is CatalogAddFailureCode {
  return typeof value === 'string' && catalogAddFailureCodes.has(value);
}

export const CATALOG_ADD_REQUEST_STATES = [
  'pending',
  'waiting_for_materialization',
  'finalizing',
  'completed',
  'failed',
] as const;

const catalogAddRequestStates: ReadonlySet<string> = new Set(CATALOG_ADD_REQUEST_STATES);

export function isCatalogAddRequestState(value: unknown): value is CatalogAddRequestState {
  return typeof value === 'string' && catalogAddRequestStates.has(value);
}

export type CatalogMaterializationState = 'pending' | 'running' | 'succeeded' | 'failed';
export type CatalogAddRequestState = (typeof CATALOG_ADD_REQUEST_STATES)[number];
export type CatalogAddPublicState = 'preparing' | 'ready' | 'failed';

export interface CatalogAddRequestResponse {
  addRequestId: string;
  catalogBookId: string;
  state: CatalogAddPublicState;
  requestState: CatalogAddRequestState;
  finalBookId?: string;
  bookHash?: SyncableBookRef | string;
  failureCode?: CatalogAddFailureCode;
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

export type CatalogDownloadUrlResponse =
  | {
      status?: 'ready';
      downloadUrl: string;
      expiresAt: number;
      sizeBytes: number | null;
      format: string | null;
      storagePath?: string | null;
    }
  | {
      status: 'preparing';
      catalogBookId: string;
      retryAfterSeconds: number;
      message: string;
    };

export type CatalogWishlistBook = CatalogBook & { wishlisted_at: string };

export interface CatalogWishlistResponse {
  books: CatalogWishlistBook[];
}
