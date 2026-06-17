/**
 * @module @openread/sdk/types
 * SDK-specific configuration types.
 */

import type { AuthTokenProvider } from '@openread/auth';

/**
 * Configuration for the Openread SDK client.
 */
export interface OpenreadConfig {
  /**
   * Base URL of the OpenRead API.
   * @example 'https://api.openread.ai'
   */
  baseUrl: string;

  /**
   * Async function that returns the current access token.
   * Called before each request. Should handle token refresh internally.
   *
   * @returns Promise resolving to the access token string, or null if not authenticated
   *
   * @example
   * ```typescript
   * getAccessToken: async () => {
   *   const { data } = await supabase.auth.getSession();
   *   return data.session?.access_token ?? null;
   * }
   * ```
   */
  getAccessToken?: () => Promise<string | null>;

  /**
   * Canonical auth token provider. Preferred over getAccessToken because it
   * exposes the shared refresh policy used by app/platform clients.
   */
  tokenProvider?: AuthTokenProvider;

  /**
   * Runtime-specific fetch implementation.
   *
   * Apps can inject platform transport here, e.g. Tauri mobile's native HTTP
   * fetch, while browser and server SDK consumers can omit it to use global fetch.
   */
  fetch?: typeof globalThis.fetch;
}
