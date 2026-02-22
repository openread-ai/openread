/**
 * Result types for OPDS service operations.
 */

import type {
  OPDSAcquisitionLink,
  OPDSFeed,
  OPDSFeedType,
  OPDSPublication,
  OPDSSearchDescriptor,
} from './opds';

/**
 * Result of browsing an OPDS feed URL.
 */
export interface OPDSBrowseResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Parsed feed (if successful) */
  feed?: OPDSFeed;
  /** Single publication (for entry documents) */
  publication?: OPDSPublication;
  /** Search descriptor (if found) */
  search?: OPDSSearchDescriptor;
  /** Error details (if failed) */
  error?: OPDSError;
  /** Final response URL (may differ from request URL due to redirects) */
  responseUrl: string;
}

/**
 * Result of downloading a publication.
 */
export interface OPDSDownloadResult {
  /** Whether the download succeeded */
  success: boolean;
  /** ID of the imported book in the library */
  bookId?: string;
  /** Local file path (Tauri) or blob URL (web) */
  filePath?: string;
  /** Error details (if failed) */
  error?: OPDSError;
}

/**
 * Result of validating an OPDS catalog URL.
 */
export interface OPDSValidationResult {
  /** Whether the URL is a valid OPDS feed */
  valid: boolean;
  /** Feed type detected */
  feedType?: OPDSFeedType;
  /** Whether the feed requires authentication */
  requiresAuth: boolean;
  /** Error message (if invalid) */
  error?: string;
}

/**
 * Acquisition option for display in the UI.
 */
export interface OPDSAcquisitionOption {
  /** Acquisition type */
  type: 'open-access' | 'borrow' | 'buy' | 'sample' | 'subscribe' | 'generic';
  /** The underlying acquisition link */
  link: OPDSAcquisitionLink;
  /** Price info (for buy/subscribe) */
  price?: { value: number; currency: string };
  /** Human-readable format label (e.g. "EPUB", "PDF") */
  format: string;
  /** Human-readable button label */
  label: string;
}

/**
 * Structured OPDS error.
 */
export interface OPDSError {
  /** Error classification code */
  code: OPDSErrorCode;
  /** Human-readable error message */
  message: string;
  /** Original error for debugging */
  cause?: unknown;
}

/**
 * OPDS error classification codes.
 */
export type OPDSErrorCode =
  | 'NETWORK_ERROR'
  | 'AUTH_REQUIRED'
  | 'AUTH_FAILED'
  | 'PARSE_ERROR'
  | 'INVALID_FEED'
  | 'NOT_FOUND'
  | 'TIMEOUT'
  | 'DOWNLOAD_FAILED'
  | 'UNKNOWN';
