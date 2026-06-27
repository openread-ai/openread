import { getAccessToken } from './access';
import { createLogger } from '@/utils/logger';
import { isTauriAppPlatform, isMobilePlatform } from '@/services/environment';

const logger = createLogger('fetch');

/**
 * Get the appropriate fetch function for the current platform.
 * On Tauri mobile (iOS/Android), the WebView's native fetch() cannot reach external
 * URLs due to WKWebView's custom scheme restrictions. Tauri's plugin-http routes
 * requests through the native layer, bypassing this limitation.
 * Desktop Tauri (macOS/Windows/Linux) works fine with browser fetch.
 */
let _tauriFetch: typeof globalThis.fetch | null = null;
export async function getPlatformFetch(): Promise<typeof globalThis.fetch> {
  if (isTauriAppPlatform() && isMobilePlatform()) {
    if (!_tauriFetch) {
      const { fetch: tf } = await import('@tauri-apps/plugin-http');
      _tauriFetch = tf as unknown as typeof globalThis.fetch;
    }
    return _tauriFetch;
  }
  return globalThis.fetch;
}

export const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeout = 10000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort('Request timed out'), timeout);
  const platformFetch = await getPlatformFetch();

  return platformFetch(url, {
    ...options,
    signal: controller.signal,
  }).finally(() => clearTimeout(id));
};

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(code ? `${code}: ${message}` : message);
    this.name = 'ApiRequestError';
  }
}

const parseErrorBody = async (response: Response) => {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const body = (await response.json().catch(() => null)) as {
      code?: string;
      message?: string;
      error?: string;
      details?: unknown;
    } | null;
    if (body) {
      return {
        code: body.code,
        message: body.message ?? body.error,
        details: body.details,
      };
    }
  }

  const text = await response.text().catch(() => '');
  return {
    code: undefined,
    message: text.trim() || response.statusText || `HTTP ${response.status}`,
    details: undefined,
  };
};

export const fetchWithAuth = async (url: string, options: RequestInit) => {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Not authenticated');
  }
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  const platformFetch = await getPlatformFetch();
  const response = await platformFetch(url, { ...options, headers });

  if (!response.ok) {
    const errorData = await parseErrorBody(response);
    const message = errorData.message ?? 'Request failed';
    logger.error('Error:', errorData.code ?? message);
    throw new ApiRequestError(
      `Request failed with HTTP ${response.status}: ${message}`,
      response.status,
      errorData.code,
      errorData.details,
    );
  }

  return response;
};
