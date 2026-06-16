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
export {
  BYTES_PER_GB,
  GEN3_V3_FALLBACK_TIER_CONFIG,
  evaluateLibraryLimit,
  getGen3V3FallbackTierConfig,
  getLibraryLimitForPlan,
} from './tier-config.js';
export type {
  BoostOption,
  CostRates,
  LibraryLimitDecision,
  PublicPricingResponse,
  RegionalPricingEntry,
  StorageAddon,
  TierConfig,
  TierDefinition,
  UserPlan,
} from './tier-config.js';
