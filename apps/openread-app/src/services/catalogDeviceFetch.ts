import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { createImportBookContext } from '@/services/appService';
import type { AppService } from '@/types/system';
import type { Book } from '@/types/book';
import type { CatalogUserDeviceFetchImportIntentResponse } from '@openread/types';

const CATALOG_DEVICE_FETCH_LIMITS = {
  epub: 100 * 1024 * 1024,
  pdf: 200 * 1024 * 1024,
} as const;

const CATALOG_DEVICE_FETCH_MIME_TYPES = {
  epub: 'application/epub+zip',
  pdf: 'application/pdf',
} as const;

const CATALOG_DEVICE_FETCH_ACCEPT = {
  epub: 'application/epub+zip,*/*',
  pdf: 'application/pdf,*/*',
} as const;

const CATALOG_DEVICE_FETCH_RETRY_DELAYS_MS = [250, 750] as const;

type CatalogSourceHostPolicy = { exact: readonly string[]; suffix?: readonly string[] };

const CATALOG_DEVICE_FETCH_SOURCE_HOSTS: Record<string, CatalogSourceHostPolicy> = {
  'internet-archive': {
    exact: ['archive.org', 'www.archive.org'],
    suffix: ['.archive.org'],
  },
  'standard-ebooks': { exact: ['standardebooks.org', 'www.standardebooks.org'] },
  gutenberg: { exact: ['gutenberg.org', 'www.gutenberg.org'] },
  greenteapress: { exact: ['greenteapress.com', 'www.greenteapress.com'] },
};

export class CatalogDeviceFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogDeviceFetchError';
  }
}

type CatalogDeviceFetchParams = {
  requestedCatalogBookId: string;
  intent: CatalogUserDeviceFetchImportIntentResponse;
  appService: AppService;
  library: Book[];
  signal?: AbortSignal;
};

function isAllowedHost(hostname: string, policy: CatalogSourceHostPolicy): boolean {
  const normalizedHostname = hostname.toLowerCase();
  if (policy.exact.includes(normalizedHostname)) return true;
  return (policy.suffix ?? []).some((suffix) => normalizedHostname.endsWith(suffix));
}

function isInternetArchiveSourcePath(url: URL, sourceId: string): boolean {
  const [, firstSegment, secondSegment, thirdSegment] = url.pathname
    .split('/')
    .map((segment) => decodeURIComponent(segment));

  if (firstSegment === 'download' && secondSegment === sourceId) return true;
  if (/^\d+$/.test(firstSegment || '') && secondSegment === 'items' && thirdSegment === sourceId) {
    return true;
  }

  return false;
}

function validateDeviceFetchSourceUrl(
  intent: CatalogUserDeviceFetchImportIntentResponse,
  sourceUrl: string,
): URL {
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    throw new CatalogDeviceFetchError('Catalog source URL is invalid.');
  }

  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new CatalogDeviceFetchError('Catalog source URL is not allowed.');
  }

  const policy = CATALOG_DEVICE_FETCH_SOURCE_HOSTS[intent.policy.source];
  if (!policy || !isAllowedHost(url.hostname, policy)) {
    throw new CatalogDeviceFetchError('Catalog source URL does not match its source policy.');
  }

  const sourceId = intent.policy.sourceId;
  if (intent.policy.source === 'internet-archive' && !isInternetArchiveSourcePath(url, sourceId)) {
    throw new CatalogDeviceFetchError('Internet Archive source URL does not match catalog source.');
  }

  if (intent.policy.source === 'standard-ebooks') {
    const expectedPrefix = `/ebooks/${sourceId}/downloads/`;
    if (!decodeURIComponent(url.pathname).startsWith(expectedPrefix)) {
      throw new CatalogDeviceFetchError(
        'Standard Ebooks source URL does not match catalog source.',
      );
    }
  }

  return url;
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
  if (!intent.policy.cacheRedistributionAllowed || !intent.policy.deviceFetchAllowed) {
    throw new CatalogDeviceFetchError('Catalog source policy does not allow device fetch.');
  }
  if (!intent.policy.allowedFormats.includes(intent.format)) {
    throw new CatalogDeviceFetchError('Catalog source policy does not allow this format.');
  }

  return validateDeviceFetchSourceUrl(intent, intent.sourceUrl);
}

function validateContentType(contentType: string | null, format: 'epub' | 'pdf'): void {
  const normalized = (contentType || '').toLowerCase();
  if (!normalized || normalized.includes('octet-stream') || normalized.includes('binary')) return;

  if (format === 'epub' && (normalized.includes('epub') || normalized.includes('zip'))) return;
  if (format === 'pdf' && normalized.includes('pdf')) return;

  if (
    normalized.includes('html') ||
    normalized.includes('xml') ||
    normalized.includes('json') ||
    normalized.includes('text/')
  ) {
    throw new CatalogDeviceFetchError('Catalog source did not return an ebook file.');
  }
}

function validateBookBytes(bytes: Uint8Array, format: 'epub' | 'pdf'): void {
  if (bytes.byteLength === 0)
    throw new CatalogDeviceFetchError('Catalog source returned an empty file.');

  if (format === 'pdf') {
    const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
    if (!isPdf) throw new CatalogDeviceFetchError('Catalog source returned invalid PDF bytes.');
    return;
  }

  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!isZip) throw new CatalogDeviceFetchError('Catalog source returned invalid EPUB bytes.');
}

function isTransientSourceStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
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

async function fetchCatalogSourceResponseWithRetry(
  sourceUrl: URL,
  init: Parameters<typeof tauriFetch>[1],
  signal?: AbortSignal,
): Promise<Response> {
  const maxAttempts = CATALOG_DEVICE_FETCH_RETRY_DELAYS_MS.length + 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    throwIfAborted(signal);

    try {
      const response = await tauriFetch(sourceUrl.toString(), init);
      if (response.ok) return response;

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

async function fetchCatalogSourceFile(
  intent: CatalogUserDeviceFetchImportIntentResponse,
  sourceUrl: URL,
  signal?: AbortSignal,
): Promise<File> {
  const response = await fetchCatalogSourceResponseWithRetry(
    sourceUrl,
    {
      method: 'GET',
      headers: { Accept: CATALOG_DEVICE_FETCH_ACCEPT[intent.format] },
      signal,
    },
    signal,
  );

  const responseUrl = response.url || sourceUrl.toString();
  validateDeviceFetchSourceUrl(intent, responseUrl);
  validateContentType(response.headers.get('content-type'), intent.format);

  const buffer = await response.arrayBuffer();
  const maxBytes = CATALOG_DEVICE_FETCH_LIMITS[intent.format];
  if (buffer.byteLength > maxBytes) {
    throw new CatalogDeviceFetchError('Catalog source file is larger than this app supports.');
  }

  validateBookBytes(new Uint8Array(buffer), intent.format);

  return new File([buffer], `openread-catalog-${intent.catalogBookId}.${intent.format}`, {
    type: CATALOG_DEVICE_FETCH_MIME_TYPES[intent.format],
    lastModified: Date.now(),
  });
}

export async function importDeviceFetchedCatalogBook({
  requestedCatalogBookId,
  intent,
  appService,
  library,
  signal,
}: CatalogDeviceFetchParams): Promise<Book> {
  if (!appService.isDesktopApp || appService.appPlatform !== 'tauri') {
    throw new CatalogDeviceFetchError('Device fetch is available in the desktop app.');
  }

  const sourceUrl = validateDeviceFetchIntent(requestedCatalogBookId, intent);
  const file = await fetchCatalogSourceFile(intent, sourceUrl, signal);
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
