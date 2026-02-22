/**
 * @module @openread/types/error
 * Standardized API error types for the OpenRead platform.
 */

/**
 * Standard API error codes used across the platform.
 *
 * Server-side errors:
 * - `UNAUTHORIZED`: Authentication required or failed (401)
 * - `FORBIDDEN`: Authenticated but not authorized for resource (403)
 * - `NOT_FOUND`: Requested resource does not exist (404)
 * - `FILE_NOT_FOUND`: Specific file not found in storage (404)
 * - `VALIDATION_ERROR`: Request body or parameters failed validation (400/422)
 * - `CONFLICT`: Resource already exists or state conflict (409)
 * - `INTERNAL_ERROR`: Unexpected server error (500)
 * - `FILE_TOO_LARGE`: Uploaded file exceeds size limit (400)
 * - `DUPLICATE_BOOK`: User already has this book in their library (409)
 * - `RATE_LIMITED`: Too many requests (429)
 *
 * Client-side errors (SDK only):
 * - `NETWORK_ERROR`: Network failure during request
 * - `UPLOAD_FAILED`: File upload to storage failed
 * - `UPLOAD_CANCELLED`: Upload was cancelled by user
 * - `UPLOAD_EXPIRED`: Presigned upload URL has expired
 * - `INVALID_FORMAT`: Unsupported file format
 */
export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'FILE_NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'INTERNAL_ERROR'
  | 'FILE_TOO_LARGE'
  | 'DUPLICATE_BOOK'
  | 'RATE_LIMITED'
  // Client-side errors (SDK)
  | 'NETWORK_ERROR'
  | 'UPLOAD_FAILED'
  | 'UPLOAD_CANCELLED'
  | 'UPLOAD_EXPIRED'
  | 'INVALID_FORMAT';

/**
 * Standardized API error response.
 *
 * All API errors follow this structure for consistent error handling
 * across clients and services.
 *
 * @example
 * ```json
 * {
 *   "code": "VALIDATION_ERROR",
 *   "message": "Invalid request body",
 *   "details": {
 *     "title": "Title is required",
 *     "format": "Format must be 'epub' or 'pdf'"
 *   }
 * }
 * ```
 */
export interface ApiError {
  /**
   * Machine-readable error code for programmatic handling.
   */
  code: ApiErrorCode;

  /**
   * Human-readable error message suitable for display.
   */
  message: string;

  /**
   * Additional error details.
   * For validation errors, this contains field-level error messages.
   * For other errors, this may contain debug information.
   */
  details?: Record<string, unknown>;
}
