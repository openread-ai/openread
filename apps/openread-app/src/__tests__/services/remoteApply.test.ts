import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncTombstone } from '@openread/sync';
import type { MetaHash, SyncableBookRef } from '@openread/types';
import type { Book, BookConfig, BookNote } from '@/types/book';

const mocks = vi.hoisted(() => {
  const book = {
    hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    title: 'Book',
    author: 'Author',
    format: 'epub',
    createdAt: 1,
    updatedAt: 1,
  } as Book;
  const libraryState = {
    library: [book] as Book[],
    setLibrary: vi.fn((books: Book[]) => {
      libraryState.library = books;
    }),
  };
  const bookDataState = {
    configs: new Map<string, BookConfig>(),
    preSyncedConfigs: {} as Record<string, Partial<BookConfig>>,
    getConfig: vi.fn((key: string | null) =>
      key ? (bookDataState.configs.get(key) ?? null) : null,
    ),
    setConfig: vi.fn((key: string, partialConfig: Partial<BookConfig>) => {
      const existing = bookDataState.configs.get(key) ?? ({ updatedAt: 0 } as BookConfig);
      bookDataState.configs.set(key, { ...existing, ...partialConfig } as BookConfig);
    }),
    setPreSyncedConfig: vi.fn((bookHash: string, config: Partial<BookConfig>) => {
      bookDataState.preSyncedConfigs[bookHash] = config;
    }),
  };
  const settingsState = {
    settings: {
      keepLogin: true,
      localBooksDir: '/local-only',
      globalViewSettings: { fontSize: 16 },
    } as Record<string, unknown>,
    setSettings: vi.fn((settings: Record<string, unknown>) => {
      settingsState.settings = settings;
    }),
  };
  const platformSidebarState = {
    collections: [] as Array<{
      id: string;
      name: string;
      bookHashes: string[];
      createdAt: string;
      updatedAt?: number;
      deletedAt?: number | null;
    }>,
    setState: vi.fn((patch: { collections?: typeof platformSidebarState.collections }) => {
      if (patch.collections) platformSidebarState.collections = patch.collections;
    }),
  };
  const appService = {
    loadBookConfig: vi.fn(async () => ({ updatedAt: 0 }) as BookConfig),
    saveBookConfig: vi.fn(async () => undefined),
    saveLibraryBooks: vi.fn(async () => undefined),
  };
  const settingsService = {
    applySyncable: vi.fn((local: Record<string, unknown>, remote: Record<string, unknown>) => ({
      ...local,
      keepLogin: remote.keepLogin ?? local.keepLogin,
      globalViewSettings: remote.globalViewSettings ?? local.globalViewSettings,
    })),
    save: vi.fn(async (_envConfig: unknown, settings: Record<string, unknown>) => settings),
  };
  return {
    book,
    libraryState,
    bookDataState,
    settingsState,
    platformSidebarState,
    appService,
    settingsService,
  };
});

vi.mock('@/store/libraryStore', () => ({
  useLibraryStore: { getState: () => mocks.libraryState },
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: { getState: () => mocks.bookDataState },
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: { getState: () => mocks.settingsState },
}));

vi.mock('@/store/platformSidebarStore', () => ({
  usePlatformSidebarStore: Object.assign(() => mocks.platformSidebarState, {
    getState: () => mocks.platformSidebarState,
    setState: mocks.platformSidebarState.setState,
  }),
}));

vi.mock('@/services/environment', () => ({
  default: { getAppService: vi.fn(async () => mocks.appService) },
}));

vi.mock('@/services/settings/settingsService', () => ({
  settingsService: mocks.settingsService,
}));

describe('remote sync apply layer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.libraryState.library = [mocks.book];
    mocks.bookDataState.configs.clear();
    mocks.bookDataState.preSyncedConfigs = {};
    mocks.appService.loadBookConfig.mockResolvedValue({ updatedAt: 0 } as BookConfig);
    mocks.settingsState.settings = {
      keepLogin: true,
      localBooksDir: '/local-only',
      globalViewSettings: { fontSize: 16 },
    };
    mocks.platformSidebarState.collections = [];
  });

  it('matches remote apply events only by book hash or non-empty meta hash fallback', async () => {
    const { remoteApplyEventMatchesBook } = await import('@/services/sync/remoteApply');

    expect(
      remoteApplyEventMatchesBook({
        eventBookHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as SyncableBookRef,
        bookHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as SyncableBookRef,
      }),
    ).toBe(true);
    expect(
      remoteApplyEventMatchesBook({
        eventBookHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as SyncableBookRef,
        bookHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as SyncableBookRef,
        eventMetaHash: 'meta-1' as MetaHash,
        bookMetaHash: 'meta-1' as MetaHash,
      }),
    ).toBe(true);
    expect(
      remoteApplyEventMatchesBook({
        eventBookHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as SyncableBookRef,
        bookHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as SyncableBookRef,
        eventMetaHash: undefined,
        bookMetaHash: undefined,
      }),
    ).toBe(false);
  });

  it('applies the latest remote progress even when the CFI moves backward', async () => {
    const { applyRemoteBookConfigRows, subscribeRemoteApply } =
      await import('@/services/sync/remoteApply');
    mocks.bookDataState.configs.set(mocks.book.hash, {
      bookHash: mocks.book.hash,
      location: 'epubcfi(/6/20)',
      progress: [20, 100],
      updatedAt: 1000,
    } as BookConfig);
    const events: unknown[] = [];
    const unsubscribe = subscribeRemoteApply((event) => events.push(event));

    await applyRemoteBookConfigRows(
      [
        {
          config: {
            bookHash: mocks.book.hash,
            location: 'epubcfi(/6/2)',
            progress: [2, 100],
            updatedAt: 2000,
          } as BookConfig,
          record: {
            id: 'config-1',
            book_hash: mocks.book.hash,
            user_id: 'user-1',
            updated_at: 2000,
            deleted_at: null,
          },
        },
      ],
      [],
    );

    expect(mocks.bookDataState.configs.get(mocks.book.hash)).toMatchObject({
      location: 'epubcfi(/6/2)',
      progress: [2, 100],
      updatedAt: 2000,
    });
    expect(mocks.bookDataState.preSyncedConfigs[mocks.book.hash]).toMatchObject({
      location: 'epubcfi(/6/2)',
    });
    expect(events).toHaveLength(1);
    unsubscribe();
  });

  it('accepts stale and non-applicable config records for cursor advancement without applying them', async () => {
    const { applyRemoteBookConfigRows } = await import('@/services/sync/remoteApply');
    mocks.bookDataState.configs.set(mocks.book.hash, {
      bookHash: mocks.book.hash,
      location: 'epubcfi(/6/20)',
      progress: [20, 100],
      updatedAt: 2000,
    } as BookConfig);

    const result = await applyRemoteBookConfigRows(
      [
        {
          config: {
            bookHash: mocks.book.hash,
            location: 'epubcfi(/6/2)',
            progress: [2, 100],
            updatedAt: 1000,
          } as BookConfig,
          record: {
            id: 'stale-config',
            book_hash: mocks.book.hash,
            user_id: 'user-1',
            updated_at: 1000,
            deleted_at: null,
          },
        },
        {
          config: {
            bookHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as SyncableBookRef,
            location: 'epubcfi(/6/4)',
            progress: [4, 100],
            updatedAt: 3000,
          } as BookConfig,
          record: {
            id: 'missing-book-config',
            book_hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            user_id: 'user-1',
            updated_at: 3000,
            deleted_at: null,
          },
        },
      ],
      [
        {
          entity: 'bookConfig',
          entityId: mocks.book.hash,
          serverRevision: 'stale-delete-config',
          serverUpdatedAt: 1500,
          deletedAt: 1500,
        } as SyncTombstone,
      ],
    );

    expect(result.acceptedRecords.map((record) => record.id)).toEqual([
      'stale-config',
      'missing-book-config',
    ]);
    expect(result.acceptedTombstones).toHaveLength(1);
    expect(result.configs).toHaveLength(0);
    expect(mocks.bookDataState.configs.get(mocks.book.hash)).toMatchObject({
      location: 'epubcfi(/6/20)',
      updatedAt: 2000,
    });
  });

  it('applies note create, update, and tombstone delete with LWW semantics', async () => {
    const { applyRemoteBookNoteRows } = await import('@/services/sync/remoteApply');
    const bookHash = mocks.book.hash as SyncableBookRef;
    const staleNote: BookNote = {
      bookHash,
      id: 'note-1',
      type: 'annotation',
      cfi: 'epubcfi(/6/4)',
      note: 'old',
      createdAt: 1,
      updatedAt: 1000,
    };
    mocks.bookDataState.configs.set(mocks.book.hash, {
      bookHash: mocks.book.hash,
      booknotes: [staleNote],
      updatedAt: 1000,
    } as BookConfig);

    await applyRemoteBookNoteRows(
      [
        {
          note: { ...staleNote, note: 'new', updatedAt: 2000 },
          record: {
            id: 'note-1',
            book_hash: mocks.book.hash,
            user_id: 'user-1',
            updated_at: 2000,
            deleted_at: null,
          },
        },
        {
          note: {
            bookHash,
            id: 'note-2',
            type: 'bookmark',
            cfi: 'epubcfi(/6/8)',
            note: '',
            createdAt: 1500,
            updatedAt: 1500,
          },
          record: {
            id: 'note-2',
            book_hash: mocks.book.hash,
            user_id: 'user-1',
            updated_at: 1500,
            deleted_at: null,
          },
        },
      ],
      [],
    );

    await applyRemoteBookNoteRows(
      [],
      [
        {
          entity: 'bookNote',
          entityId: `${mocks.book.hash}:note-1`,
          serverRevision: 'delete-note-1',
          serverUpdatedAt: 3000,
          deletedAt: 3000,
        } as SyncTombstone,
      ],
    );

    const notes = mocks.bookDataState.configs.get(mocks.book.hash)?.booknotes ?? [];
    expect(notes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'note-1', note: 'new', updatedAt: 3000, deletedAt: 3000 }),
        expect.objectContaining({ id: 'note-2', type: 'bookmark' }),
      ]),
    );
  });

  it('accepts stale and non-applicable note records for cursor advancement without applying them', async () => {
    const { applyRemoteBookNoteRows } = await import('@/services/sync/remoteApply');
    const bookHash = mocks.book.hash as SyncableBookRef;
    const currentNote: BookNote = {
      bookHash,
      id: 'note-1',
      type: 'annotation',
      cfi: 'epubcfi(/6/4)',
      note: 'current',
      createdAt: 1,
      updatedAt: 2000,
    };
    mocks.bookDataState.configs.set(mocks.book.hash, {
      bookHash,
      booknotes: [currentNote],
      updatedAt: 2000,
    } as BookConfig);

    const result = await applyRemoteBookNoteRows(
      [
        {
          note: { ...currentNote, note: 'stale', updatedAt: 1000 },
          record: {
            id: 'stale-note',
            book_hash: mocks.book.hash,
            user_id: 'user-1',
            updated_at: 1000,
            deleted_at: null,
          },
        },
        {
          note: {
            bookHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as SyncableBookRef,
            id: 'note-2',
            type: 'bookmark',
            cfi: 'epubcfi(/6/8)',
            note: '',
            createdAt: 3000,
            updatedAt: 3000,
          },
          record: {
            id: 'missing-book-note',
            book_hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            user_id: 'user-1',
            updated_at: 3000,
            deleted_at: null,
          },
        },
      ],
      [
        {
          entity: 'bookNote',
          entityId: `${mocks.book.hash}:note-1`,
          serverRevision: 'stale-delete-note',
          serverUpdatedAt: 1500,
          deletedAt: 1500,
        } as SyncTombstone,
      ],
    );

    expect(result.acceptedRecords.map((record) => record.id)).toEqual([
      'stale-note',
      'missing-book-note',
    ]);
    expect(result.acceptedTombstones).toHaveLength(1);
    expect(result.notes).toHaveLength(0);
    expect(mocks.bookDataState.configs.get(mocks.book.hash)?.booknotes?.[0]).toMatchObject({
      note: 'current',
      updatedAt: 2000,
    });
  });

  it('keeps local-only settings out of the real syncable settings merge', async () => {
    const { applySyncableSettings } = await import('@/services/settings/settingsSyncAdapter');

    const merged = applySyncableSettings(
      {
        keepLogin: true,
        localBooksDir: '/local-only',
        libraryPaintCache: { cached: true },
        globalViewSettings: { fontSize: 16 },
      } as unknown as Parameters<typeof applySyncableSettings>[0],
      {
        keepLogin: false,
        localBooksDir: '/must-not-sync',
        libraryPaintCache: { cached: false },
        globalViewSettings: { fontSize: 20 },
      },
    ) as unknown as Record<string, unknown>;

    expect(merged.keepLogin).toBe(false);
    expect(merged.localBooksDir).toBe('/local-only');
    expect(merged.libraryPaintCache).toEqual({ cached: true });
    expect(merged.globalViewSettings).toMatchObject({ fontSize: 20 });
  });

  it('applies settings through syncable filtering and persists without echo sync', async () => {
    const { applyRemoteSettingsAndCollections } = await import('@/services/sync/remoteApply');

    await applyRemoteSettingsAndCollections({
      remoteSettings: {
        keepLogin: false,
        localBooksDir: '/must-not-sync',
        globalViewSettings: { fontSize: 20 },
      },
    });

    expect(mocks.settingsService.applySyncable).toHaveBeenCalled();
    expect(mocks.settingsState.settings).toMatchObject({
      keepLogin: false,
      localBooksDir: '/local-only',
      globalViewSettings: { fontSize: 20 },
    });
    expect(mocks.settingsService.save).toHaveBeenCalledWith(
      expect.anything(),
      mocks.settingsState.settings,
      {
        sync: false,
      },
    );
  });
});
