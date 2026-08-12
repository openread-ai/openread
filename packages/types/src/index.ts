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
  isReaderBookKeyOrRef,
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
  parseBookRefFromReaderBookKey,
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
export {
  PLATFORM_UPLOAD_FORMATS,
  PLATFORM_UPLOAD_SIZE_LIMITS,
  parsePlatformUploadBookFormat,
} from './catalog-source-verification.js';
export type { PlatformUploadBookFormat } from './catalog-source-verification.js';

// Account deletion contract
export {
  ACCOUNT_DELETION_CLEANUP_MODES,
  ACCOUNT_DELETION_DELETE_RULES,
  ACCOUNT_DELETION_TARGETS,
  assertAccountDeletionSchemaInventory,
} from './account-deletion.js';
export type {
  AccountDeletionCleanupMode,
  AccountDeletionDeleteRule,
  AccountDeletionSchemaInventoryRow,
  AccountDeletionTarget,
} from './account-deletion.js';

// Canonical paid-subscription status contract
export {
  ACTIVE_IAP_STATUSES,
  ACTIVE_STRIPE_STATUSES,
  isActiveStripeStatus,
} from './subscription-statuses.js';
export type { ActiveIAPStatus, ActiveStripeStatus } from './subscription-statuses.js';

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

// Catalog API contracts
export {
  CATALOG_ADD_FAILURE_CODES,
  CATALOG_ADD_REQUEST_STATES,
  CATALOG_MATERIALIZATION_FAILURE_CODES,
  CATALOG_MATERIALIZATION_FAILURE_DETAIL_CATEGORIES,
  CATALOG_MATERIALIZATION_FAILURE_DETAIL_MAX_LENGTH,
  CATALOG_MATERIALIZATION_FAILURE_DETAIL_PATTERN,
  CATALOG_RETRYABLE_MATERIALIZATION_FAILURE_CODES,
  CATALOG_TERMINAL_MATERIALIZATION_FAILURE_CODES,
  isCatalogAddFailureCode,
  isCatalogAddRequestState,
  isCatalogMaterializationFailureCode,
  isCatalogMaterializationFailureDetail,
} from './catalog.js';
export type {
  CatalogBook,
  CatalogBookDetail,
  CatalogBrowseQuery,
  CatalogBrowseResponse,
  CatalogCollection,
  CatalogCollectionBooksResponse,
  CatalogAddPublicState,
  CatalogAddRequestResponse,
  CatalogAddRequestState,
  CatalogMaterializationState,
  CatalogMaterializationFailureCode,
  CatalogRetryableMaterializationFailureCode,
  CatalogTerminalMaterializationFailureCode,
  CatalogAddFailureCode,
  CatalogCollectionDetail,
  CatalogCollectionsResponse,
  CatalogDownloadUrlRequest,
  CatalogDownloadUrlResponse,
  CatalogImportResponse,
  CatalogImportStatus,
  CatalogSort,
  CatalogStatsResponse,
  CatalogSubject,
  CatalogSubjectsResponse,
  CatalogStatusResponse,
  CatalogWishlistBook,
  CatalogWishlistResponse,
  CollectionWithBooks,
} from './catalog.js';

// API key contracts
export type {
  CreatePlatformApiKeyRequest,
  CreatePlatformApiKeyResponse,
  DeletePlatformApiKeyResponse,
  DeleteProviderApiKeyResponse,
  ListPlatformApiKeysResponse,
  ListProviderApiKeysResponse,
  PlatformApiKeySummary,
  ProviderApiKeySummary,
  TestProviderApiKeyRequest,
  TestProviderApiKeyResponse,
  UpsertProviderApiKeyRequest,
  UpsertProviderApiKeyResponse,
} from './api-keys.js';

// MCP (Model Context Protocol) types
export type {
  McpBookInfo,
  McpChapter,
  McpTocEntry,
  McpSearchResult,
  McpAnnotation,
} from './mcp.js';
export type {
  McpAuthRequest,
  McpAuthResponse,
  McpDownloadUrlRequest,
  McpDownloadUrlResponse,
} from './mcp-api.js';

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
