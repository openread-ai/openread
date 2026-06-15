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

  it('returns conflicts for unsupported canonical mutations instead of dropping them silently', async () => {
    const pushChanges = vi.fn().mockResolvedValue({ books: [], configs: [], notes: [] });
    const transport = new LegacySyncTransport({ pushChanges } as never);
    const unsupported: SyncMutation<'settings'> = {
      id: 'm-settings',
      entity: 'settings',
      entityId: 'settings',
      op: 'upsert',
      baseRevision: null,
      userId: 'user-1',
      deviceId: 'device-1',
      clientUpdatedAt: 1,
      payload: { id: 'settings', settings: { theme: 'dark' }, updatedAt: 1 },
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
        mutationId: 'm-settings',
        entity: 'settings',
        reason: 'validation-failed',
      },
    ]);
  });
});
