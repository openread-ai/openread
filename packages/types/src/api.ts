/**
 * @module @openread/types/api
 * API request and response types for the OpenRead platform REST API.
 */

import type { Book, BookFormat } from './book.js';

/**
 * Query parameters for GET /api/books.
 */
export interface ListBooksQuery {
  /**
   * Page number (1-indexed).
   * @default 1
   */
  page?: number;

  /**
   * Items per page.
   * @default 20
   * @maximum 100
   */
  pageSize?: number;

  /**
   * Sort field.
   * @default 'createdAt'
   */
  sortBy?: 'createdAt' | 'updatedAt' | 'title';

  /**
   * Sort direction.
   * @default 'desc'
   */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated list of books response.
 *
 * Returned by GET /api/books endpoint.
 */
export interface ListBooksResponse {
  /**
   * Array of book entities for the current page.
   */
  books: Book[];

  /**
   * Total count of books matching the query (for pagination).
   */
  total: number;

  /**
   * Current page number (1-indexed).
   */
  page: number;

  /**
   * Number of items per page.
   */
  pageSize: number;

  /**
   * Total number of pages.
   */
  totalPages: number;
}

/**
 * Request body for obtaining a presigned upload URL.
 *
 * Sent to POST /api/books/upload-url endpoint.
 */
export interface UploadUrlRequest {
  /**
   * File format of the book to upload.
   */
  format: BookFormat;

  /**
   * SHA-256 hash of the file content.
   * Used for deduplication check before upload.
   */
  hash: string;

  /**
   * SHA-256 hash of the extracted metadata.
   */
  metaHash: string;

  /**
   * Book title extracted from metadata.
   */
  title: string;

  /**
   * Author name extracted from metadata (optional).
   */
  author?: string;

  /**
   * File size in bytes.
   * Used for quota validation before upload.
   */
  sizeBytes: number;
}

/**
 * Response containing a presigned upload URL.
 *
 * Returned by POST /api/books/upload-url endpoint.
 */
export interface UploadUrlResponse {
  /**
   * Presigned URL for PUT upload to R2 storage.
   * Valid for a limited time (typically 15 minutes).
   */
  uploadUrl: string;

  /**
   * Generated book ID to use in the confirm call.
   * This ID is pre-allocated before upload completes.
   */
  bookId: string;
}

/**
 * Request body for confirming a completed upload.
 *
 * Sent to POST /api/books/confirm endpoint.
 */
export interface ConfirmUploadRequest {
  /**
   * Book ID from the upload URL response.
   */
  bookId: string;

  /**
   * Override extracted title (optional).
   */
  title?: string;

  /**
   * Override extracted author (optional).
   */
  author?: string;
}

/**
 * Source of title or author in metadata extraction.
 */
export type MetadataSource = 'extracted' | 'provided' | 'filename';

/**
 * Metadata extraction details.
 */
export interface MetadataDetails {
  /**
   * Source of the final title value.
   */
  titleSource: MetadataSource;

  /**
   * Source of the final author value (null if no author).
   */
  authorSource: MetadataSource | null;

  /**
   * Any warnings during metadata extraction.
   */
  warnings: string[];
}

/**
 * Response after confirming a completed upload.
 *
 * Returned by POST /api/books/confirm endpoint.
 */
export interface ConfirmUploadResponse {
  /**
   * The created book entity with all fields populated.
   */
  book: Book;

  /**
   * Metadata extraction details.
   */
  metadata: MetadataDetails;
}

/**
 * Public user profile information.
 *
 * Returned by GET /api/users/me endpoint.
 */
export interface UserProfile {
  /**
   * User ID (UUID).
   */
  id: string;

  /**
   * User's email address.
   */
  email: string;

  /**
   * Display name (optional).
   */
  name?: string;

  /**
   * Avatar URL (optional).
   */
  avatarUrl?: string;

  /**
   * ISO 8601 timestamp of account creation.
   */
  createdAt: string;
}
