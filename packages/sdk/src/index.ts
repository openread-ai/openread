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
 *   baseUrl: 'https://api.openread.ai',
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

import type { AuthTokenProvider } from '@openread/auth';
import type {
  ApiErrorCode,
  Book,
  CatalogBookDetail,
  CreatePlatformApiKeyRequest,
  CreatePlatformApiKeyResponse,
  DeletePlatformApiKeyResponse,
  DeleteProviderApiKeyResponse,
  CatalogBrowseQuery,
  CatalogBrowseResponse,
  CatalogCollectionBooksResponse,
  CatalogCollectionDetail,
  CatalogCollectionsResponse,
  CatalogDownloadUrlResponse,
  CatalogImportResponse,
  CatalogStatusResponse,
  CatalogWishlistResponse,
  ListBooksResponse,
  ListPlatformApiKeysResponse,
  ListProviderApiKeysResponse,
  McpAuthRequest,
  McpAuthResponse,
  McpDownloadUrlRequest,
  McpDownloadUrlResponse,
  PublicPricingResponse,
  TierConfig,
  TestProviderApiKeyRequest,
  TestProviderApiKeyResponse,
  UpsertProviderApiKeyRequest,
  UpsertProviderApiKeyResponse,
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

class RuntimeClient {
  /** @internal */
  readonly _sdk: Openread;

  constructor(sdk: Openread) {
    this._sdk = sdk;
  }

  /**
   * Get the public runtime tier configuration contract.
   */
  async getTierConfig(): Promise<TierConfig> {
    return this._sdk.fetch<TierConfig>('/api/tier-config');
  }

  /**
   * Get public pricing resolved by the backend from request context.
   */
  async getPricing(): Promise<PublicPricingResponse> {
    return this._sdk.fetch<PublicPricingResponse>('/api/pricing');
  }
}

class CatalogClient {
  /** @internal */
  readonly _sdk: Openread;

  constructor(sdk: Openread) {
    this._sdk = sdk;
  }

  async listBooks(query: CatalogBrowseQuery = {}, init?: RequestInit): Promise<CatalogBrowseResponse> {
    return this._sdk.fetch<CatalogBrowseResponse>(`/catalog/books?${catalogQueryString(query)}`, init);
  }

  async searchInternetArchive(query: { q: string; page?: number; limit?: number }, init?: RequestInit): Promise<CatalogBrowseResponse> {
    const params = new URLSearchParams({ q: query.q });
    if (query.page !== undefined) params.set('page', String(query.page));
    if (query.limit !== undefined) params.set('limit', String(query.limit));
    return this._sdk.fetch<CatalogBrowseResponse>(`/catalog/ia/search?${params}`, init);
  }

  async getBook(id: string, init?: RequestInit): Promise<CatalogBookDetail> {
    return this._sdk.fetch<CatalogBookDetail>(`/catalog/books/${encodeURIComponent(id)}`, init);
  }

  async getImportStatus(id: string, init?: RequestInit): Promise<CatalogStatusResponse> {
    return this._sdk.fetch<CatalogStatusResponse>(`/catalog/books/${encodeURIComponent(id)}/status`, init);
  }

  async importBook(id: string, init?: RequestInit): Promise<CatalogImportResponse> {
    return this._sdk.fetch<CatalogImportResponse>(`/api/catalog/books/${encodeURIComponent(id)}/import`, {
      ...init,
      method: 'POST',
    });
  }

  async importInternetArchiveBook(iaIdentifier: string, init?: RequestInit): Promise<CatalogImportResponse> {
    return this._sdk.fetch<CatalogImportResponse>('/api/catalog/ia/import', {
      ...init,
      method: 'POST',
      body: JSON.stringify({ ia_identifier: iaIdentifier }),
    });
  }

  async getDownloadUrl(bookHash: string, init?: RequestInit): Promise<CatalogDownloadUrlResponse> {
    return this._sdk.fetch<CatalogDownloadUrlResponse>('/api/catalog/books/download-url', {
      ...init,
      method: 'POST',
      body: JSON.stringify({ bookHash }),
    });
  }

  async listWishlist(init?: RequestInit): Promise<CatalogWishlistResponse> {
    return this._sdk.fetch<CatalogWishlistResponse>('/api/catalog/wishlist', init);
  }

  async addWishlistBook(id: string, init?: RequestInit): Promise<{ ok: boolean }> {
    return this._sdk.fetch<{ ok: boolean }>(`/api/catalog/books/${encodeURIComponent(id)}/wishlist`, {
      ...init,
      method: 'POST',
    });
  }

  async removeWishlistBook(id: string, init?: RequestInit): Promise<{ ok: boolean }> {
    return this._sdk.fetch<{ ok: boolean }>(`/api/catalog/books/${encodeURIComponent(id)}/wishlist`, {
      ...init,
      method: 'DELETE',
    });
  }

  async listCollections(init?: RequestInit): Promise<CatalogCollectionsResponse> {
    return this._sdk.fetch<CatalogCollectionsResponse>('/catalog/collections', init);
  }

  async getCollection(slug: string, init?: RequestInit): Promise<CatalogCollectionDetail> {
    return this._sdk.fetch<CatalogCollectionDetail>(`/catalog/collections/${encodeURIComponent(slug)}`, init);
  }

  async listCollectionBooks(slug: string, query: { page?: number; limit?: number } = {}, init?: RequestInit): Promise<CatalogCollectionBooksResponse> {
    const params = new URLSearchParams();
    if (query.page !== undefined) params.set('page', String(query.page));
    if (query.limit !== undefined) params.set('limit', String(query.limit));
    const suffix = params.size > 0 ? `?${params}` : '';
    return this._sdk.fetch<CatalogCollectionBooksResponse>(`/catalog/collections/${encodeURIComponent(slug)}/books${suffix}`, init);
  }
}

class ApiKeysClient {
  /** @internal */
  readonly _sdk: Openread;

  constructor(sdk: Openread) {
    this._sdk = sdk;
  }

  async listPlatformKeys(init?: RequestInit): Promise<ListPlatformApiKeysResponse> {
    return this._sdk.fetch<ListPlatformApiKeysResponse>('/api/api-keys', init);
  }

  async createPlatformKey(
    input: CreatePlatformApiKeyRequest,
    init?: RequestInit,
  ): Promise<CreatePlatformApiKeyResponse> {
    return this._sdk.fetch<CreatePlatformApiKeyResponse>('/api/api-keys', {
      ...init,
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async deletePlatformKey(id: string, init?: RequestInit): Promise<DeletePlatformApiKeyResponse> {
    return this._sdk.fetch<DeletePlatformApiKeyResponse>(`/api/api-keys/${encodeURIComponent(id)}`, {
      ...init,
      method: 'DELETE',
    });
  }

  async listProviderKeys(init?: RequestInit): Promise<ListProviderApiKeysResponse> {
    return this._sdk.fetch<ListProviderApiKeysResponse>('/api/settings/api-keys', init);
  }

  async upsertProviderKey(
    input: UpsertProviderApiKeyRequest,
    init?: RequestInit,
  ): Promise<UpsertProviderApiKeyResponse> {
    return this._sdk.fetch<UpsertProviderApiKeyResponse>('/api/settings/api-keys', {
      ...init,
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async deleteProviderKey(
    provider: string,
    init?: RequestInit,
  ): Promise<DeleteProviderApiKeyResponse> {
    return this._sdk.fetch<DeleteProviderApiKeyResponse>(
      `/api/settings/api-keys/${encodeURIComponent(provider)}`,
      {
        ...init,
        method: 'DELETE',
      },
    );
  }

  async testProviderKey(
    input: TestProviderApiKeyRequest,
    init?: RequestInit,
  ): Promise<TestProviderApiKeyResponse> {
    return this._sdk.fetch<TestProviderApiKeyResponse>('/api/settings/api-keys/test', {
      ...init,
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
}

class McpClient {
  /** @internal */
  readonly _sdk: Openread;

  constructor(sdk: Openread) {
    this._sdk = sdk;
  }

  async auth(input: McpAuthRequest, init?: RequestInit): Promise<McpAuthResponse> {
    return this._sdk.fetch<McpAuthResponse>('/api/mcp/auth', {
      ...init,
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async getDownloadUrl(
    input: McpDownloadUrlRequest,
    init?: RequestInit,
  ): Promise<McpDownloadUrlResponse> {
    return this._sdk.fetch<McpDownloadUrlResponse>('/api/mcp/download-url', {
      ...init,
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
}

function catalogQueryString(query: CatalogBrowseQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.subject) params.set('subject', query.subject);
  if (query.language) params.set('language', query.language);
  if (query.languages?.length) params.set('languages', query.languages.join(','));
  if (query.sources?.length) params.set('sources', query.sources.join(','));
  if (query.minPages !== undefined) params.set('minPages', String(query.minPages));
  if (query.maxPages !== undefined) params.set('maxPages', String(query.maxPages));
  if (query.region) params.set('region', query.region);
  if (query.sort) params.set('sort', query.sort);
  if (query.page !== undefined) params.set('page', String(query.page));
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  return params.toString();
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
 *   baseUrl: 'https://api.openread.ai',
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
  private readonly tokenProvider: AuthTokenProvider;

  /**
   * Authentication client for user-related operations.
   */
  readonly auth: AuthClient;

  /**
   * Runtime public configuration client.
   */
  readonly runtime: RuntimeClient;

  /**
   * Books client for library management.
   */
  readonly books: BooksClient;

  /**
   * Catalog client for public catalog and import lifecycle operations.
   */
  readonly catalog: CatalogClient;

  /**
   * API-key management client.
   */
  readonly apiKeys: ApiKeysClient;

  /**
   * MCP auth and download-url client.
   */
  readonly mcp: McpClient;

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
    if (config.tokenProvider) {
      this.tokenProvider = config.tokenProvider;
    } else if (config.getAccessToken) {
      this.tokenProvider = {
        getAccessToken: config.getAccessToken,
        refreshIfNeeded: async () => {
          const accessToken = await config.getAccessToken?.();
          return accessToken
            ? { accessToken, user: { id: '' }, expiresAt: Date.now() + 60_000 }
            : null;
        },
        clear: async () => undefined,
      };
    } else {
      throw new Error('Openread requires tokenProvider or getAccessToken');
    }
    this.auth = new AuthClient(this);
    this.runtime = new RuntimeClient(this);
    this.books = new BooksClient(this);
    this.catalog = new CatalogClient(this);
    this.apiKeys = new ApiKeysClient(this);
    this.mcp = new McpClient(this);
    this.ingest = new IngestClient(this);
  }

  /**
   * Get the current access token from the config callback.
   *
   * @internal Used by AuthClient.hasToken()
   * @returns The access token or null if not available
   */
  async getAccessToken(): Promise<string | null> {
    return this.tokenProvider.getAccessToken();
  }

  private get fetcher(): typeof globalThis.fetch {
    return this.config.fetch ?? globalThis.fetch.bind(globalThis);
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
    const token = await this.tokenProvider.getAccessToken();

    const url = `${this.config.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((init?.headers as Record<string, string>) || {}),
    };

    // Only add Authorization header if we have a token
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await this.fetcher(url, {
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
    this.tokenRefreshPromise = this.tokenProvider
      .refreshIfNeeded()
      .then((session) => session?.accessToken ?? null);

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

    const response = await this.fetcher(url, {
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
