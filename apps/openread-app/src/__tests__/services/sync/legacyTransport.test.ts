import { describe, expect, it, vi } from 'vitest';
import type { SyncMutation, SyncPushRequest, SyncUpsertMutation } from '@openread/sync';

import { SyncEngine } from '@/services/sync/engine';
import { LegacySyncTransport } from '@/services/sync/legacyTransport';
import { MemorySyncOutboxStorage, SyncOutbox } from '@/services/sync/outbox';

const deletedBookMutation: SyncUpsertMutation<'book'> = {
  id: 'm-book-delete',
  entity: 'book',
  entityId: 'book-1',
  op: 'upsert',
  baseRevision: null,
  userId: 'user-1',
  deviceId: 'device-1',
  clientUpdatedAt: 4,
  payload: { hash: 'book-1', title: 'Book', updatedAt: 4, deletedAt: 4 },
};

describe('LegacySyncTransport', () => {
  it('bridges canonical book/config/note upserts into the existing sync client payload', async () => {
    const pushChanges = vi.fn().mockResolvedValue({ books: [], configs: [], notes: [] });
    const transport = new LegacySyncTransport({ pushChanges } as never);
    const request: SyncPushRequest = {
      protocolVersion: 1,
      userId: 'user-1',
      deviceId: 'device-1',
      mutations: [
        {
          id: 'm-book',
          entity: 'book',
          entityId: 'book-1',
          op: 'upsert',
          baseRevision: null,
          userId: 'user-1',
          deviceId: 'device-1',
          clientUpdatedAt: 1,
          payload: { hash: 'book-1', title: 'Book', updatedAt: 1 },
        },
        {
          id: 'm-config',
          entity: 'bookConfig',
          entityId: 'book-1',
          op: 'upsert',
          baseRevision: null,
          userId: 'user-1',
          deviceId: 'device-1',
          clientUpdatedAt: 2,
          payload: { bookHash: 'book-1', updatedAt: 2 },
        },
        {
          id: 'm-note',
          entity: 'bookNote',
          entityId: 'book-1:note-1',
          op: 'upsert',
          baseRevision: null,
          userId: 'user-1',
          deviceId: 'device-1',
          clientUpdatedAt: 3,
          payload: {
            id: 'note-1',
            bookHash: 'book-1',
            type: 'annotation',
            cfi: 'epubcfi(/6/2)',
            updatedAt: 3,
          },
        },
      ],
    };

    const response = await transport.push(request);

    expect(pushChanges).toHaveBeenCalledWith({
      books: [request.mutations[0]!.payload],
      configs: [request.mutations[1]!.payload],
      notes: [request.mutations[2]!.payload],
    });
    expect(response.accepted.map((ack) => ack.mutationId)).toEqual([
      'm-book',
      'm-config',
      'm-note',
    ]);
    expect(response.conflicts).toEqual([]);
  });

  it('cleans dependent remote rows for deleted book mutations after the tombstone push', async () => {
    const pushChanges = vi.fn().mockResolvedValue({ books: [], configs: [], notes: [] });
    const cleanupDeletedBook = vi.fn().mockResolvedValue(undefined);
    const transport = new LegacySyncTransport({ pushChanges } as never, cleanupDeletedBook);

    const response = await transport.push({
      protocolVersion: 1,
      userId: 'user-1',
      deviceId: 'device-1',
      mutations: [deletedBookMutation],
    });

    expect(pushChanges).toHaveBeenCalledWith({ books: [deletedBookMutation.payload] });
    expect(cleanupDeletedBook).toHaveBeenCalledWith('book-1');
    expect(response.accepted).toHaveLength(1);
    expect(response.accepted[0]!.mutationId).toBe('m-book-delete');
  });

  it('cleans each deleted book in a bulk delete batch', async () => {
    const pushChanges = vi.fn().mockResolvedValue({ books: [], configs: [], notes: [] });
    const cleanupDeletedBook = vi.fn().mockResolvedValue(undefined);
    const transport = new LegacySyncTransport({ pushChanges } as never, cleanupDeletedBook);
    const secondDelete: SyncUpsertMutation<'book'> = {
      ...deletedBookMutation,
      id: 'm-book-delete-2',
      entityId: 'book-2',
      payload: { ...deletedBookMutation.payload, hash: 'book-2' },
    };

    await transport.push({
      protocolVersion: 1,
      userId: 'user-1',
      deviceId: 'device-1',
      mutations: [deletedBookMutation, secondDelete],
    });

    expect(cleanupDeletedBook).toHaveBeenCalledTimes(2);
    expect(cleanupDeletedBook).toHaveBeenNthCalledWith(1, 'book-1');
    expect(cleanupDeletedBook).toHaveBeenNthCalledWith(2, 'book-2');
  });

  it('keeps deleted-book mutations pending when remote cleanup fails so reconnect can retry', async () => {
    const pushChanges = vi.fn().mockResolvedValue({ books: [], configs: [], notes: [] });
    const cleanupDeletedBook = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined);
    const outbox = new SyncOutbox(new MemorySyncOutboxStorage(), () => 1_000);
    const transport = new LegacySyncTransport({ pushChanges } as never, cleanupDeletedBook);
    const engine = new SyncEngine({
      userId: 'user-1',
      deviceId: 'device-1',
      outbox,
      transport,
      retryBackoffMs: 0,
      claimOwner: 'test-claim-owner',
    });
    await outbox.enqueue(deletedBookMutation);

    await expect(engine.drainOnce()).resolves.toMatchObject({
      attempted: 1,
      accepted: 0,
      failed: 1,
      remaining: 1,
    });
    await expect(engine.drainOnce()).resolves.toMatchObject({
      attempted: 1,
      accepted: 1,
      failed: 0,
      remaining: 0,
    });
    expect(pushChanges).toHaveBeenCalledTimes(2);
    expect(cleanupDeletedBook).toHaveBeenCalledTimes(2);
  });

  it('bridges settings and collections through the legacy settings channel without dropping remote collections', async () => {
    const remoteCollection = {
      id: 'collection-remote',
      name: 'Read later',
      bookHashes: ['book-2'],
      updatedAt: 1_500,
    };
    const pushChanges = vi.fn().mockResolvedValue({ settings: {} });
    const pullChanges = vi.fn().mockResolvedValue({
      settings: { _collections: [remoteCollection] },
    });
    const transport = new LegacySyncTransport({ pushChanges, pullChanges } as never);
    const settingsMutation: SyncUpsertMutation<'settings'> = {
      id: 'm-settings',
      entity: 'settings',
      entityId: 'settings',
      op: 'upsert',
      baseRevision: null,
      userId: 'user-1',
      deviceId: 'device-1',
      clientUpdatedAt: 1_000,
      payload: { id: 'settings', settings: { libraryViewMode: 'grid' }, updatedAt: 1_000 },
    };
    const collectionMutation: SyncUpsertMutation<'collection'> = {
      id: 'm-collection',
      entity: 'collection',
      entityId: 'collection-1',
      op: 'upsert',
      baseRevision: null,
      userId: 'user-1',
      deviceId: 'device-1',
      clientUpdatedAt: 2_000,
      payload: {
        id: 'collection-1',
        name: 'Favorites',
        bookHashes: ['book-1'],
        updatedAt: 2_000,
      },
    };

    const response = await transport.push({
      protocolVersion: 1,
      userId: 'user-1',
      deviceId: 'device-1',
      mutations: [settingsMutation, collectionMutation],
    });

    expect(pullChanges).toHaveBeenCalledWith(0, 'settings');
    expect(pushChanges).toHaveBeenCalledWith({
      settings: {
        libraryViewMode: 'grid',
        _collections: [remoteCollection, collectionMutation.payload],
        _updatedAt: new Date(2_000).toISOString(),
      },
    });
    expect(response.accepted.map((ack) => ack.mutationId)).toEqual(['m-settings', 'm-collection']);
  });

  it('keeps newer remote collection snapshots when stale partial mutations arrive', async () => {
    const newerRemoteCollection = {
      id: 'collection-1',
      name: 'Remote winner',
      bookHashes: ['book-2'],
      updatedAt: 5_000,
    };
    const pushChanges = vi.fn().mockResolvedValue({ settings: {} });
    const pullChanges = vi.fn().mockResolvedValue({
      settings: { _collections: [newerRemoteCollection] },
    });
    const transport = new LegacySyncTransport({ pushChanges, pullChanges } as never);
    const staleCollectionMutation: SyncUpsertMutation<'collection'> = {
      id: 'm-collection-stale',
      entity: 'collection',
      entityId: 'collection-1',
      op: 'upsert',
      baseRevision: null,
      userId: 'user-1',
      deviceId: 'device-1',
      clientUpdatedAt: 2_000,
      payload: {
        id: 'collection-1',
        name: 'Local stale',
        bookHashes: ['book-1'],
        updatedAt: 2_000,
      },
    };

    await transport.push({
      protocolVersion: 1,
      userId: 'user-1',
      deviceId: 'device-1',
      mutations: [staleCollectionMutation],
    });

    expect(pushChanges).toHaveBeenCalledWith({
      settings: {
        _collections: [newerRemoteCollection],
        _updatedAt: new Date(5_000).toISOString(),
      },
    });
  });

  it('preserves untouched collections across split canonical collection batches', async () => {
    let remoteSettings: Record<string, unknown> = {
      _collections: [{ id: 'collection-untouched', name: 'Untouched', updatedAt: 1_000 }],
    };
    const pushChanges = vi
      .fn()
      .mockImplementation(async (payload: { settings?: Record<string, unknown> }) => {
        remoteSettings = { ...remoteSettings, ...(payload.settings ?? {}) };
        return { settings: remoteSettings };
      });
    const pullChanges = vi.fn().mockImplementation(async () => ({ settings: remoteSettings }));
    const outbox = new SyncOutbox(new MemorySyncOutboxStorage(), () => 1_000);
    const transport = new LegacySyncTransport({ pushChanges, pullChanges } as never);
    const engine = new SyncEngine({
      userId: 'user-1',
      deviceId: 'device-1',
      outbox,
      transport,
      batchSize: 1,
      claimOwner: 'test-claim-owner',
    });
    await outbox.enqueue({
      id: 'm-collection-1',
      entity: 'collection',
      entityId: 'collection-1',
      op: 'upsert',
      baseRevision: null,
      userId: 'user-1',
      deviceId: 'device-1',
      clientUpdatedAt: 2_000,
      payload: { id: 'collection-1', name: 'One', bookHashes: [], updatedAt: 2_000 },
    });
    await outbox.enqueue({
      id: 'm-collection-2',
      entity: 'collection',
      entityId: 'collection-2',
      op: 'upsert',
      baseRevision: null,
      userId: 'user-1',
      deviceId: 'device-1',
      clientUpdatedAt: 3_000,
      payload: { id: 'collection-2', name: 'Two', bookHashes: [], updatedAt: 3_000 },
    });

    await expect(engine.drainOnce()).resolves.toMatchObject({ attempted: 1, accepted: 1 });
    await expect(engine.drainOnce()).resolves.toMatchObject({ attempted: 1, accepted: 1 });

    const finalCollectionIds = ((remoteSettings._collections as Array<{ id: string }>) ?? [])
      .map((collection) => collection.id)
      .sort();
    expect(finalCollectionIds).toEqual(['collection-1', 'collection-2', 'collection-untouched']);
  });

  it('acknowledges file metadata without raw-byte side effects in the legacy bridge', async () => {
    const pushChanges = vi.fn().mockResolvedValue({});
    const transport = new LegacySyncTransport({ pushChanges } as never);
    const fileMutation: SyncUpsertMutation<'fileMetadata'> = {
      id: 'm-file',
      entity: 'fileMetadata',
      entityId: 'user-1/Books/book.epub',
      op: 'upsert',
      baseRevision: null,
      userId: 'user-1',
      deviceId: 'device-1',
      clientUpdatedAt: 3_000,
      payload: {
        id: 'user-1/Books/book.epub',
        bookHash: 'book-1',
        fileType: 'book',
        status: 'uploaded',
        updatedAt: 3_000,
      },
    };

    const response = await transport.push({
      protocolVersion: 1,
      userId: 'user-1',
      deviceId: 'device-1',
      mutations: [fileMutation],
    });

    expect(pushChanges).not.toHaveBeenCalled();
    expect(response.accepted).toHaveLength(1);
    expect(response.accepted[0]!.mutationId).toBe('m-file');
  });

  it('returns conflicts for unsupported canonical mutations instead of dropping them silently', async () => {
    const pushChanges = vi.fn().mockResolvedValue({ books: [], configs: [], notes: [] });
    const transport = new LegacySyncTransport({ pushChanges } as never);
    const unsupported: SyncMutation<'settings'> = {
      id: 'm-settings-delete',
      entity: 'settings',
      entityId: 'settings',
      op: 'delete',
      baseRevision: null,
      userId: 'user-1',
      deviceId: 'device-1',
      clientUpdatedAt: 1,
      tombstone: { deletedAt: 1 },
    };

    const response = await transport.push({
      protocolVersion: 1,
      userId: 'user-1',
      deviceId: 'device-1',
      mutations: [unsupported],
    });

    expect(pushChanges).not.toHaveBeenCalled();
    expect(response.accepted).toEqual([]);
    expect(response.conflicts).toMatchObject([
      {
        mutationId: 'm-settings-delete',
        entity: 'settings',
        reason: 'validation-failed',
      },
    ]);
  });
});
