import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useCatalogImport } from '@/hooks/useCatalogImport';

const {
  catalogJson,
  fetchMock,
  mockAuthState,
  mockDispatch,
  mockAppService,
  mockImportDeviceFetchedCatalogBook,
  mockOpenCatalogBrowserSourceDownload,
  mockEnqueueBooksForSync,
  mockLibraryState,
  mockSyncPullNow,
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
  const mockOpenCatalogBrowserSourceDownload = vi.fn();
  const mockEnqueueBooksForSync = vi.fn<(arg: unknown) => Promise<void>>(() => Promise.resolve());
  const mockSyncPullNow = vi.fn<() => Promise<void>>(() => {
    mockLibraryState.library = [{ hash: 'catalog:catalog-1' }];
    return Promise.resolve();
  });
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
    mockOpenCatalogBrowserSourceDownload,
    mockEnqueueBooksForSync,
    mockLibraryState,
    mockSyncPullNow,
  };
});

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: mockAppService }),
}));

vi.mock('@/services/catalogDeviceFetch', () => {
  class CatalogBrowserSourceDownloadRequiredError extends Error {
    readonly sourceUrl: string;

    constructor(sourceUrl: URL | string) {
      super(
        'Your browser blocked the direct source download. Open the source download, then import the saved file from Library.',
      );
      this.name = 'CatalogBrowserSourceDownloadRequiredError';
      this.sourceUrl = sourceUrl.toString();
    }
  }

  return {
    CatalogBrowserSourceDownloadRequiredError,
    importDeviceFetchedCatalogBook: (arg: unknown) => mockImportDeviceFetchedCatalogBook(arg),
    openCatalogBrowserSourceDownload: (error: unknown) =>
      mockOpenCatalogBrowserSourceDownload(error),
  };
});

vi.mock('@/services/sync/helpers', () => ({
  enqueueBooksForSync: (arg: unknown) => mockEnqueueBooksForSync(arg),
  handleFireAndForgetSyncEnqueue: (promise: Promise<void>) => {
    void promise.catch(() => {});
  },
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
    pullNow: mockSyncPullNow,
  },
}));

vi.mock('@/services/platform/client', () => ({
  platform: {
    catalog: {
      getImportIntent: (catalogBookId: string, init?: Record<string, unknown>) =>
        catalogJson(`/api/catalog/books/${catalogBookId}/import-intent`, {
          ...init,
          method: 'POST',
          headers: { Authorization: `Bearer ${mockAuthState.token}` },
        }),
    },
  },
}));

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

function mockCachedIntent(extra?: Record<string, unknown>) {
  return {
    ok: true,
    json: async () => ({
      mode: 'cached',
      catalogBookId: 'catalog-1',
      format: 'epub',
      downloadUrl: 'https://example.com/book.epub',
      expiresAt: Date.now() + 900_000,
      sizeBytes: 1234,
      storagePath: 'catalog/books/source/book.epub',
      bookId: 'lib-book-1',
      bookHash: 'catalog:catalog-1',
      policy: {
        source: 'gutenberg',
        sourceId: 'gutenberg-1',
        provenanceLabel: 'Project Gutenberg',
        licenseType: 'public_domain',
        cacheRedistributionAllowed: true,
        deviceFetchAllowed: true,
        allowedFormats: ['epub'],
      },
      ...extra,
    }),
  };
}

function mockDeviceFetchIntent(extra?: Record<string, unknown>) {
  return {
    ok: true,
    json: async () => ({
      mode: 'user_device_fetch',
      catalogBookId: 'catalog-device',
      format: 'epub',
      sourceUrl: 'https://gutenberg.org/files/1/1-0.epub',
      policy: {
        source: 'gutenberg',
        sourceId: '1',
        provenanceLabel: 'Project Gutenberg',
        licenseType: 'public_domain',
        cacheRedistributionAllowed: true,
        deviceFetchAllowed: true,
        allowedFormats: ['epub'],
      },
      ...extra,
    }),
  };
}

function mockErrorResponse(status: number, body?: Record<string, unknown>) {
  return {
    ok: false,
    status,
    json: async () => body ?? { code: 'ERROR', message: `Error ${status}` },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthState.token = 'test-token-123';
  mockAuthState.user = { id: 'user-1' };
  mockLibraryState.library = [];
  mockLibraryState.setLibrary.mockClear();
  mockAppService.saveLibraryBooks.mockClear();
  mockImportDeviceFetchedCatalogBook.mockReset();
  mockOpenCatalogBrowserSourceDownload.mockReset();
  mockEnqueueBooksForSync.mockClear();
  mockSyncPullNow.mockClear();
  mockSyncPullNow.mockImplementation(() => {
    mockLibraryState.library = [{ hash: 'catalog:catalog-1' }];
    return Promise.resolve();
  });
  mockLibraryLimitState.canAddBook = true;
  mockLibraryLimitState.libraryLimit = null;
  mockLibraryLimitState.currentCount = 0;
  mockLibraryLimitState.isLoading = false;
});

afterEach(() => {
  cleanup();
});

describe('useCatalogImport', () => {
  it('returns idle state for unknown book IDs', () => {
    const { result } = renderHook(() => useCatalogImport());
    expect(result.current.getImportState('unknown-id')).toEqual({ status: 'idle' });
  });

  it('returns empty importStates initially', () => {
    const { result } = renderHook(() => useCatalogImport());
    expect(result.current.importStates).toEqual({});
  });

  it('reports readiness from the same guards used before requesting import intent', () => {
    const { result } = renderHook(() => useCatalogImport());

    expect(result.current.getImportReadiness('catalog-1')).toMatchObject({
      ready: true,
      blockedReason: null,
      isAuthenticated: true,
      canAddBook: true,
      currentStatus: 'idle',
    });
  });

  it('blocks readiness while library limit state is still loading', async () => {
    mockLibraryLimitState.isLoading = true;
    mockLibraryLimitState.canAddBook = false;

    const { result } = renderHook(() => useCatalogImport());

    expect(result.current.getImportReadiness('catalog-1')).toMatchObject({
      ready: false,
      blockedReason: 'library_limit_loading',
      isLibraryLimitLoading: true,
    });

    await act(async () => {
      await result.current.importBook('catalog-1');
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledWith('toast', {
      message: 'Checking your library limit. Please try again.',
      type: 'warning',
    });
  });

  it('shows warning toast when user is not authenticated', async () => {
    mockAuthState.token = null;
    mockAuthState.user = null;

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

  it('imports cached intent and transitions to ready state without legacy server-fetch modes', async () => {
    fetchMock.mockResolvedValueOnce(mockCachedIntent());

    const { result } = renderHook(() => useCatalogImport());

    await act(async () => {
      await result.current.importBook('catalog-1');
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toContain('/api/catalog/books/catalog-1/import-intent');
    expect(options.method).toBe('POST');

    const state = result.current.getImportState('catalog-1');
    expect(state).toMatchObject({
      status: 'ready',
      mode: 'cached',
      phase: 'opening',
      progress: 100,
      bookId: 'lib-book-1',
      bookHash: 'catalog:catalog-1',
      downloadUrl: 'https://example.com/book.epub',
    });
    expect(JSON.stringify(state)).not.toContain('server_fetch');
    expect(JSON.stringify(state)).not.toContain('user_upload_fallback');
    expect(JSON.stringify(state)).not.toContain('unavailable');

    expect(mockDispatch).toHaveBeenCalledWith('toast', {
      message: 'Book added to your library',
      type: 'success',
    });
  });

  it('waits for library sync before marking cached intent ready', async () => {
    const { syncWorker } = await import('@/services/sync/syncWorker');
    let resolveSync: () => void = () => {};
    const syncPromise = new Promise<void>((resolve) => {
      resolveSync = resolve;
    });
    vi.mocked(syncWorker.pullNow).mockReturnValueOnce(syncPromise);
    fetchMock.mockResolvedValueOnce(mockCachedIntent({ bookId: 'lib-book-sync' }));

    const { result } = renderHook(() => useCatalogImport());

    let importPromise: Promise<void>;
    act(() => {
      importPromise = result.current.importBook('sync-1');
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(syncWorker.pullNow).toHaveBeenCalledWith('books');
    expect(result.current.getImportState('sync-1')).toMatchObject({
      status: 'importing',
      mode: 'cached',
      phase: 'importing',
      statusMessage: 'Updating library...',
      progress: 85,
    });

    await act(async () => {
      mockLibraryState.library = [{ hash: 'catalog:catalog-1' }];
      resolveSync();
      await importPromise!;
    });

    expect(result.current.getImportState('sync-1')).toMatchObject({
      status: 'ready',
      bookId: 'lib-book-sync',
      bookHash: 'catalog:catalog-1',
    });
  });

  it('fails closed when a cached intent has no canonical library book reference', async () => {
    fetchMock.mockResolvedValueOnce(mockCachedIntent({ bookHash: undefined }));

    const { result } = renderHook(() => useCatalogImport());

    await act(async () => {
      await result.current.importBook('catalog-missing-book-hash');
    });

    expect(result.current.getImportState('catalog-missing-book-hash')).toMatchObject({
      status: 'error',
      error: 'Catalog Add did not return a canonical Library book reference.',
    });
  });

  it('does not call the legacy IA server-import path', async () => {
    const { result } = renderHook(() => useCatalogImport());

    await act(async () => {
      await result.current.importBook('internet-archive:ia-book', 'ia-book');
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.getImportState('internet-archive:ia-book')).toMatchObject({
      status: 'error',
      error: 'OpenRead catalog Add is available from canonical catalog rows only.',
    });
  });

  it('offers an explicit source-download action without claiming import success on browser fallback', async () => {
    const { CatalogBrowserSourceDownloadRequiredError } =
      await import('@/services/catalogDeviceFetch');
    fetchMock.mockResolvedValueOnce(mockDeviceFetchIntent());
    mockImportDeviceFetchedCatalogBook.mockRejectedValueOnce(
      new CatalogBrowserSourceDownloadRequiredError(
        new URL('https://gutenberg.org/files/1/1-0.epub'),
      ),
    );

    const { result } = renderHook(() => useCatalogImport());
    await act(async () => {
      await result.current.importBook('catalog-device');
    });

    const state = result.current.getImportState('catalog-device');
    expect(state).toMatchObject({ status: 'error', mode: 'user_device_fetch' });
    expect(mockAppService.saveLibraryBooks).not.toHaveBeenCalled();
    const toast = mockDispatch.mock.calls.find(([event]) => event === 'toast')?.[1];
    expect(toast).toMatchObject({
      type: 'warning',
      action: { label: 'Open source download' },
    });
    toast.action.run();
    expect(mockOpenCatalogBrowserSourceDownload).toHaveBeenCalledTimes(1);
  });

  it('imports a user_device_fetch intent through the universal device engine', async () => {
    const importedBook = {
      hash: 'local-device-hash',
      title: 'Device Book',
      catalogBookId: 'catalog-device',
    };
    fetchMock.mockResolvedValueOnce(mockDeviceFetchIntent());
    mockImportDeviceFetchedCatalogBook.mockImplementation(async () => {
      mockLibraryState.library = [importedBook];
      return importedBook;
    });

    const { result } = renderHook(() => useCatalogImport());

    await act(async () => {
      await result.current.importBook('catalog-device');
    });

    expect(mockImportDeviceFetchedCatalogBook).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedCatalogBookId: 'catalog-device',
        appService: mockAppService,
        library: [],
      }),
    );
    expect(mockAppService.saveLibraryBooks).toHaveBeenCalledWith([importedBook]);
    expect(mockEnqueueBooksForSync).toHaveBeenCalledWith([importedBook]);
    expect(result.current.getImportState('catalog-device')).toMatchObject({
      status: 'ready',
      mode: 'user_device_fetch',
      phase: 'opening',
      bookHash: 'local-device-hash',
    });
  });

  it('allows retry after a device-fetch import error', async () => {
    const importedBook = {
      hash: 'local-device-hash-retry',
      title: 'Device Book',
      catalogBookId: 'catalog-device',
    };
    fetchMock
      .mockResolvedValueOnce(mockDeviceFetchIntent())
      .mockResolvedValueOnce(mockDeviceFetchIntent());
    mockImportDeviceFetchedCatalogBook
      .mockRejectedValueOnce(new Error('Catalog source returned invalid EPUB bytes.'))
      .mockImplementationOnce(async () => {
        mockLibraryState.library = [importedBook];
        return importedBook;
      });

    const { result } = renderHook(() => useCatalogImport());

    await act(async () => {
      await result.current.importBook('catalog-device');
    });
    expect(result.current.getImportState('catalog-device')).toMatchObject({
      status: 'error',
      error: 'Catalog source returned invalid EPUB bytes.',
    });

    await act(async () => {
      await result.current.importBook('catalog-device');
    });

    expect(mockImportDeviceFetchedCatalogBook).toHaveBeenCalledTimes(2);
    expect(result.current.getImportState('catalog-device')).toMatchObject({
      status: 'ready',
      bookHash: 'local-device-hash-retry',
    });
  });

  it('handles API error response', async () => {
    fetchMock.mockResolvedValueOnce(mockErrorResponse(409, { message: 'Title blocked' }));

    const { result } = renderHook(() => useCatalogImport());

    await act(async () => {
      await result.current.importBook('catalog-err');
    });

    expect(result.current.getImportState('catalog-err')).toMatchObject({
      status: 'error',
      progress: 0,
      error: 'Title blocked',
    });
  });

  it('tracks multiple books independently', async () => {
    mockSyncPullNow.mockImplementation(() => {
      mockLibraryState.library = [{ hash: 'catalog:book-a' }, { hash: 'catalog:book-b' }];
      return Promise.resolve();
    });
    fetchMock
      .mockResolvedValueOnce(mockCachedIntent({ bookId: 'lib-a', bookHash: 'catalog:book-a' }))
      .mockResolvedValueOnce(mockCachedIntent({ bookId: 'lib-b', bookHash: 'catalog:book-b' }));

    const { result } = renderHook(() => useCatalogImport());

    await act(async () => {
      await Promise.all([result.current.importBook('book-a'), result.current.importBook('book-b')]);
    });

    expect(result.current.getImportState('book-a').bookHash).toBe('catalog:book-a');
    expect(result.current.getImportState('book-b').bookHash).toBe('catalog:book-b');
  });

  it('does not start a new import if already importing', async () => {
    let resolveImport!: (response: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (resolveImport = resolve)));

    const { result } = renderHook(() => useCatalogImport());

    act(() => {
      result.current.importBook('dup-book');
    });

    await act(async () => {
      await result.current.importBook('dup-book');
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveImport(mockCachedIntent());
    });
  });

  it('resets a book import state to idle', async () => {
    fetchMock.mockResolvedValueOnce(mockCachedIntent());
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

  it('blocks import when library limit is reached', async () => {
    mockLibraryLimitState.canAddBook = false;
    mockLibraryLimitState.libraryLimit = 100;

    const { result } = renderHook(() => useCatalogImport());

    await act(async () => {
      await result.current.importBook('limit-book');
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledWith('toast', {
      message: 'Library full (100 books). Upgrade for unlimited.',
      type: 'warning',
    });
  });
});
