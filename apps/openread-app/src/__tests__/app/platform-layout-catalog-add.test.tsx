import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlatformLayout from '@/app/(platform)/layout';
import { useCatalogImport } from '@/hooks/useCatalogImport';
import { activateCatalogAddUser } from '@/services/catalogAddCoordinator';
import { useCatalogAddStore } from '@/store/catalogAddStore';
import { useLibraryStore } from '@/store/libraryStore';
import type { Book } from '@/types/book';

const CATALOG_BOOK_ID = '11111111-1111-4111-8111-111111111111';
const CATALOG_BOOK_HASH = `catalog:${CATALOG_BOOK_ID}`;

const mocks = vi.hoisted(() => {
  let workerStopped = true;
  const auth = {
    token: 'test-token',
    user: { id: 'direct-explore-user' },
  };
  const appService = {
    isIOSApp: false,
    loadLibraryBooks: vi.fn().mockResolvedValue([]),
    saveLibraryBooks: vi.fn().mockResolvedValue(undefined),
  };
  const envConfig = {
    getAppService: vi.fn().mockResolvedValue(appService),
  };

  return {
    auth,
    appService,
    envConfig,
    importBook: vi.fn(),
    getAddRequest: vi.fn(),
    startWorker: vi.fn(() => {
      workerStopped = false;
    }),
    pullNow: vi.fn(async (_resource: string) => {
      if (workerStopped) throw new Error('sync worker is stopped');
    }),
    resetWorker() {
      workerStopped = true;
    },
    routerReplace: vi.fn(),
    routerPrefetch: vi.fn(),
    dispatch: vi.fn(),
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mocks.routerReplace,
    prefetch: mocks.routerPrefetch,
  }),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => mocks.auth,
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: mocks.appService, envConfig: mocks.envConfig }),
}));

vi.mock('@/hooks/useLibraryLimit', () => ({
  useLibraryLimit: () => ({
    canAddBook: true,
    libraryLimit: 10,
    currentCount: 0,
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/hooks/useTransferQueue', () => ({ useTransferQueue: vi.fn() }));
vi.mock('@/services/auth/clientAuth', () => ({
  clientAuth: { hasStoredSession: () => false },
}));
vi.mock('@/services/bridge/bridgeService', () => ({
  bridge: { on: vi.fn(() => vi.fn()), send: vi.fn() },
}));
vi.mock('@/services/settings/settingsService', () => ({
  settingsService: { load: vi.fn().mockResolvedValue({}) },
}));
vi.mock('@/services/platform/client', () => ({
  platform: {
    catalog: {
      importBook: (...args: unknown[]) => mocks.importBook(...args),
      getAddRequest: (...args: unknown[]) => mocks.getAddRequest(...args),
    },
  },
}));
vi.mock('@/services/sync/syncWorker', () => ({
  syncWorker: {
    start: mocks.startWorker,
    stop: vi.fn(),
    pullNow: (resource: string) => mocks.pullNow(resource),
    get status() {
      return { error: null };
    },
  },
}));
vi.mock('@/utils/event', () => ({
  eventDispatcher: { dispatch: mocks.dispatch },
}));

vi.mock('@/components/platform/sidebar', () => ({ Sidebar: () => null }));
vi.mock('@/components/platform/mobile-sidebar', () => ({
  MobileSidebar: () => null,
  MobileSidebarTrigger: () => null,
}));
vi.mock('@/components/platform/mobile-toolbar-action', () => ({
  PlatformMobileToolbarActionProvider: ({ children }: { children: ReactNode }) => children,
  PlatformMobileToolbarActionSlot: () => null,
}));
vi.mock('@/components/Toast', () => ({ Toast: () => null }));

function DirectExploreAdd() {
  const { importBook, getImportState } = useCatalogImport();
  const state = getImportState(CATALOG_BOOK_ID);

  return (
    <section aria-label='Direct Explore'>
      <button type='button' onClick={() => void importBook(CATALOG_BOOK_ID)}>
        Add
      </button>
      <output>{state.status}</output>
    </section>
  );
}

describe('Platform account-library lifecycle owner', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.resetWorker();
    activateCatalogAddUser('__test_reset__');
    activateCatalogAddUser(null);
    useCatalogAddStore.setState({ userId: null, importStates: {} });
    useLibraryStore.setState({
      library: [],
      libraryLoaded: false,
      libraryOwnerUserId: null,
      isReconciling: false,
      syncError: null,
    });
    mocks.importBook.mockResolvedValue({
      addRequestId: '22222222-2222-4222-8222-222222222222',
      catalogBookId: CATALOG_BOOK_ID,
      state: 'ready',
      requestState: 'completed',
      finalBookId: '33333333-3333-4333-8333-333333333333',
      bookHash: CATALOG_BOOK_HASH,
    });
    mocks.pullNow.mockImplementation(async () => {
      if (mocks.startWorker.mock.calls.length === 0) {
        throw new Error('sync worker is stopped');
      }
      if (mocks.pullNow.mock.calls.length === 2) {
        useLibraryStore.getState().setLibrary([
          {
            hash: CATALOG_BOOK_HASH,
            title: 'Canonical Catalog Book',
            author: 'OpenRead',
            format: 'pdf',
          } as Book,
        ]);
      }
    });
  });

  afterEach(cleanup);

  it('starts sync for a fresh direct Explore entry and reaches ready after one durable Add', async () => {
    const view = render(
      <PlatformLayout>
        <DirectExploreAdd />
      </PlatformLayout>,
    );

    await waitFor(() => expect(mocks.startWorker).toHaveBeenCalledOnce());
    await waitFor(() => expect(mocks.pullNow).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(screen.getByText('ready')).toBeTruthy());
    expect(mocks.importBook).toHaveBeenCalledOnce();
    expect(mocks.importBook).toHaveBeenCalledWith(
      CATALOG_BOOK_ID,
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': expect.any(String) }),
      }),
    );
    expect(mocks.startWorker).toHaveBeenCalledOnce();
    expect(mocks.pullNow).toHaveBeenCalledTimes(2);
    expect(useLibraryStore.getState().getVisibleLibrary()).toEqual([
      expect.objectContaining({ hash: CATALOG_BOOK_HASH }),
    ]);

    view.rerender(
      <PlatformLayout>
        <div>Home route</div>
      </PlatformLayout>,
    );

    expect(mocks.startWorker).toHaveBeenCalledOnce();
    expect(mocks.pullNow).toHaveBeenCalledTimes(2);
  });
});
