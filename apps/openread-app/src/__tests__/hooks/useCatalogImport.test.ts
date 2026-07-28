import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canOpenImportedBook,
  resolveCatalogImportReadiness,
  useCatalogImport,
} from '@/hooks/useCatalogImport';
import { activateCatalogAddUser } from '@/services/catalogAddCoordinator';
import { useCatalogAddStore } from '@/store/catalogAddStore';

const { mockAuth, mockDispatch, mockImportBook, mockGetAddRequest, mockLibrary, mockPullNow } =
  vi.hoisted(() => {
    const mockAuth = {
      token: 'token' as string | null,
      user: { id: 'user-1' } as { id: string } | null,
    };
    const mockLibrary = {
      library: [] as Array<{
        hash: string;
        catalogBookId?: string;
        storagePath?: string;
        deletedAt?: number;
      }>,
    };
    return {
      mockAuth,
      mockDispatch: vi.fn(),
      mockImportBook: vi.fn(),
      mockGetAddRequest: vi.fn(),
      mockLibrary,
      mockPullNow: vi.fn(async () => {
        mockLibrary.library = [
          {
            hash: 'catalog:11111111-1111-4111-8111-111111111111',
            catalogBookId: '11111111-1111-4111-8111-111111111111',
            storagePath: 'catalog/books/standard-ebooks/ready.epub',
          },
        ];
      }),
    };
  });

vi.mock('@/context/AuthContext', () => ({ useAuth: () => mockAuth }));
vi.mock('@/hooks/useLibraryLimit', () => ({
  useLibraryLimit: () => ({
    canAddBook: true,
    libraryLimit: 100,
    currentCount: 1,
    isLoading: false,
  }),
}));
vi.mock('@/services/platform/client', () => ({
  platform: {
    catalog: {
      importBook: (...args: unknown[]) => mockImportBook(...args),
      getAddRequest: (...args: unknown[]) => mockGetAddRequest(...args),
    },
  },
}));
vi.mock('@/services/sync/syncWorker', () => ({ syncWorker: { pullNow: mockPullNow } }));
vi.mock('@/store/libraryStore', () => ({ useLibraryStore: { getState: () => mockLibrary } }));
vi.mock('@/utils/event', () => ({ eventDispatcher: { dispatch: mockDispatch } }));

const ready = {
  addRequestId: '22222222-2222-4222-8222-222222222222',
  catalogBookId: '11111111-1111-4111-8111-111111111111',
  state: 'ready',
  requestState: 'completed',
  finalBookId: '33333333-3333-4333-8333-333333333333',
  bookHash: 'catalog:11111111-1111-4111-8111-111111111111',
} as const;

describe('canOpenImportedBook', () => {
  it('allows a ready import with a book hash', () => {
    expect(
      canOpenImportedBook({
        status: 'ready',
        bookHash: 'catalog:11111111-1111-4111-8111-111111111111',
      }),
    ).toBe(true);
  });

  it('rejects an importing state even when the book hash is already available', () => {
    expect(
      canOpenImportedBook({
        status: 'importing',
        bookHash: 'catalog:11111111-1111-4111-8111-111111111111',
      }),
    ).toBe(false);
  });

  it('rejects a ready import without a book hash', () => {
    expect(canOpenImportedBook({ status: 'ready' })).toBe(false);
  });
});

describe('useCatalogImport durable Add', () => {
  beforeEach(() => {
    activateCatalogAddUser('__test_reset__');
    activateCatalogAddUser(null);
    useCatalogAddStore.setState({ userId: null, importStates: {} });
    localStorage.clear();
    mockAuth.token = 'token';
    mockAuth.user = { id: 'user-1' };
    mockLibrary.library = [];
    mockImportBook.mockReset();
    mockGetAddRequest.mockReset();
    mockDispatch.mockReset();
    mockPullNow.mockClear();
  });

  afterEach(cleanup);

  it('posts with a persisted user-scoped idempotency key and never fetches OAPEN in browser', async () => {
    mockImportBook.mockResolvedValue(ready);
    const sourceFetch = vi.spyOn(globalThis, 'fetch');
    const { result } = renderHook(() => useCatalogImport());

    await act(async () => result.current.importBook('11111111-1111-4111-8111-111111111111'));

    expect(result.current.getImportState('11111111-1111-4111-8111-111111111111')).toMatchObject({
      status: 'ready',
      phase: 'opening',
      bookHash: 'catalog:11111111-1111-4111-8111-111111111111',
    });
    const [, init] = mockImportBook.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get('idempotency-key')).toMatch(
      /^catalog-add:user-1:11111111-1111-4111-8111-111111111111:/,
    );
    expect(sourceFetch).not.toHaveBeenCalled();
    expect(localStorage.getItem('openread.catalog-add.v1.user-1')).toBe('{}');
    sourceFetch.mockRestore();
  });

  it('deduplicates one shared request owner across independently mounted hooks', async () => {
    mockImportBook.mockResolvedValue(ready);
    const first = renderHook(() => useCatalogImport());
    const second = renderHook(() => useCatalogImport());

    await act(async () => first.result.current.importBook('11111111-1111-4111-8111-111111111111'));

    expect(mockImportBook).toHaveBeenCalledOnce();
    expect(first.result.current.getImportState('11111111-1111-4111-8111-111111111111').status).toBe(
      'ready',
    );
    expect(
      second.result.current.getImportState('11111111-1111-4111-8111-111111111111').status,
    ).toBe('ready');
  });

  it('polls a durable request and syncs the canonical server-created book', async () => {
    mockImportBook.mockResolvedValue({
      ...ready,
      state: 'preparing',
      requestState: 'waiting_for_materialization',
      bookHash: undefined,
    });
    mockGetAddRequest.mockResolvedValue(ready);
    const { result } = renderHook(() => useCatalogImport());

    await act(async () => result.current.importBook('11111111-1111-4111-8111-111111111111'));

    expect(mockGetAddRequest).toHaveBeenCalledWith(
      ready.addRequestId,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(mockPullNow).toHaveBeenCalledWith('books');
    expect(result.current.getImportState('11111111-1111-4111-8111-111111111111').status).toBe(
      'ready',
    );
  });

  it('resumes a persisted addRequestId after reload', async () => {
    localStorage.setItem(
      'openread.catalog-add.v1.user-1',
      JSON.stringify({
        '11111111-1111-4111-8111-111111111111': {
          idempotencyKey: 'catalog-add:user-1:catalog-1:stable',
          addRequestId: ready.addRequestId,
        },
      }),
    );
    mockGetAddRequest.mockResolvedValue(ready);

    const { result } = renderHook(() => useCatalogImport());

    await waitFor(() =>
      expect(result.current.getImportState('11111111-1111-4111-8111-111111111111').status).toBe(
        'ready',
      ),
    );
    expect(mockImportBook).not.toHaveBeenCalled();
    expect(mockGetAddRequest).toHaveBeenCalledWith(ready.addRequestId, expect.any(Object));
  });

  it('replays a key-only persisted Add after server commit and response loss', async () => {
    const idempotencyKey = 'catalog-add:user-1:11111111-1111-4111-8111-111111111111:stable';
    localStorage.setItem(
      'openread.catalog-add.v1.user-1',
      JSON.stringify({
        '11111111-1111-4111-8111-111111111111': { idempotencyKey },
      }),
    );
    mockImportBook.mockResolvedValue(ready);

    const { result } = renderHook(() => useCatalogImport());

    await waitFor(() =>
      expect(result.current.getImportState('11111111-1111-4111-8111-111111111111').status).toBe(
        'ready',
      ),
    );
    expect(mockImportBook).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      expect.objectContaining({
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    );
    expect(mockGetAddRequest).not.toHaveBeenCalled();
  });

  it('aborts key-only replay on user switch without leaking request state', async () => {
    const idempotencyKey = 'catalog-add:user-1:11111111-1111-4111-8111-111111111111:stable';
    localStorage.setItem(
      'openread.catalog-add.v1.user-1',
      JSON.stringify({
        '11111111-1111-4111-8111-111111111111': { idempotencyKey },
      }),
    );
    let observedSignal: AbortSignal | undefined;
    mockImportBook.mockImplementation(
      (_id: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          observedSignal = init.signal;
          init.signal.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const { result, rerender } = renderHook(() => useCatalogImport());
    await waitFor(() => expect(observedSignal).toBeDefined());

    mockAuth.user = { id: 'user-2' };
    rerender();

    await waitFor(() => expect(observedSignal?.aborted).toBe(true));
    expect(result.current.importStates).toEqual({});
    expect(mockGetAddRequest).not.toHaveBeenCalled();
    expect(localStorage.getItem('openread.catalog-add.v1.user-1')).toContain(idempotencyKey);
  });

  it('discards corrupt persisted entries instead of querying or crashing', async () => {
    localStorage.setItem(
      'openread.catalog-add.v1.user-1',
      JSON.stringify({
        '11111111-1111-4111-8111-111111111111': null,
        'invalid id': { idempotencyKey: 'stable-key', addRequestId: ready.addRequestId },
        'catalog-2': { idempotencyKey: 42, addRequestId: ready.addRequestId },
        'catalog-3': { idempotencyKey: 'stable-key', addRequestId: 'not-a-uuid' },
      }),
    );

    const { result } = renderHook(() => useCatalogImport());

    await waitFor(() => expect(result.current.importStates).toEqual({}));
    expect(mockGetAddRequest).not.toHaveBeenCalled();
    expect(localStorage.getItem('openread.catalog-add.v1.user-1')).toBe('{}');
  });

  it('retries nonterminal status transport failures without terminating the durable request', async () => {
    mockImportBook.mockResolvedValue({
      ...ready,
      state: 'preparing',
      requestState: 'waiting_for_materialization',
      bookHash: undefined,
    });
    mockGetAddRequest.mockRejectedValueOnce(new Error('temporary network failure'));
    mockGetAddRequest.mockResolvedValueOnce(ready);
    const { result } = renderHook(() => useCatalogImport());

    await act(async () => result.current.importBook('11111111-1111-4111-8111-111111111111'));

    expect(mockGetAddRequest).toHaveBeenCalledTimes(2);
    expect(result.current.getImportState('11111111-1111-4111-8111-111111111111').status).toBe(
      'ready',
    );
  });

  it('isolates registry and in-memory state across user switches', async () => {
    localStorage.setItem(
      'openread.catalog-add.v1.user-1',
      JSON.stringify({
        '11111111-1111-4111-8111-111111111111': {
          idempotencyKey: 'stable-key',
          addRequestId: ready.addRequestId,
        },
      }),
    );
    let observedSignal: AbortSignal | undefined;
    mockGetAddRequest.mockImplementation(
      (_id: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          observedSignal = init.signal;
          init.signal.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const { result, rerender } = renderHook(() => useCatalogImport());
    await waitFor(() => expect(observedSignal).toBeDefined());

    mockAuth.user = { id: 'user-2' };
    rerender();

    await waitFor(() => expect(observedSignal?.aborted).toBe(true));
    expect(result.current.importStates).toEqual({});
    expect(localStorage.getItem('openread.catalog-add.v1.user-1')).toContain(ready.addRequestId);
  });

  it('keeps auth, capacity, and in-flight readiness gates', () => {
    expect(
      resolveCatalogImportReadiness({
        token: null,
        user: null,
        current: { status: 'idle' },
        canAddBook: true,
        libraryLimit: 100,
        currentCount: 0,
        isLibraryLimitLoading: false,
      }).blockedReason,
    ).toBe('auth_required');
    expect(
      resolveCatalogImportReadiness({
        token: 'token',
        user: {},
        current: { status: 'importing' },
        canAddBook: true,
        libraryLimit: 100,
        currentCount: 0,
        isLibraryLimitLoading: false,
      }).blockedReason,
    ).toBe('already_importing');
  });
});
