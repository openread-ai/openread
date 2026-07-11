import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import {
  CATALOG_SOURCE_FETCH_REDIRECT_LIMIT,
  FORMAT_MIME_TYPES,
  catalogContentTypeClass,
  catalogExpectedContentTypeMatches,
  catalogFileBytesAreValid,
  catalogSourceMaxBytes,
  catalogSourceUrl,
  type CatalogDownloadFormat,
} from '@openread/types/catalog-source-verification';
import { createImportBookContext } from '@/services/appService';
import type { AppService } from '@/types/system';
import type { Book } from '@/types/book';
import type { CatalogUserDeviceFetchImportIntentResponse } from '@openread/types';

const CATALOG_DEVICE_FETCH_RETRY_DELAYS_MS = [250, 750] as const;

export class CatalogDeviceFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogDeviceFetchError';
  }
}

export class CatalogBrowserSourceDownloadRequiredError extends CatalogDeviceFetchError {
  readonly sourceUrl: string;

  constructor(sourceUrl: URL) {
    super(
      'Your browser blocked the direct source download. Open the source download, then import the saved file from Library.',
    );
    this.name = 'CatalogBrowserSourceDownloadRequiredError';
    this.sourceUrl = sourceUrl.toString();
  }
}

type CatalogDeviceFetchParams = {
  requestedCatalogBookId: string;
  intent: CatalogUserDeviceFetchImportIntentResponse;
  appService: AppService;
  library: Book[];
  signal?: AbortSignal;
};

function catalogBookForIntent(intent: CatalogUserDeviceFetchImportIntentResponse) {
  return {
    source: intent.policy.source,
    source_id: intent.policy.sourceId,
    source_download_url: intent.sourceUrl,
    format_type: intent.format,
    license_type: intent.policy.licenseType,
  };
}

function validateDeviceFetchSourceUrl(
  intent: CatalogUserDeviceFetchImportIntentResponse,
  sourceUrl: string,
): URL {
  try {
    return catalogSourceUrl(catalogBookForIntent(intent), sourceUrl, intent.format);
  } catch {
    throw new CatalogDeviceFetchError('Catalog source URL does not match its source policy.');
  }
}

function validateDeviceFetchIntent(
  requestedCatalogBookId: string,
  intent: CatalogUserDeviceFetchImportIntentResponse,
): URL {
  if (intent.mode !== 'user_device_fetch') {
    throw new CatalogDeviceFetchError('Catalog import intent is not a device-fetch intent.');
  }
  if (intent.catalogBookId !== requestedCatalogBookId) {
    throw new CatalogDeviceFetchError('Catalog import intent did not match the requested book.');
  }
  if (intent.format !== 'epub' && intent.format !== 'pdf') {
    throw new CatalogDeviceFetchError('Catalog import format is not supported on this device.');
  }
  if (!intent.policy.deviceFetchAllowed) {
    throw new CatalogDeviceFetchError('Catalog source policy does not allow device fetch.');
  }
  if (!intent.policy.allowedFormats.includes(intent.format)) {
    throw new CatalogDeviceFetchError('Catalog source policy does not allow this format.');
  }

  return validateDeviceFetchSourceUrl(intent, intent.sourceUrl);
}

function validateContentType(contentType: string | null, format: CatalogDownloadFormat): void {
  const contentTypeClass = catalogContentTypeClass(contentType);
  if (!catalogExpectedContentTypeMatches(format, contentTypeClass)) {
    throw new CatalogDeviceFetchError('Catalog source did not return an ebook file.');
  }
}

function validateBookBytes(bytes: Uint8Array, format: CatalogDownloadFormat): void {
  if (catalogFileBytesAreValid(bytes, format)) return;
  throw new CatalogDeviceFetchError(
    `Catalog source returned invalid ${format.toUpperCase()} bytes.`,
  );
}

function validateDeclaredSize(response: Response, format: CatalogDownloadFormat): void {
  const contentLength = response.headers.get('content-length');
  if (!contentLength || !/^\d+$/.test(contentLength)) return;
  if (Number(contentLength) > catalogSourceMaxBytes(format)) {
    throw new CatalogDeviceFetchError('Catalog source file is larger than this app supports.');
  }
}

async function readCatalogResponseBytes(
  response: Response,
  format: CatalogDownloadFormat,
): Promise<Uint8Array<ArrayBuffer>> {
  const maxBytes = catalogSourceMaxBytes(format);
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      throw new CatalogDeviceFetchError('Catalog source file is larger than this app supports.');
    }
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new CatalogDeviceFetchError('Catalog source file is larger than this app supports.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function isTransientSourceStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function abortError(): Error {
  return Object.assign(new Error('Aborted'), { name: 'AbortError' });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);

  let timeoutId: ReturnType<typeof setTimeout>;
  let onAbort: (() => void) | undefined;

  return new Promise<void>((resolve, reject) => {
    timeoutId = setTimeout(resolve, delayMs);
    onAbort = () => {
      clearTimeout(timeoutId);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  }).finally(() => {
    if (onAbort) signal?.removeEventListener('abort', onAbort);
  });
}

async function fetchCatalogSourceWithTauriRetry(
  sourceUrl: URL,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<Response> {
  const maxAttempts = CATALOG_DEVICE_FETCH_RETRY_DELAYS_MS.length + 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    throwIfAborted(signal);

    try {
      const response = await tauriFetch(sourceUrl.toString(), init);
      if (response.ok || isRedirectStatus(response.status)) return response;

      if (!isTransientSourceStatus(response.status)) {
        throw new CatalogDeviceFetchError(`Catalog source download failed (${response.status}).`);
      }
      if (attempt === maxAttempts - 1) {
        throw new CatalogDeviceFetchError(
          `Catalog source download failed after retries (${response.status}).`,
        );
      }
    } catch (error) {
      if (isAbortError(error) || error instanceof CatalogDeviceFetchError) throw error;
      if (attempt === maxAttempts - 1) {
        throw new CatalogDeviceFetchError('Catalog source download failed after retries.');
      }
    }

    await waitForRetry(CATALOG_DEVICE_FETCH_RETRY_DELAYS_MS[attempt]!, signal);
  }

  throw new CatalogDeviceFetchError('Catalog source download failed after retries.');
}

async function fetchCatalogSourceWithTauri(
  intent: CatalogUserDeviceFetchImportIntentResponse,
  sourceUrl: URL,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<{ response: Response; finalUrl: URL }> {
  let currentUrl = sourceUrl;

  for (
    let redirectCount = 0;
    redirectCount <= CATALOG_SOURCE_FETCH_REDIRECT_LIMIT;
    redirectCount++
  ) {
    const response = await fetchCatalogSourceWithTauriRetry(
      currentUrl,
      { ...init, redirect: 'manual' },
      signal,
    );
    if (!isRedirectStatus(response.status)) {
      const finalUrl = response.url
        ? validateDeviceFetchSourceUrl(intent, response.url)
        : currentUrl;
      return { response, finalUrl };
    }
    if (redirectCount === CATALOG_SOURCE_FETCH_REDIRECT_LIMIT) {
      throw new CatalogDeviceFetchError('Catalog source redirected too many times.');
    }

    const location = response.headers.get('location');
    if (!location) {
      throw new CatalogDeviceFetchError('Catalog source redirect did not include a location.');
    }

    let nextUrl: URL;
    try {
      nextUrl = new URL(location, currentUrl);
    } catch {
      throw new CatalogDeviceFetchError('Catalog source redirect URL is invalid.');
    }
    validateDeviceFetchSourceUrl(intent, nextUrl.toString());
    currentUrl = nextUrl;
  }

  throw new CatalogDeviceFetchError('Catalog source redirected too many times.');
}

async function fetchCatalogSourceWithBrowser(sourceUrl: URL, init: RequestInit): Promise<Response> {
  try {
    const response = await window.fetch(sourceUrl.toString(), init);
    if (!response.ok) {
      throw new CatalogDeviceFetchError(`Catalog source download failed (${response.status}).`);
    }
    return response;
  } catch (error) {
    if (isAbortError(error) || error instanceof CatalogDeviceFetchError) throw error;
    throw new CatalogBrowserSourceDownloadRequiredError(sourceUrl);
  }
}

async function fetchCatalogSourceFile(
  intent: CatalogUserDeviceFetchImportIntentResponse,
  sourceUrl: URL,
  appPlatform: AppService['appPlatform'],
  signal?: AbortSignal,
): Promise<File> {
  const init: RequestInit = {
    method: 'GET',
    headers: {
      Accept: intent.format === 'epub' ? 'application/epub+zip,*/*' : 'application/pdf,*/*',
    },
    signal,
  };
  let response: Response;
  let responseUrl: string;
  if (appPlatform === 'tauri') {
    const fetched = await fetchCatalogSourceWithTauri(intent, sourceUrl, init, signal);
    response = fetched.response;
    responseUrl = fetched.finalUrl.toString();
  } else {
    response = await fetchCatalogSourceWithBrowser(sourceUrl, { ...init, redirect: 'error' });
    responseUrl = response.url || sourceUrl.toString();
  }

  validateDeviceFetchSourceUrl(intent, responseUrl);
  validateContentType(response.headers.get('content-type'), intent.format);
  validateDeclaredSize(response, intent.format);

  const bytes = await readCatalogResponseBytes(response, intent.format);
  validateBookBytes(bytes, intent.format);

  return new File([bytes], `openread-catalog-${intent.catalogBookId}.${intent.format}`, {
    type: FORMAT_MIME_TYPES[intent.format],
    lastModified: Date.now(),
  });
}

export function openCatalogBrowserSourceDownload(
  error: CatalogBrowserSourceDownloadRequiredError,
): void {
  const link = document.createElement('a');
  link.href = error.sourceUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.referrerPolicy = 'no-referrer';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function importDeviceFetchedCatalogBook({
  requestedCatalogBookId,
  intent,
  appService,
  library,
  signal,
}: CatalogDeviceFetchParams): Promise<Book> {
  if (appService.appPlatform !== 'tauri' && appService.appPlatform !== 'web') {
    throw new CatalogDeviceFetchError('Device fetch is not supported on this platform.');
  }

  const sourceUrl = validateDeviceFetchIntent(requestedCatalogBookId, intent);
  const file = await fetchCatalogSourceFile(intent, sourceUrl, appService.appPlatform, signal);
  const importContext = {
    ...createImportBookContext(library),
    catalogBookId: intent.catalogBookId,
    sourceUrl: intent.sourceUrl,
    suppressAutoUpload: true,
  };
  const importedBook = await appService.importBook(file, library, true, true, false, importContext);

  if (!importedBook) throw new CatalogDeviceFetchError('Catalog book import did not complete.');

  importedBook.catalogBookId = intent.catalogBookId;
  importedBook.storagePath = null;
  importedBook.url = intent.sourceUrl;
  importedBook.updatedAt = Date.now();

  return importedBook;
}
