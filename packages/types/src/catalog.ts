/**
 * Canonical catalog API contracts.
 *
 * The private Catalog Service owns canonical catalog reads and Add materialization;
 * apps/api exposes the public contract and cover delivery. UI and SDK clients consume
 * these response shapes instead of rebuilding catalog ownership rules locally.
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
  source: string;
  source_id: string;
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

export interface CatalogSubject {
  subject_name: string;
  book_count: number;
}

export interface CatalogSubjectsResponse {
  subjects: CatalogSubject[];
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
  'SOURCE_HTTP_REJECTED',
  'SOURCE_SIZE_INVALID',
  'SOURCE_MEDIA_TYPE_INVALID',
  'SOURCE_TOO_LARGE',
  'SOURCE_SIZE_MISMATCH',
  'SOURCE_SIGNATURE_INVALID',
  'SOURCE_ARCHIVE_AMBIGUOUS',
  'SOURCE_FORMAT_MISMATCH',
  'UNSUPPORTED_SOURCE',
  'GUTENBERG_SENTINELS_INVALID',
  'GUTENBERG_TITLE_INVALID',
  'GUTENBERG_RESIDUE_DETECTED',
  'GUTENBERG_BUFFER_LIMIT_EXCEEDED',
  'GUTENBERG_TRANSFORM_INVALID',
  'OBJECT_MISMATCH',
] as const;

export const CATALOG_RETRYABLE_MATERIALIZATION_FAILURE_CODES = [
  'SOURCE_RATE_LIMITED',
  'SOURCE_HTTP_RETRYABLE',
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

export const CATALOG_MATERIALIZATION_FAILURE_DETAIL_MAX_LENGTH = 160;
export const CATALOG_MATERIALIZATION_FAILURE_DETAIL_PATTERN =
  /^[A-Z][A-Z0-9_]*(?::[A-Z][A-Z0-9_]*=[0-9]+(?:,[A-Z][A-Z0-9_]*=[0-9]+)*)?$/;
export const CATALOG_MATERIALIZATION_FAILURE_DETAIL_CATEGORIES = [
  'DETAIL_UNAVAILABLE',
  'END_SENTINEL_COUNT',
  'EPUB_CONTAINER_MISSING',
  'EPUB_MIMETYPE_INVALID',
  'FINAL_RESOURCE_MISSING',
  'LOCAL_REFERENCE_UNRESOLVED',
  'OPF_COVER_BINDING_INVALID',
  'OPF_ENTRY_MISSING',
  'OPF_FINAL_STRUCTURE_INVALID',
  'OPF_MANIFEST_HREF_MISSING',
  'OPF_MANIFEST_ID_INVALID',
  'OPF_ROOTFILE_INVALID',
  'OPF_SPINE_INVALID',
  'OPF_STRUCTURE_INVALID',
  'OUTPUT_RESOURCE_DRIFT',
  'OUTPUT_RESOURCE_UNKNOWN',
  'PATCH_RANGE_INVALID',
  'SENTINEL_LOCATION_INVALID',
  'START_SENTINEL_COUNT',
  'TRANSFORM_INVALID_UNCLASSIFIED',
  'UNCHANGED_BYTES_DRIFT',
  'XHTML_BODY_MISSING',
  'XHTML_NAMESPACE_DRIFT',
  'XHTML_ROOT_INVALID',
  'XHTML_STRUCTURE_INVALID',
  'XHTML_TITLE_INVALID',
  'XML_ATTRIBUTE_INVALID',
  'XML_CDATA_UNTERMINATED',
  'XML_COMMENT_UNTERMINATED',
  'XML_DECLARATION_UNTERMINATED',
  'XML_LIMIT_EXCEEDED',
  'XML_NAME_MISSING',
  'XML_PROCESSING_INSTRUCTION_UNTERMINATED',
  'XML_ROOT_UNBALANCED',
  'XML_TAG_UNTERMINATED',
  'XML_TOKEN_MISMATCH',
  'ZIP_ENTRY_UNSUPPORTED',
  'ZIP_EXTRA_FIELD_INVALID',
  'ZIP_FILENAME_ENCODING_UNSUPPORTED',
  'ZIP_FILENAME_INVALID',
  'ZIP_HEADER_MISSING',
  'ZIP_LAYOUT_UNSUPPORTED',
  'ZIP_OUTPUT_ENTRY_MISSING',
  'ZIP_STRUCTURE_INVALID',
] as const;

const catalogMaterializationFailureDetailCategories: ReadonlySet<string> = new Set(
  CATALOG_MATERIALIZATION_FAILURE_DETAIL_CATEGORIES,
);

export function isCatalogMaterializationFailureDetail(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= CATALOG_MATERIALIZATION_FAILURE_DETAIL_MAX_LENGTH &&
    CATALOG_MATERIALIZATION_FAILURE_DETAIL_PATTERN.test(value) &&
    catalogMaterializationFailureDetailCategories.has(value.split(':', 1)[0]!)
  );
}

export interface CatalogAddRequestResponse {
  addRequestId: string;
  catalogBookId: string;
  state: CatalogAddPublicState;
  requestState: CatalogAddRequestState;
  finalBookId?: string;
  bookHash?: SyncableBookRef | string;
  failureCode?: CatalogAddFailureCode;
  failureDetail?: string;
}

/** @deprecated Catalog imports use the durable Catalog Add request contract. */
export type CatalogImportStatus = CatalogAddPublicState;
/** @deprecated Use CatalogAddRequestResponse. */
export type CatalogImportResponse = CatalogAddRequestResponse;

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
