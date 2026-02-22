/**
 * @module @openread/sdk/types
 * SDK-specific configuration types.
 */

/**
 * Configuration for the Openread SDK client.
 */
export interface OpenreadConfig {
  /**
   * Base URL of the OpenRead API.
   * @example 'https://api.openread.app'
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
  getAccessToken: () => Promise<string | null>;
}
