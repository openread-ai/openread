/**
 * @module @openread/sdk/error
 * SDK error types for typed error handling.
 */

import type { ApiError, ApiErrorCode } from '@openread/types';

/**
 * Error thrown by SDK methods when an API call fails.
 *
 * @example
 * ```typescript
 * try {
 *   await sdk.books.get('invalid-id');
 * } catch (err) {
 *   if (err instanceof OpenreadError) {
 *     console.log(err.code); // 'NOT_FOUND'
 *     console.log(err.message); // 'Book not found'
 *   }
 * }
 * ```
 */
export class OpenreadError extends Error implements ApiError {
  /**
   * Error code (e.g., 'UNAUTHORIZED', 'NOT_FOUND')
   */
  readonly code: ApiErrorCode;

  /**
   * Additional error details from the API
   */
  readonly details?: Record<string, unknown>;

  /**
   * HTTP status code of the response
   */
  readonly status?: number;

  constructor(
    code: ApiErrorCode,
    message: string,
    options?: { details?: Record<string, unknown>; status?: number }
  ) {
    super(message);
    this.name = 'OpenreadError';
    this.code = code;
    this.details = options?.details;
    this.status = options?.status;
  }
}
