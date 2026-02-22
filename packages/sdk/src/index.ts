/**
 * @module @openread/sdk
 * OpenRead Platform SDK Client.
 *
 * Provides type-safe access to the OpenRead API for managing books,
 * authentication, and ingestion.
 *
 * @example
 * ```typescript
 * import { Openread } from '@openread/sdk';
 *
 * const sdk = new Openread({
 *   baseUrl: 'https://api.openread.app',
 *   getAccessToken: async () => {
 *     const { data } = await supabase.auth.getSession();
 *     return data.session?.access_token ?? null;
 *   },
 * });
 *
 * // Use the SDK
 * const { books } = await sdk.books.list();
 * ```
 */

import type {
  ApiErrorCode,
  Book,
  ListBooksResponse,
  UserProfile,
} from '@openread/types';
import type { OpenreadConfig } from './types.js';
import { OpenreadError } from './error.js';
import { IngestClient } from './ingest.js';

// Re-export types
export type { OpenreadConfig } from './types.js';
export { OpenreadError } from './error.js';
export { IngestClient, type UploadOptions, type UploadResult } from './ingest.js';

// Forward declarations for sub-clients (implemented in P2.8, P2.9, P3.8)
class AuthClient {
  /** @internal */
  readonly _sdk: Openread;

  constructor(sdk: Openread) {
    this._sdk = sdk;
  }

  /**
   * Get the current authenticated user's profile.
   *
   * @returns User profile information
   * @throws OpenreadError with 'UNAUTHORIZED' if not authenticated
   *
   * @example
   * ```typescript
   * try {
   *   const user = await sdk.auth.getUser();
   *   console.log(`Hello, ${user.email}`);
   * } catch (err) {
   *   if (err instanceof OpenreadError && err.code === 'UNAUTHORIZED') {
   *     // Redirect to login
   *   }
   * }
   * ```
   */
  async getUser(): Promise<UserProfile> {
    return this._sdk.fetch<UserProfile>('/api/auth/me');
  }

  /**
   * Check if the current user is authenticated.
   *
   * Makes a lightweight API call to verify the token is valid.
   * Returns false only for auth failures (401/403), throws on network errors.
   *
   * @returns true if authenticated, false if not authenticated
   * @throws Error on network failures or unexpected errors
   *
   * @example
   * ```typescript
   * try {
   *   if (await sdk.auth.isAuthenticated()) {
   *     // Show authenticated UI
   *   } else {
   *     // Show login prompt
   *   }
   * } catch (err) {
   *   // Handle network error - don't assume not authenticated
   * }
   * ```
   */
  async isAuthenticated(): Promise<boolean> {
    try {
      await this._sdk.fetch('/api/auth/verify');
      return true;
    } catch (err) {
      // Only return false for auth failures, rethrow other errors
      if (err instanceof OpenreadError && (err.code === 'UNAUTHORIZED' || err.code === 'FORBIDDEN')) {
        return false;
      }
      // Network errors, server errors, etc. should be surfaced to caller
      throw err;
    }
  }

  /**
   * Check if a token is available without making an API call.
   *
   * Attempts to get a token via the callback. If it succeeds,
   * the user is likely authenticated (token may still be expired).
   *
   * For definitive auth status, use `isAuthenticated()` instead.
   *
   * @returns true if token callback returns a truthy value, false otherwise
   * @throws Error if the token callback throws an unexpected error (not auth-related)
   *
   * @example
   * ```typescript
   * if (await sdk.auth.hasToken()) {
   *   // Token exists, but might be expired
   *   // Use isAuthenticated() for definitive check
   * }
   * ```
   */
  async hasToken(): Promise<boolean> {
    try {
      const token = await this._sdk.getAccessToken();
      return !!token;
    } catch (err) {
      // Only return false for expected "no token" scenarios (null/undefined returns)
      // Let bugs in the callback propagate so developers can fix them
      if (err instanceof OpenreadError && err.code === 'UNAUTHORIZED') {
        return false;
      }
      // Re-throw unexpected errors - the callback may be broken
      throw err;
    }
  }
}

class BooksClient {
  /** @internal */
  readonly _sdk: Openread;

  constructor(sdk: Openread) {
    this._sdk = sdk;
  }

  /**
   * List books in the user's library.
   *
   * @param page - Page number (1-indexed, default: 1)
   * @param pageSize - Items per page (default: 20, max: 100)
   * @returns Paginated list of books
   *
   * @example
   * ```typescript
   * // Get first page
   * const { books, total, page, pageSize } = await sdk.books.list();
   *
   * // Get specific page with custom size
   * const page2 = await sdk.books.list(2, 50);
   * ```
   */
  async list(page = 1, pageSize = 20): Promise<ListBooksResponse> {
    const params = new URLSearchParams({
      page: page.toString(),
      pageSize: Math.min(pageSize, 100).toString(),
    });

    return this._sdk.fetch<ListBooksResponse>(`/api/books?${params}`);
  }

  /**
   * Get a book by its ID.
   *
   * @param id - Book ID (UUID)
   * @returns Book entity
   * @throws OpenreadError with 'NOT_FOUND' if book doesn't exist
   *
   * @example
   * ```typescript
   * try {
   *   const book = await sdk.books.get('abc-123');
   *   console.log(book.title);
   * } catch (err) {
   *   if (err instanceof OpenreadError && err.code === 'NOT_FOUND') {
   *     console.log('Book not found');
   *   }
   * }
   * ```
   */
  async get(id: string): Promise<Book> {
    return this._sdk.fetch<Book>(`/api/books/${encodeURIComponent(id)}`);
  }

  /**
   * Check if a book with the given content hash exists in the user's library.
   *
   * Useful for deduplication before upload - check if the user
   * already has this exact file.
   *
   * @param hash - SHA-256 hash of the file content
   * @returns true if book exists, false otherwise
   *
   * @example
   * ```typescript
   * const hash = await calculateHash(file);
   * if (await sdk.books.exists(hash)) {
   *   console.log('You already have this book');
   * } else {
   *   // Proceed with upload
   * }
   * ```
   */
  async exists(hash: string): Promise<boolean> {
    try {
      await this._sdk.fetch(`/api/books/hash/${encodeURIComponent(hash)}`);
      return true;
    } catch (err) {
      if (err instanceof OpenreadError && err.code === 'NOT_FOUND') {
        return false;
      }
      throw err;
    }
  }

  /**
   * Get a book by its content hash.
   *
   * @param hash - SHA-256 hash of the file content
   * @returns Book entity if found, null otherwise
   *
   * @example
   * ```typescript
   * const existingBook = await sdk.books.getByHash(hash);
   * if (existingBook) {
   *   console.log(`Found: ${existingBook.title}`);
   * }
   * ```
   */
  async getByHash(hash: string): Promise<Book | null> {
    try {
      return await this._sdk.fetch<Book>(
        `/api/books/hash/${encodeURIComponent(hash)}`
      );
    } catch (err) {
      if (err instanceof OpenreadError && err.code === 'NOT_FOUND') {
        return null;
      }
      throw err;
    }
  }

  /**
   * Get download URL for a book.
   *
   * Returns a pre-signed URL that can be used to download the book file.
   * URL expires after a short time (typically 1 hour).
   *
   * @param id - Book ID
   * @returns Pre-signed download URL
   *
   * @example
   * ```typescript
   * const url = await sdk.books.getDownloadUrl('abc-123');
   * // Use URL to download the file
   * const response = await fetch(url);
   * ```
   */
  async getDownloadUrl(id: string): Promise<string> {
    const response = await this._sdk.fetch<{ downloadUrl: string }>(
      `/api/books/${encodeURIComponent(id)}/download`
    );
    return response.downloadUrl;
  }
}

/**
 * OpenRead Platform SDK Client.
 *
 * Provides type-safe access to the OpenRead API for managing books,
 * authentication, and ingestion.
 *
 * @example
 * ```typescript
 * import { Openread } from '@openread/sdk';
 * import { supabase } from './supabase';
 *
 * const sdk = new Openread({
 *   baseUrl: 'https://api.openread.app',
 *   getAccessToken: async () => {
 *     const { data } = await supabase.auth.getSession();
 *     if (!data.session) return null;
 *     return data.session.access_token;
 *   },
 * });
 *
 * // Use the SDK
 * const { books } = await sdk.books.list();
 * ```
 */
export class Openread {
  private readonly config: OpenreadConfig;

  /**
   * Deduplication promise for concurrent token requests.
   * When multiple 401s occur simultaneously, this ensures only one
   * getAccessToken() call is in flight at a time. The callback is
   * responsible for actual token refresh logic.
   * @internal
   */
  private tokenRefreshPromise: Promise<string | null> | null = null;

  /**
   * Authentication client for user-related operations.
   */
  readonly auth: AuthClient;

  /**
   * Books client for library management.
   */
  readonly books: BooksClient;

  /**
   * Ingestion client for uploading books.
   */
  readonly ingest: IngestClient;

  /**
   * Create a new Openread SDK instance.
   *
   * @param config - SDK configuration
   */
  constructor(config: OpenreadConfig) {
    this.config = config;
    this.auth = new AuthClient(this);
    this.books = new BooksClient(this);
    this.ingest = new IngestClient(this);
  }

  /**
   * Get the current access token from the config callback.
   *
   * @internal Used by AuthClient.hasToken()
   * @returns The access token or null if not available
   */
  async getAccessToken(): Promise<string | null> {
    return this.config.getAccessToken();
  }

  /**
   * Make an authenticated request to the API.
   *
   * Automatically handles 401 responses by refreshing the token once
   * and retrying the request. Subsequent 401s after retry throw UNAUTHORIZED.
   *
   * @internal Used by sub-clients to make requests
   * @param path - API path (e.g., '/api/books')
   * @param init - Fetch init options
   * @returns Parsed JSON response
   * @throws OpenreadError on API errors
   */
  async fetch<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await this.config.getAccessToken();

    const url = `${this.config.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((init?.headers as Record<string, string>) || {}),
    };

    // Only add Authorization header if we have a token
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...init,
      headers,
    });

    // Handle 401 - token might have expired, retry once with lock to prevent races
    if (response.status === 401) {
      const newToken = await this.refreshTokenWithLock();
      if (newToken !== token && newToken !== null) {
        // Token was refreshed, retry the request
        return this.fetchWithToken<T>(path, init, newToken);
      }
      // Token didn't change, auth has truly failed
      throw new OpenreadError('UNAUTHORIZED', 'Authentication failed', {
        status: 401,
      });
    }

    // Handle other errors
    if (!response.ok) {
      let errorBody: {
        code?: ApiErrorCode;
        message?: string;
        details?: Record<string, unknown>;
      };
      try {
        errorBody = await response.json();
      } catch (parseError) {
        console.warn(
          `[sdk] Failed to parse error response as JSON (status ${response.status}):`,
          parseError instanceof Error ? parseError.message : parseError,
        );
        errorBody = { code: 'INTERNAL_ERROR', message: response.statusText };
      }

      throw new OpenreadError(
        errorBody.code || 'INTERNAL_ERROR',
        errorBody.message || 'An error occurred',
        {
          details: errorBody.details,
          status: response.status,
        }
      );
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  /**
   * Deduplicate concurrent token requests.
   * Multiple concurrent 401 responses will share a single getAccessToken() call.
   * Note: This deduplicates requests but does not perform actual token refresh -
   * that's the callback's responsibility.
   *
   * @internal
   */
  private async refreshTokenWithLock(): Promise<string | null> {
    // If a refresh is already in progress, wait for it
    if (this.tokenRefreshPromise) {
      return this.tokenRefreshPromise;
    }

    // Start new refresh and store the promise
    this.tokenRefreshPromise = this.config.getAccessToken();

    try {
      const token = await this.tokenRefreshPromise;
      return token;
    } finally {
      // Clear the lock after refresh completes (success or failure)
      this.tokenRefreshPromise = null;
    }
  }

  /**
   * Make a request with a specific token (used for retry after token refresh).
   *
   * @internal
   */
  private async fetchWithToken<T>(
    path: string,
    init: RequestInit | undefined,
    token: string
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...((init?.headers as Record<string, string>) || {}),
    };

    const response = await fetch(url, {
      ...init,
      headers,
    });

    // No retry on this path - if it fails, it fails
    if (!response.ok) {
      let errorBody: {
        code?: ApiErrorCode;
        message?: string;
        details?: Record<string, unknown>;
      };
      try {
        errorBody = await response.json();
      } catch (parseError) {
        console.warn(
          `[sdk] Failed to parse error response as JSON (status ${response.status}):`,
          parseError instanceof Error ? parseError.message : parseError,
        );
        errorBody = { code: 'INTERNAL_ERROR', message: response.statusText };
      }

      throw new OpenreadError(
        errorBody.code || 'INTERNAL_ERROR',
        errorBody.message || 'An error occurred',
        {
          details: errorBody.details,
          status: response.status,
        }
      );
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }
}
