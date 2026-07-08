import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { importDeviceFetchedCatalogBook } from '@/services/catalogDeviceFetch';
import type { AppService } from '@/types/system';
import type { Book } from '@/types/book';
import type { CatalogUserDeviceFetchImportIntentResponse } from '@openread/types';

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: vi.fn(),
}));

const mockTauriFetch = vi.mocked(tauriFetch);

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

function response(bytes: number[], contentType = 'application/epub+zip', url?: string): Response {
  const res = new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { 'content-type': contentType },
  });
  if (url) {
    Object.defineProperty(res, 'url', { value: url });
  }
  return res;
}

function appService(importBook = vi.fn()): AppService {
  return {
    appPlatform: 'tauri',
    isDesktopApp: true,
    importBook,
  } as unknown as AppService;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('importDeviceFetchedCatalogBook', () => {
  it('downloads with the source-policy URL and imports with catalogBookId preserved', async () => {
    const library: Book[] = [];
    const imported = {
      hash: 'local-device-hash',
      title: 'Device Fetched',
    } as Book;
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
    mockTauriFetch.mockResolvedValueOnce(response([0x50, 0x4b, 0x03, 0x04]));

    const result = await importDeviceFetchedCatalogBook({
      requestedCatalogBookId: 'catalog-device-1',
      intent: intent(),
      appService: appService(importBook),
      library,
    });

    expect(mockTauriFetch).toHaveBeenCalledWith(
      'https://archive.org/download/source-id/book.epub',
      expect.objectContaining({
        method: 'GET',
        headers: { Accept: 'application/epub+zip,*/*' },
      }),
    );
    expect(result).toMatchObject({
      hash: 'local-device-hash',
      catalogBookId: 'catalog-device-1',
      storagePath: null,
      url: 'https://archive.org/download/source-id/book.epub',
    });
  });

  it('retries transient source failures before importing', async () => {
    vi.useFakeTimers();
    const library: Book[] = [];
    const imported = { hash: 'local-device-hash-retry', title: 'Retried' } as Book;
    const importBook = vi.fn(async () => imported);
    mockTauriFetch
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockRejectedValueOnce(new TypeError('temporary network failure'))
      .mockResolvedValueOnce(response([0x50, 0x4b, 0x03, 0x04]));

    const promise = importDeviceFetchedCatalogBook({
      requestedCatalogBookId: 'catalog-device-1',
      intent: intent(),
      appService: appService(importBook),
      library,
    });

    await vi.advanceTimersByTimeAsync(250);
    await vi.advanceTimersByTimeAsync(750);

    await expect(promise).resolves.toMatchObject({ hash: 'local-device-hash-retry' });
    expect(mockTauriFetch).toHaveBeenCalledTimes(3);
    expect(importBook).toHaveBeenCalledTimes(1);
  });

  it('fails after bounded retries for transient source failures', async () => {
    vi.useFakeTimers();
    const importBook = vi.fn();
    mockTauriFetch
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));

    const promise = importDeviceFetchedCatalogBook({
      requestedCatalogBookId: 'catalog-device-1',
      intent: intent(),
      appService: appService(importBook),
      library: [],
    });
    const rejection = expect(promise).rejects.toThrow(
      'Catalog source download failed after retries (503).',
    );

    await vi.advanceTimersByTimeAsync(250);
    await vi.advanceTimersByTimeAsync(750);

    await rejection;
    expect(mockTauriFetch).toHaveBeenCalledTimes(3);
    expect(importBook).not.toHaveBeenCalled();
  });

  it('aborts during retry backoff without another fetch or local import', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const importBook = vi.fn();
    mockTauriFetch.mockResolvedValueOnce(new Response(null, { status: 503 }));

    const promise = importDeviceFetchedCatalogBook({
      requestedCatalogBookId: 'catalog-device-1',
      intent: intent(),
      appService: appService(importBook),
      library: [],
      signal: controller.signal,
    });
    const rejection = expect(promise).rejects.toMatchObject({ name: 'AbortError' });

    await Promise.resolve();
    await Promise.resolve();
    controller.abort();

    await rejection;
    expect(mockTauriFetch).toHaveBeenCalledTimes(1);
    expect(importBook).not.toHaveBeenCalled();
  });

  it('rejects cancel/abort without importing', async () => {
    const abortError = Object.assign(new Error('Aborted'), { name: 'AbortError' });
    const importBook = vi.fn();
    mockTauriFetch.mockRejectedValueOnce(abortError);

    await expect(
      importDeviceFetchedCatalogBook({
        requestedCatalogBookId: 'catalog-device-1',
        intent: intent(),
        appService: appService(importBook),
        library: [],
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(importBook).not.toHaveBeenCalled();
  });

  it('rejects invalid EPUB bytes before local import', async () => {
    const importBook = vi.fn();
    mockTauriFetch.mockResolvedValueOnce(response([0x3c, 0x68, 0x74, 0x6d, 0x6c]));

    await expect(
      importDeviceFetchedCatalogBook({
        requestedCatalogBookId: 'catalog-device-1',
        intent: intent(),
        appService: appService(importBook),
        library: [],
      }),
    ).rejects.toThrow('Catalog source returned invalid EPUB bytes.');

    expect(importBook).not.toHaveBeenCalled();
  });

  it('rejects a redirected source URL that no longer matches the source policy', async () => {
    const importBook = vi.fn();
    mockTauriFetch.mockResolvedValueOnce(
      response([0x50, 0x4b, 0x03, 0x04], 'application/epub+zip', 'https://example.com/book.epub'),
    );

    await expect(
      importDeviceFetchedCatalogBook({
        requestedCatalogBookId: 'catalog-device-1',
        intent: intent(),
        appService: appService(importBook),
        library: [],
      }),
    ).rejects.toThrow('Catalog source URL does not match its source policy.');

    expect(importBook).not.toHaveBeenCalled();
  });

  it('rejects an Internet Archive source URL whose item path does not match sourceId', async () => {
    await expect(
      importDeviceFetchedCatalogBook({
        requestedCatalogBookId: 'catalog-device-1',
        intent: intent({ sourceUrl: 'https://archive.org/download/other-source/book.epub' }),
        appService: appService(),
        library: [],
      }),
    ).rejects.toThrow('Internet Archive source URL does not match catalog source.');

    expect(mockTauriFetch).not.toHaveBeenCalled();
  });

  it('rejects an intent for a different catalog book', async () => {
    await expect(
      importDeviceFetchedCatalogBook({
        requestedCatalogBookId: 'catalog-device-1',
        intent: intent({ catalogBookId: 'catalog-device-2' }),
        appService: appService(),
        library: [],
      }),
    ).rejects.toThrow('Catalog import intent did not match the requested book.');

    expect(mockTauriFetch).not.toHaveBeenCalled();
  });

  it('rejects non-desktop platforms without fetching the source', async () => {
    await expect(
      importDeviceFetchedCatalogBook({
        requestedCatalogBookId: 'catalog-device-1',
        intent: intent(),
        appService: { ...appService(), isDesktopApp: false } as AppService,
        library: [],
      }),
    ).rejects.toThrow('Device fetch is available in the desktop app.');

    expect(mockTauriFetch).not.toHaveBeenCalled();
  });
});
