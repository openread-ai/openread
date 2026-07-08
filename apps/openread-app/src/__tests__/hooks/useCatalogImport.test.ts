import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useCatalogImport } from '@/hooks/useCatalogImport';

// ── Hoisted mocks ──────────────────────────────────────

const {
  catalogJson,
  fetchMock,
  mockAuthState,
  mockDispatch,
  mockAppService,
  mockImportDeviceFetchedCatalogBook,
  mockEnqueueBooksForSync,
  mockLibraryState,
} = vi.hoisted(() => {
  const mockAuthState = {
    token: 'test-token-123' as string | null,
    user: { id: 'user-1' } as { id: string } | null,
    logout: vi.fn(),
    refresh: vi.fn(),
  };
  const mockDispatch = vi.fn();
  const fetchMock = vi.fn();
  const mockAppService = {
    appPlatform: 'tauri',
    isDesktopApp: true,
    saveLibraryBooks: vi.fn(() => Promise.resolve()),
  };
  const mockLibraryState = {
    library: [] as Array<Record<string, unknown>>,
    setLibrary: vi.fn((books: Array<Record<string, unknown>>) => {
      mockLibraryState.library = books;
    }),
  };
  const mockImportDeviceFetchedCatalogBook = vi.fn<(arg: unknown) => unknown>();
  const mockEnqueueBooksForSync = vi.fn<(arg: unknown) => Promise<void>>(() => Promise.resolve());
  const catalogJson = async (url: string, options?: Record<string, unknown>) => {
    const response = await fetchMock(url, options);
    if (!response.ok) {
      const errorData = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(errorData?.message || `Import failed (${response.status})`);
    }
    return response.json();
  };
  return {
    catalogJson,
    fetchMock,
    mockAuthState,
    mockDispatch,
    mockAppService,
    mockImportDeviceFetchedCatalogBook,
    mockEnqueueBooksForSync,
    mockLibraryState,
  };
});

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: mockAppService }),
}));

vi.mock('@/services/catalogDeviceFetch', () => ({
  importDeviceFetchedCatalogBook: (arg: unknown) => mockImportDeviceFetchedCatalogBook(arg),
}));

vi.mock('@/services/sync/helpers', () => ({
  enqueueBooksForSync: (arg: unknown) => mockEnqueueBooksForSync(arg),
}));

vi.mock('@/store/libraryStore', () => ({
  useLibraryStore: {
    getState: () => mockLibraryState,
  },
}));

vi.mock('@/utils/event', () => ({
  eventDispatcher: {
    dispatch: (...args: unknown[]) => mockDispatch(...args),
  },
}));

vi.mock('@/services/sync/syncWorker', () => ({
  syncWorker: {
    pullNow: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock('@/services/platform/client', () => ({
  platform: {
    catalog: {
      getImportStatus: (catalogBookId: string, init?: Record<string, unknown>) =>
        catalogJson(`/catalog/books/${catalogBookId}/status`, init),
      importBook: (catalogBookId: string, init?: Record<string, unknown>) =>
        catalogJson(`/api/catalog/books/${catalogBookId}/import`, {
          ...init,
          method: 'POST',
          headers: { Authorization: `Bearer ${mockAuthState.token}` },
        }),
      getImportIntent: (catalogBookId: string, init?: Record<string, unknown>) =>
        catalogJson(`/api/catalog/books/${catalogBookId}/import-intent`, {
          ...init,
          method: 'POST',
          headers: { Authorization: `Bearer ${mockAuthState.token}` },
        }),
      importInternetArchiveBook: (iaIdentifier: string, init?: Record<string, unknown>) =>
        catalogJson('/api/catalog/ia/import', {
          ...init,
          method: 'POST',
          headers: {
            Authorization: `Bearer ${mockAuthState.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ia_identifier: iaIdentifier }),
        }),
    },
  },
}));

// Mock useLibraryLimit (library limit logic is tested separately)
const { mockLibraryLimitState } = vi.hoisted(() => {
  const mockLibraryLimitState = {
    canAddBook: true,
    libraryLimit: null as number | null,
    currentCount: 0,
    plan: 'free' as const,
    upgradeTierName: 'Reader',
    upgradePriceCents: 799,
    isLoading: false,
  };
  return { mockLibraryLimitState };
});

vi.mock('@/hooks/useLibraryLimit', () => ({
  useLibraryLimit: () => mockLibraryLimitState,
}));

// ── Test helpers ───────────────────────────────────────

function mockImportResponse(status: 'ready' | 'preparing', extra?: Record<string, unknown>) {
  return {
    ok: true,
    json: async () => ({ status, ...extra }),
  };
}

function mockCachedIntent(extra?: Record<string, unknown>) {
  return {
    ok: true,
    json: async () => ({
      mode: 'cached',
      catalogBookId: 'catalog-1',
      format: 'epub',
      downloadUrl: 'https://example.com/book.epub',
      expiresAt: Date.now() + 60_000,
      sizeBytes: 123,
      policy: {
        source: 'internet-archive',
        sourceId: 'item-1',
        provenanceLabel: 'Internet Archive',
        licenseType: 'public-domain',
        cacheRedistributionAllowed: true,
        deviceFetchAllowed: true,
        allowedFormats: ['epub', 'pdf'],
      },
      ...extra,
    }),
  };
}

function mockUserDeviceFetchIntent(extra?: Record<string, unknown>) {
  return {
    ok: true,
    json: async () => ({
      mode: 'user_device_fetch',
      catalogBookId: 'device-fetch-1',
      format: 'epub',
      sourceUrl: 'https://archive.org/download/item-1/book.epub',
      policy: {
        source: 'internet-archive',
        sourceId: 'item-1',
        provenanceLabel: 'Internet Archive',
        licenseType: 'public-domain',
        cacheRedistributionAllowed: true,
        deviceFetchAllowed: true,
        allowedFormats: ['epub', 'pdf'],
      },
      ...extra,
    }),
  };
}

function mockStatusResponse(cachingStatus: string) {
  return {
    ok: true,
    json: async () => ({ caching_status: cachingStatus }),
  };
}

function mockErrorResponse(status: number, body?: Record<string, unknown>) {
  return {
    ok: false,
    status,
    json: async () => body ?? { code: 'ERROR', message: `Error ${status}` },
  };
}

// ── Tests ──────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mockAuthState.token = 'test-token-123';
  mockAuthState.user = { id: 'user-1' } as never;
  mockLibraryState.library = [];
  mockLibraryState.setLibrary.mockClear();
  mockAppService.saveLibraryBooks.mockClear();
  mockImportDeviceFetchedCatalogBook.mockReset();
  mockEnqueueBooksForSync.mockClear();
  // Reset library limit to allow imports by default
  mockLibraryLimitState.canAddBook = true;
  mockLibraryLimitState.libraryLimit = null;
  mockLibraryLimitState.currentCount = 0;
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('useCatalogImport', () => {
  describe('initial state', () => {
    it('should return idle state for unknown book IDs', () => {
      const { result } = renderHook(() => useCatalogImport());
      expect(result.current.getImportState('unknown-id')).toEqual({ status: 'idle' });
    });

    it('should return empty importStates initially', () => {
      const { result } = renderHook(() => useCatalogImport());
      expect(result.current.importStates).toEqual({});
    });
  });

  describe('auth check', () => {
    it('should show warning toast when user is not authenticated', async () => {
      mockAuthState.token = null;
      mockAuthState.user = null as never;

      const { result } = renderHook(() => useCatalogImport());

      await act(async () => {
        await result.current.importBook('book-1');
      });

      expect(mockDispatch).toHaveBeenCalledWith('toast', {
        message: 'Sign in to add books to your library',
        type: 'warning',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should not proceed when token is null', async () => {
      mockAuthState.token = null;

      const { result } = renderHook(() => useCatalogImport());

      await act(async () => {
        await result.current.importBook('book-1');
      });

      expect(result.current.getImportState('book-1')).toEqual({ status: 'idle' });
    });
  });

  describe('local book import (cached)', () => {
    it('should import a cached book and transition to ready state', async () => {
      fetchMock.mockResolvedValueOnce(
        mockCachedIntent({
          bookId: 'lib-book-1',
          bookHash: 'catalog:catalog-1',
          downloadUrl: 'https://example.com/book.epub',
        }),
      );

      const { result } = renderHook(() => useCatalogImport());

      await act(async () => {
        await result.current.importBook('catalog-1');
      });

      // Verify fetch was called with correct endpoint
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0]!;
      expect(url).toContain('/api/catalog/books/catalog-1/import-intent');
      expect(options.method).toBe('POST');
      expect(options.headers.Authorization).toBe('Bearer test-token-123');

      // Verify state
      const state = result.current.getImportState('catalog-1');
      expect(state.status).toBe('ready');
      expect(state.progress).toBe(100);
      expect(state.bookId).toBe('lib-book-1');
      expect(state.bookHash).toBe('catalog:catalog-1');
      expect(state.downloadUrl).toBe('https://example.com/book.epub');

      // Verify success toast
      expect(mockDispatch).toHaveBeenCalledWith('toast', {
        message: 'Book added to your library',
        type: 'success',
      });
    });

    it('should trigger library sync on successful import', async () => {
      const { syncWorker } = await import('@/services/sync/syncWorker');

      fetchMock.mockResolvedValueOnce(
        mockCachedIntent({
          catalogBookId: 'sync-1',
          bookId: 'lib-book-sync',
          bookHash: 'catalog:sync-1',
          downloadUrl: 'https://example.com/sync.epub',
        }),
      );

      const { result } = renderHook(() => useCatalogImport());

      await act(async () => {
        await result.current.importBook('sync-1');
      });

      expect(syncWorker.pullNow).toHaveBeenCalledWith('books');
    });
  });

  describe('IA book import', () => {
    it('should use /ia/import endpoint with ia_identifier', async () => {
      fetchMock.mockResolvedValueOnce(
        mockImportResponse('ready', {
          book_id: 'lib-book-ia',
          book_hash: 'catalog:ia-cat-id',
          download_url: 'https://example.com/ia.epub',
        }),
      );

      const { result } = renderHook(() => useCatalogImport());

      await act(async () => {
        await result.current.importBook('catalog-ia-1', 'thegreatgatsby');
      });

      const [url, options] = fetchMock.mock.calls[0]!;
      expect(url).toContain('/api/catalog/ia/import');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(options.body)).toEqual({ ia_identifier: 'thegreatgatsby' });

      const state = result.current.getImportState('catalog-ia-1');
      expect(state.status).toBe('ready');
      expect(state.bookId).toBe('lib-book-ia');
      expect(state.bookHash).toBe('catalog:ia-cat-id');
    });
  });

  describe('device-fetch and IA import flows', () => {
    it('should import a user_device_fetch intent through the desktop device engine', async () => {
      const importedBook = {
        hash: 'local-device-hash',
        title: 'Device Book',
        catalogBookId: 'device-fetch-1',
      };
      mockLibraryState.library = [importedBook];
      fetchMock.mockResolvedValueOnce(mockUserDeviceFetchIntent());
      mockImportDeviceFetchedCatalogBook.mockResolvedValueOnce(importedBook);

      const { result } = renderHook(() => useCatalogImport());

      await act(async () => {
        await result.current.importBook('device-fetch-1');
      });

      expect(mockImportDeviceFetchedCatalogBook).toHaveBeenCalledWith(
        expect.objectContaining({
          requestedCatalogBookId: 'device-fetch-1',
          appService: mockAppService,
          library: [importedBook],
        }),
      );
      expect(mockAppService.saveLibraryBooks).toHaveBeenCalledWith([importedBook]);
      expect(mockEnqueueBooksForSync).toHaveBeenCalledWith([importedBook]);

      const state = result.current.getImportState('device-fetch-1');
      expect(state.status).toBe('ready');
      expect(state.bookHash).toBe('local-device-hash');
    });

    it('should allow retry after a device-fetch import error', async () => {
      const importedBook = {
        hash: 'local-device-hash-retry',
        title: 'Device Book',
        catalogBookId: 'device-fetch-1',
      };
      mockLibraryState.library = [importedBook];
      fetchMock
        .mockResolvedValueOnce(mockUserDeviceFetchIntent())
        .mockResolvedValueOnce(mockUserDeviceFetchIntent());
      mockImportDeviceFetchedCatalogBook
        .mockRejectedValueOnce(new Error('Catalog source returned invalid EPUB bytes.'))
        .mockResolvedValueOnce(importedBook);

      const { result } = renderHook(() => useCatalogImport());

      await act(async () => {
        await result.current.importBook('device-fetch-1');
      });
      expect(result.current.getImportState('device-fetch-1')).toMatchObject({
        status: 'error',
        error: 'Catalog source returned invalid EPUB bytes.',
      });

      await act(async () => {
        await result.current.importBook('device-fetch-1');
      });

      expect(mockImportDeviceFetchedCatalogBook).toHaveBeenCalledTimes(2);
      expect(result.current.getImportState('device-fetch-1')).toMatchObject({
        status: 'ready',
        bookHash: 'local-device-hash-retry',
      });
    });

    it('should poll IA preparing imports with the real catalog UUID, not synthetic UI identity', async () => {
      fetchMock.mockResolvedValueOnce(
        mockImportResponse('preparing', {
          catalog_book_id: 'real-catalog-uuid',
        }),
      );
      fetchMock.mockResolvedValueOnce(mockStatusResponse('caching'));
      fetchMock.mockResolvedValueOnce(mockStatusResponse('cached'));
      fetchMock.mockResolvedValueOnce(
        mockImportResponse('ready', {
          catalog_book_id: 'real-catalog-uuid',
          book_id: 'lib-ia-polled',
          book_hash: 'catalog:real-catalog-uuid',
          download_url: 'https://example.com/ia-polled.epub',
        }),
      );

      const { result } = renderHook(() => useCatalogImport());

      let importPromise: Promise<void>;
      act(() => {
        importPromise = result.current.importBook(
          'internet-archive:thegreatgatsby',
          'thegreatgatsby',
        );
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2100);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2100);
      });
      await act(async () => {
        await importPromise!;
      });

      const urls = fetchMock.mock.calls.map(([url]) => url as string);
      expect(urls).toContain('/catalog/books/real-catalog-uuid/status');
      expect(urls).toContain('/api/catalog/books/real-catalog-uuid/import');
      expect(urls).not.toContain('/catalog/books/internet-archive:thegreatgatsby/status');
      expect(urls).not.toContain('/api/catalog/books/internet-archive:thegreatgatsby/import');

      const state = result.current.getImportState('internet-archive:thegreatgatsby');
      expect(state.status).toBe('ready');
      expect(state.bookId).toBe('lib-ia-polled');
    });
  });

  describe('error handling', () => {
    it('should handle API error response', async () => {
      fetchMock.mockResolvedValueOnce(
        mockErrorResponse(409, {
          code: 'CONFLICT',
          message: 'Title currently unavailable. Please check back later.',
        }),
      );

      const { result } = renderHook(() => useCatalogImport());

      await act(async () => {
        await result.current.importBook('catalog-err');
      });

      const state = result.current.getImportState('catalog-err');
      expect(state.status).toBe('error');
      expect(state.error).toBe('Title currently unavailable. Please check back later.');

      // Verify error toast
      expect(mockDispatch).toHaveBeenCalledWith('toast', {
        message: 'Title currently unavailable. Please check back later.',
        type: 'error',
      });
    });

    it('should handle network failure', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useCatalogImport());

      await act(async () => {
        await result.current.importBook('catalog-net-err');
      });

      const state = result.current.getImportState('catalog-net-err');
      expect(state.status).toBe('error');
      expect(state.error).toBe('Network error');
    });

    it('should handle 404 not found error', async () => {
      fetchMock.mockResolvedValueOnce(
        mockErrorResponse(404, { code: 'NOT_FOUND', message: 'Catalog book not found' }),
      );

      const { result } = renderHook(() => useCatalogImport());

      await act(async () => {
        await result.current.importBook('catalog-missing');
      });

      const state = result.current.getImportState('catalog-missing');
      expect(state.status).toBe('error');
      expect(state.error).toBe('Catalog book not found');
    });
  });

  describe('concurrent imports', () => {
    it('should track multiple books independently', async () => {
      fetchMock
        .mockResolvedValueOnce(
          mockCachedIntent({
            catalogBookId: 'book-a',
            bookId: 'lib-a',
            downloadUrl: 'https://example.com/a.epub',
          }),
        )
        .mockResolvedValueOnce(
          mockCachedIntent({
            catalogBookId: 'book-b',
            bookId: 'lib-b',
            downloadUrl: 'https://example.com/b.epub',
          }),
        );

      const { result } = renderHook(() => useCatalogImport());

      await act(async () => {
        await Promise.all([
          result.current.importBook('book-a'),
          result.current.importBook('book-b'),
        ]);
      });

      expect(result.current.getImportState('book-a').status).toBe('ready');
      expect(result.current.getImportState('book-a').bookId).toBe('lib-a');
      expect(result.current.getImportState('book-b').status).toBe('ready');
      expect(result.current.getImportState('book-b').bookId).toBe('lib-b');
    });
  });

  describe('duplicate prevention', () => {
    it('should not start a new import if already importing', async () => {
      // First call stays in-flight and keeps the import state at importing.
      fetchMock.mockImplementationOnce(() => new Promise(() => {}));

      const { result } = renderHook(() => useCatalogImport());

      // Start first import
      act(() => {
        result.current.importBook('dup-book');
      });

      // Try starting a second import for the same book — should be a no-op
      await act(async () => {
        await result.current.importBook('dup-book');
      });

      // Only one fetch call for the initial import
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('resetImportState', () => {
    it('should reset a book import state to idle', async () => {
      fetchMock.mockResolvedValueOnce(
        mockCachedIntent({
          catalogBookId: 'reset-book',
          bookId: 'lib-reset',
          downloadUrl: 'https://example.com/reset.epub',
        }),
      );

      const { result } = renderHook(() => useCatalogImport());

      await act(async () => {
        await result.current.importBook('reset-book');
      });

      expect(result.current.getImportState('reset-book').status).toBe('ready');

      act(() => {
        result.current.resetImportState('reset-book');
      });

      expect(result.current.getImportState('reset-book')).toEqual({ status: 'idle' });
    });
  });

  describe('import state persistence', () => {
    it('should preserve import states across re-renders', async () => {
      fetchMock.mockResolvedValueOnce(
        mockCachedIntent({
          catalogBookId: 'persist-book',
          bookId: 'lib-persist',
          downloadUrl: 'https://example.com/persist.epub',
        }),
      );

      const { result, rerender } = renderHook(() => useCatalogImport());

      await act(async () => {
        await result.current.importBook('persist-book');
      });

      expect(result.current.getImportState('persist-book').status).toBe('ready');

      // Re-render the hook
      rerender();

      // State should persist
      expect(result.current.getImportState('persist-book').status).toBe('ready');
    });
  });

  describe('library limit check', () => {
    it('should block import when library limit is reached', async () => {
      mockLibraryLimitState.canAddBook = false;
      mockLibraryLimitState.libraryLimit = 10;
      mockLibraryLimitState.currentCount = 10;

      const { result } = renderHook(() => useCatalogImport());

      await act(async () => {
        await result.current.importBook('limit-book');
      });

      // Should show warning toast, not make any API call
      expect(mockDispatch).toHaveBeenCalledWith('toast', {
        message: 'Library full (10 books). Upgrade for unlimited.',
        type: 'warning',
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.current.getImportState('limit-book')).toEqual({ status: 'idle' });
    });

    it('should allow import when library limit is not reached', async () => {
      mockLibraryLimitState.canAddBook = true;
      mockLibraryLimitState.libraryLimit = 10;
      mockLibraryLimitState.currentCount = 5;

      fetchMock.mockResolvedValueOnce(
        mockCachedIntent({
          catalogBookId: 'ok-book',
          bookId: 'lib-ok',
          bookHash: 'catalog:ok-1',
          downloadUrl: 'https://example.com/ok.epub',
        }),
      );

      const { result } = renderHook(() => useCatalogImport());

      await act(async () => {
        await result.current.importBook('ok-book');
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.current.getImportState('ok-book').status).toBe('ready');
    });
  });
});
