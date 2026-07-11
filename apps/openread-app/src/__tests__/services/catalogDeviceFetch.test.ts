import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import {
  CatalogBrowserSourceDownloadRequiredError,
  importDeviceFetchedCatalogBook,
  openCatalogBrowserSourceDownload,
} from '@/services/catalogDeviceFetch';
import type { AppService } from '@/types/system';
import type { Book } from '@/types/book';
import type { CatalogUserDeviceFetchImportIntentResponse } from '@openread/types';
import { CATALOG_SOURCE_FETCH_REDIRECT_LIMIT } from '@openread/types/catalog-source-verification';

vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn() }));

const mockTauriFetch = vi.mocked(tauriFetch);
const browserFetch = vi.fn<typeof fetch>();

function epubBytes(): number[] {
  return Array.from(
    new TextEncoder().encode(
      'PK\u0003\u0004mimetypeapplication/epub+zipPK\u0003\u0004META-INF/container.xml',
    ),
  );
}

function intent(
  overrides: Partial<CatalogUserDeviceFetchImportIntentResponse> = {},
): CatalogUserDeviceFetchImportIntentResponse {
  return {
    mode: 'user_device_fetch',
    catalogBookId: 'catalog-device-1',
    format: 'epub',
    sourceUrl: 'https://archive.org/download/source-id/book.epub',
    policy: {
      source: 'internet-archive',
      sourceId: 'source-id',
      provenanceLabel: 'Internet Archive',
      licenseType: 'public-domain',
      cacheRedistributionAllowed: true,
      deviceFetchAllowed: true,
      allowedFormats: ['epub', 'pdf'],
    },
    ...overrides,
  };
}

function response(
  bytes: number[],
  contentType = 'application/epub+zip',
  url?: string,
  headers?: Record<string, string>,
): Response {
  const res = new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { 'content-type': contentType, ...headers },
  });
  if (url) Object.defineProperty(res, 'url', { value: url });
  return res;
}

function appService(
  appPlatform: 'tauri' | 'web' = 'tauri',
  importBook = vi.fn(),
  isDesktopApp = true,
): AppService {
  return { appPlatform, isDesktopApp, importBook } as unknown as AppService;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', browserFetch);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('importDeviceFetchedCatalogBook', () => {
  it.each([
    ['desktop', true],
    ['native iOS/Android', false],
  ])('uses Tauri plugin HTTP and universal catalog import on %s', async (_label, isDesktop) => {
    const library: Book[] = [];
    const imported = { hash: 'local-device-hash', title: 'Device Fetched' } as Book;
    const importBook = vi.fn(
      async (file: File, books: Book[], _saveBook, _saveCover, _overwrite, context) => {
        expect(file.name).toBe('openread-catalog-catalog-device-1.epub');
        expect(file.type).toBe('application/epub+zip');
        expect(books).toBe(library);
        expect(context).toMatchObject({
          catalogBookId: 'catalog-device-1',
          sourceUrl: 'https://archive.org/download/source-id/book.epub',
          suppressAutoUpload: true,
        });
        books.push(imported);
        return imported;
      },
    );
    mockTauriFetch.mockResolvedValueOnce(response(epubBytes()));

    const result = await importDeviceFetchedCatalogBook({
      requestedCatalogBookId: 'catalog-device-1',
      intent: intent(),
      appService: appService('tauri', importBook, isDesktop),
      library,
    });

    expect(mockTauriFetch).toHaveBeenCalledWith(
      'https://archive.org/download/source-id/book.epub',
      expect.objectContaining({
        method: 'GET',
        headers: { Accept: 'application/epub+zip,*/*' },
        redirect: 'manual',
      }),
    );
    expect(browserFetch).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      hash: 'local-device-hash',
      catalogBookId: 'catalog-device-1',
      storagePath: null,
      url: 'https://archive.org/download/source-id/book.epub',
    });
  });

  it('imports a browser CORS response through the same catalog context', async () => {
    const imported = { hash: 'web-source-hash', title: 'Web Source' } as Book;
    const importBook = vi.fn(async () => imported);
    browserFetch.mockResolvedValueOnce(response(epubBytes()));

    await expect(
      importDeviceFetchedCatalogBook({
        requestedCatalogBookId: 'catalog-device-1',
        intent: intent(),
        appService: appService('web', importBook, false),
        library: [],
      }),
    ).resolves.toMatchObject({ hash: 'web-source-hash', catalogBookId: 'catalog-device-1' });

    expect(browserFetch).toHaveBeenCalledWith(
      'https://archive.org/download/source-id/book.epub',
      expect.objectContaining({ redirect: 'error' }),
    );
    expect(mockTauriFetch).not.toHaveBeenCalled();
    expect(importBook).toHaveBeenCalledTimes(1);
  });

  it('returns a safe manual source-download requirement when browser CORS/network blocks fetch', async () => {
    browserFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const error = await importDeviceFetchedCatalogBook({
      requestedCatalogBookId: 'catalog-device-1',
      intent: intent(),
      appService: appService('web'),
      library: [],
    }).catch((value) => value);

    expect(error).toBeInstanceOf(CatalogBrowserSourceDownloadRequiredError);
    expect(error.message).toContain('import the saved file from Library');
    expect(error.sourceUrl).toBe('https://archive.org/download/source-id/book.epub');
    expect(browserFetch).toHaveBeenCalledWith(
      'https://archive.org/download/source-id/book.epub',
      expect.objectContaining({ redirect: 'error' }),
    );

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    openCatalogBrowserSourceDownload(error);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    clickSpy.mockRestore();
  });

  it('allows OAPEN source retrieval while shared-cache redistribution remains disabled', async () => {
    const imported = { hash: 'oapen-hash', title: 'OAPEN Book' } as Book;
    const importBook = vi.fn(async () => imported);
    mockTauriFetch.mockResolvedValueOnce(
      response(Array.from(new TextEncoder().encode('%PDF-1.7')), 'application/pdf'),
    );
    const oapenIntent = intent({
      format: 'pdf',
      sourceUrl: 'https://library.oapen.org/bitstream/20.500.12657/105805/1/book.pdf',
      policy: {
        source: 'oapen',
        sourceId: 'oapen-doi-10.1234_book',
        provenanceLabel: 'OAPEN',
        licenseType: 'cc-by-4.0',
        cacheRedistributionAllowed: false,
        deviceFetchAllowed: true,
        allowedFormats: ['pdf'],
      },
    });

    await expect(
      importDeviceFetchedCatalogBook({
        requestedCatalogBookId: 'catalog-device-1',
        intent: oapenIntent,
        appService: appService('tauri', importBook),
        library: [],
      }),
    ).resolves.toMatchObject({ hash: 'oapen-hash' });
  });

  it('validates each Tauri redirect before issuing the next request', async () => {
    const imported = { hash: 'redirected-source-hash', title: 'Redirected' } as Book;
    mockTauriFetch
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: {
            location: 'https://dn790001.ca.archive.org/0/items/source-id/book.epub',
          },
        }),
      )
      .mockResolvedValueOnce(response(epubBytes()));

    await expect(
      importDeviceFetchedCatalogBook({
        requestedCatalogBookId: 'catalog-device-1',
        intent: intent(),
        appService: appService(
          'tauri',
          vi.fn(async () => imported),
        ),
        library: [],
      }),
    ).resolves.toMatchObject({ hash: 'redirected-source-hash' });

    expect(mockTauriFetch).toHaveBeenNthCalledWith(
      2,
      'https://dn790001.ca.archive.org/0/items/source-id/book.epub',
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it('rejects redirects beyond the canonical shared limit without requesting the next target', async () => {
    const redirectTargets = Array.from(
      { length: CATALOG_SOURCE_FETCH_REDIRECT_LIMIT + 1 },
      (_, index) => `https://redirect-${index + 1}.archive.org/download/source-id/book.epub`,
    );
    for (const location of redirectTargets) {
      mockTauriFetch.mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location } }),
      );
    }

    await expect(
      importDeviceFetchedCatalogBook({
        requestedCatalogBookId: 'catalog-device-1',
        intent: intent(),
        appService: appService(),
        library: [],
      }),
    ).rejects.toThrow('redirected too many times');

    expect(mockTauriFetch).toHaveBeenCalledTimes(CATALOG_SOURCE_FETCH_REDIRECT_LIMIT + 1);
    expect(mockTauriFetch).not.toHaveBeenCalledWith(
      redirectTargets[CATALOG_SOURCE_FETCH_REDIRECT_LIMIT],
      expect.anything(),
    );
    for (const [, init] of mockTauriFetch.mock.calls) {
      expect(init).toEqual(expect.objectContaining({ redirect: 'manual' }));
    }
  });

  it('retries transient Tauri source failures before importing', async () => {
    vi.useFakeTimers();
    const imported = { hash: 'local-device-hash-retry', title: 'Retried' } as Book;
    mockTauriFetch
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockRejectedValueOnce(new TypeError('temporary network failure'))
      .mockResolvedValueOnce(response(epubBytes()));

    const promise = importDeviceFetchedCatalogBook({
      requestedCatalogBookId: 'catalog-device-1',
      intent: intent(),
      appService: appService(
        'tauri',
        vi.fn(async () => imported),
      ),
      library: [],
    });

    await vi.advanceTimersByTimeAsync(250);
    await vi.advanceTimersByTimeAsync(750);
    await expect(promise).resolves.toMatchObject({ hash: 'local-device-hash-retry' });
    expect(mockTauriFetch).toHaveBeenCalledTimes(3);
  });

  it('fails closed for invalid host/path/source identity before fetching', async () => {
    const invalidOapen = intent({
      format: 'pdf',
      sourceUrl: 'https://library.oapen.org/items/105805',
      policy: {
        source: 'oapen',
        sourceId: 'wrong-source-id',
        provenanceLabel: 'OAPEN',
        licenseType: 'cc-by-4.0',
        cacheRedistributionAllowed: false,
        deviceFetchAllowed: true,
        allowedFormats: ['pdf'],
      },
    });

    await expect(
      importDeviceFetchedCatalogBook({
        requestedCatalogBookId: 'catalog-device-1',
        intent: invalidOapen,
        appService: appService(),
        library: [],
      }),
    ).rejects.toThrow('Catalog source URL does not match its source policy.');
    expect(mockTauriFetch).not.toHaveBeenCalled();
    expect(browserFetch).not.toHaveBeenCalled();
  });

  it('rejects invalid bytes, unsafe redirects, and oversized declared responses', async () => {
    mockTauriFetch.mockResolvedValueOnce(response([0x3c, 0x68, 0x74, 0x6d, 0x6c]));
    await expect(
      importDeviceFetchedCatalogBook({
        requestedCatalogBookId: 'catalog-device-1',
        intent: intent(),
        appService: appService(),
        library: [],
      }),
    ).rejects.toThrow('invalid EPUB bytes');

    mockTauriFetch.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: 'https://example.com/book.epub' },
      }),
    );
    await expect(
      importDeviceFetchedCatalogBook({
        requestedCatalogBookId: 'catalog-device-1',
        intent: intent(),
        appService: appService(),
        library: [],
      }),
    ).rejects.toThrow('source policy');
    expect(mockTauriFetch).toHaveBeenCalledTimes(2);

    mockTauriFetch.mockResolvedValueOnce(
      response(epubBytes(), 'application/epub+zip', 'https://example.com/book.epub'),
    );
    await expect(
      importDeviceFetchedCatalogBook({
        requestedCatalogBookId: 'catalog-device-1',
        intent: intent(),
        appService: appService(),
        library: [],
      }),
    ).rejects.toThrow('source policy');

    mockTauriFetch.mockResolvedValueOnce(
      response(epubBytes(), 'application/epub+zip', undefined, {
        'content-length': String(100 * 1024 * 1024 + 1),
      }),
    );
    await expect(
      importDeviceFetchedCatalogBook({
        requestedCatalogBookId: 'catalog-device-1',
        intent: intent(),
        appService: appService(),
        library: [],
      }),
    ).rejects.toThrow('larger than this app supports');
  });

  it('rejects an intent for a different catalog book without fetching', async () => {
    await expect(
      importDeviceFetchedCatalogBook({
        requestedCatalogBookId: 'catalog-device-1',
        intent: intent({ catalogBookId: 'catalog-device-2' }),
        appService: appService(),
        library: [],
      }),
    ).rejects.toThrow('did not match the requested book');
    expect(mockTauriFetch).not.toHaveBeenCalled();
  });
});
