/**
 * @module @openread/types
 * Shared TypeScript types for the OpenRead platform.
 *
 * This package contains all entity and API types used across the monorepo.
 * It is MIT-licensed to allow the SDK and other public packages to depend on it.
 *
 * @example
 * ```typescript
 * import type { Book, ApiError, ListBooksResponse } from '@openread/types';
 *
 * async function fetchBooks(): Promise<ListBooksResponse> {
 *   const response = await fetch('/api/books');
 *   if (!response.ok) {
 *     const error: ApiError = await response.json();
 *     throw new Error(error.message);
 *   }
 *   return response.json();
 * }
 * ```
 */

// Canonical book identity contract
export {
  createCatalogBookRef,
  createReaderBookKey,
  getBookIdFromCatalogBookRef,
  getBookRefFromReaderBookKey,
  getBookReferenceKind,
  isBookId,
  isCatalogBookRef,
  isLocalBookHash,
  isMetaHash,
  isOpenReadBookReference,
  isPlatformBookHash,
  isSyncableBookRef,
  normalizeBookReference,
  parseBookId,
  parseCatalogBookRef,
  parseLocalBookHash,
  parseMetaHash,
  parseOpenReadBookReference,
  parsePlatformBookHash,
  parseSyncableBookRef,
} from './book-identity.js';
export type {
  BookId,
  BookReferenceKind,
  CatalogBookRef,
  LocalBookHash,
  MetaHash,
  OpenReadBookReference,
  PlatformBookHash,
  ReaderBookKey,
  SyncableBookRef,
} from './book-identity.js';

// Book entity types
export type { Book, BookCore, BookFormat, FileType } from './book.js';

// API request/response types
export type {
  ListBooksQuery,
  ListBooksResponse,
  UploadUrlRequest,
  UploadUrlResponse,
  ConfirmUploadRequest,
  ConfirmUploadResponse,
  MetadataSource,
  MetadataDetails,
  UserProfile,
} from './api.js';

// Platform sample book contract
export {
  PLATFORM_BOOKS_MANIFEST,
  PLATFORM_BOOKS_SEEDED_KEY,
} from './platform-books.js';
export type {
  PlatformBookDownload,
  PlatformBookEntry,
  PlatformBooksResponse,
} from './platform-books.js';

// Catalog API contracts
export type {
  CatalogBook,
  CatalogBookDetail,
  CatalogBrowseQuery,
  CatalogBrowseResponse,
  CatalogCollection,
  CatalogCollectionBooksResponse,
  CatalogCollectionDetail,
  CatalogCollectionsResponse,
  CatalogDownloadUrlRequest,
  CatalogDownloadUrlResponse,
  CatalogImportResponse,
  CatalogImportStatus,
  CatalogSort,
  CatalogStatusResponse,
  CatalogWishlistBook,
  CatalogWishlistResponse,
  CollectionWithBooks,
} from './catalog.js';

// MCP (Model Context Protocol) types
export type {
  McpBookInfo,
  McpChapter,
  McpTocEntry,
  McpSearchResult,
  McpAnnotation,
} from './mcp.js';

// Error types
export type { ApiError, ApiErrorCode } from './error.js';

// Timestamp utilities
export { toEpoch, toISO } from './timestamp.js';

// Canonical launch tier config and feature contract defaults
export { GEN3_V3_FALLBACK_TIER_CONFIG, getGen3V3FallbackTierConfig } from './tier-config.js';
export type {
  BoostOption,
  CostRates,
  PublicPricingResponse,
  RegionalPricingEntry,
  StorageAddon,
  TierConfig,
  TierDefinition,
  UserPlan,
} from './tier-config.js';
