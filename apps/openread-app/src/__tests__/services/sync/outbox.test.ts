import { testSyncableBookRef } from '../../utils/bookIdentityFixtures';
import { describe, expect, it } from 'vitest';
import type { SyncMutation, SyncUpsertMutation } from '@openread/sync/protocol';

import {
  MemorySyncOutboxStorage,
  type StoredSyncMutation,
  SyncOutbox,
  SyncOutboxValidationError,
} from '@/services/sync/outbox';

const bookMutation = (
  overrides: Partial<SyncUpsertMutation<'book'>> = {},
): SyncUpsertMutation<'book'> => ({
  id: 'mutation-1',
  entity: 'book',
  entityId: 'd41d8cd98f00b204e9800998ecf8427e',
  op: 'upsert',
  baseRevision: 'rev-1',
  userId: 'user-1',
  deviceId: 'device-1',
  clientUpdatedAt: 100,
  payload: {
    hash: testSyncableBookRef('d41d8cd98f00b204e9800998ecf8427e'),
    title: 'Book 1',
    updatedAt: 100,
  },
  ...overrides,
});

const bookNoteMutation = (
  overrides: Partial<SyncUpsertMutation<'bookNote'>> = {},
): SyncUpsertMutation<'bookNote'> => ({
  id: 'note-mutation-1',
  entity: 'bookNote',
  entityId: 'd41d8cd98f00b204e9800998ecf8427e:note-1',
  op: 'upsert',
  baseRevision: 'rev-1',
  userId: 'user-1',
  deviceId: 'device-1',
  clientUpdatedAt: 100,
  payload: {
    id: 'note-1',
    bookHash: testSyncableBookRef('d41d8cd98f00b204e9800998ecf8427e'),
    type: 'highlight',
    cfi: 'epubcfi(/6/2!/4/1:0)',
    updatedAt: 100,
  },
  ...overrides,
});

describe('canonical SyncOutbox', () => {
  it('persists validated protocol mutations with pending metadata', async () => {
    const outbox = new SyncOutbox(new MemorySyncOutboxStorage(), () => 1_000);

    const stored = await outbox.enqueue(bookMutation());

    expect(stored).toMatchObject({
      id: 'mutation-1',
      entity: 'book',
      status: 'pending',
      retryCount: 0,
      createdAt: 1_000,
      updatedAt: 1_000,
      nextAttemptAt: 1_000,
    });
    await expect(outbox.pendingCount('user-1')).resolves.toBe(1);
  });

  it('rejects invalid mutations before they enter durable storage', async () => {
    const outbox = new SyncOutbox(new MemorySyncOutboxStorage(), () => 1_000);
    const invalid = { ...bookMutation(), baseRevision: undefined };

    await expect(outbox.enqueue(invalid as unknown as SyncMutation)).rejects.toBeInstanceOf(
      SyncOutboxValidationError,
    );
    await expect(outbox.getAll()).resolves.toHaveLength(0);
  });

  it('isolates pending reads by user and preserves FIFO ordering', async () => {
    let now = 1_000;
    const outbox = new SyncOutbox(new MemorySyncOutboxStorage(), () => now);

    await outbox.enqueue(bookMutation({ id: 'a-1', userId: 'user-a' }));
    now += 1;
    await outbox.enqueue(bookMutation({ id: 'b-1', userId: 'user-b' }));
    now += 1;
    await outbox.enqueue(bookMutation({ id: 'a-2', userId: 'user-a' }));

    const pending = await outbox.getPending({ userId: 'user-a' });

    expect(pending.map((record) => record.id)).toEqual(['a-1', 'a-2']);
  });

  it('backs off retryable claimed failures and marks exhausted records failed', async () => {
    let now = 1_000;
    const outbox = new SyncOutbox(new MemorySyncOutboxStorage(), () => now);
    await outbox.enqueue(bookMutation());
    await outbox.claimPending({ userId: 'user-1', leaseOwner: 'engine-a' });

    await outbox.recordClaimFailure(['mutation-1'], 'engine-a', 'network', {
      maxRetries: 2,
      retryBackoffMs: 500,
    });
    let records = await outbox.getAll('user-1');
    expect(records[0]).toMatchObject({
      status: 'pending',
      retryCount: 1,
      nextAttemptAt: 1_500,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: 'network',
    });
    await expect(outbox.getPending({ userId: 'user-1', now: 1_499 })).resolves.toHaveLength(0);

    now = 1_500;
    await outbox.claimPending({ userId: 'user-1', leaseOwner: 'engine-a' });
    await outbox.recordClaimFailure(['mutation-1'], 'engine-a', 'still offline', {
      maxRetries: 2,
      retryBackoffMs: 500,
    });
    records = await outbox.getAll('user-1');
    expect(records[0]).toMatchObject({
      status: 'failed',
      retryCount: 2,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: 'still offline',
    });
    await expect(outbox.getPending({ userId: 'user-1', now: 2_500 })).resolves.toHaveLength(0);
  });

  it('atomically claims pending mutations across storage clients', async () => {
    const records = new Map<string, StoredSyncMutation>();
    const outboxA = new SyncOutbox(new MemorySyncOutboxStorage(records), () => 1_000);
    const outboxB = new SyncOutbox(new MemorySyncOutboxStorage(records), () => 1_000);
    await outboxA.enqueue(bookMutation());

    const [firstClaim, secondClaim] = await Promise.all([
      outboxA.claimPending({ userId: 'user-1', leaseOwner: 'engine-a' }),
      outboxB.claimPending({ userId: 'user-1', leaseOwner: 'engine-b' }),
    ]);

    expect(firstClaim).toHaveLength(1);
    expect(secondClaim).toHaveLength(0);
    expect(await outboxA.getAll('user-1')).toMatchObject([
      {
        id: 'mutation-1',
        status: 'pushing',
        leaseOwner: 'engine-a',
        leaseExpiresAt: 31_000,
      },
    ]);
  });

  it('recovers terminal failed mutations to pending without changing payload metadata', async () => {
    let now = 1_000;
    const outbox = new SyncOutbox(new MemorySyncOutboxStorage(), () => now);
    await outbox.enqueue(bookNoteMutation());
    await outbox.claimPending({ userId: 'user-1', leaseOwner: 'engine-a' });
    await outbox.recordClaimFailure(['note-mutation-1'], 'engine-a', 'permanent conflict', {
      maxRetries: 1,
      retryBackoffMs: 500,
    });

    await expect(outbox.getPending({ userId: 'user-1', now: 5_000 })).resolves.toHaveLength(0);

    now = 5_000;
    const [recovered] = await outbox.recoverFailed({ userId: 'user-1' });

    expect(recovered).toMatchObject({
      id: 'note-mutation-1',
      entity: 'bookNote',
      status: 'pending',
      retryCount: 0,
      updatedAt: 5_000,
      nextAttemptAt: 5_000,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: null,
      payload: expect.objectContaining({ id: 'note-1', type: 'highlight' }),
      baseRevision: 'rev-1',
    });
    await expect(outbox.getPending({ userId: 'user-1', now: 5_000 })).resolves.toHaveLength(1);
  });

  it('does not recover failed records with an active lease', async () => {
    const storage = new MemorySyncOutboxStorage();
    const outbox = new SyncOutbox(storage, () => 1_000);
    await outbox.enqueue(bookMutation());
    const [record] = await outbox.getAll('user-1');
    await storage.putMany([
      {
        ...record,
        status: 'failed',
        retryCount: 5,
        leaseOwner: 'engine-a',
        leaseExpiresAt: 2_000,
        lastError: 'still owned',
      },
    ]);

    await expect(outbox.recoverFailed({ userId: 'user-1', now: 1_500 })).resolves.toEqual([]);
    await expect(outbox.getAll('user-1')).resolves.toMatchObject([
      {
        id: 'mutation-1',
        status: 'failed',
        retryCount: 5,
        leaseOwner: 'engine-a',
        leaseExpiresAt: 2_000,
        lastError: 'still owned',
      },
    ]);
  });

  it('reclaims expired pushing leases without manual reset', async () => {
    let now = 1_000;
    const outbox = new SyncOutbox(new MemorySyncOutboxStorage(), () => now);
    await outbox.enqueue(bookMutation());
    await outbox.claimPending({
      userId: 'user-1',
      leaseOwner: 'dead-engine',
      leaseDurationMs: 500,
    });

    await expect(outbox.claimPending({ userId: 'user-1', now: 1_499 })).resolves.toHaveLength(0);

    now = 1_500;
    const [reclaimed] = await outbox.claimPending({
      userId: 'user-1',
      leaseOwner: 'recovery-engine',
      leaseDurationMs: 500,
    });

    expect(reclaimed).toMatchObject({
      id: 'mutation-1',
      status: 'pushing',
      leaseOwner: 'recovery-engine',
      leaseExpiresAt: 2_000,
    });
  });

  it('stores first-class delete tombstone mutations without full payload hydration', async () => {
    const outbox = new SyncOutbox(new MemorySyncOutboxStorage(), () => 1_000);
    await outbox.enqueue({
      id: 'delete-1',
      entity: 'book',
      entityId: 'd41d8cd98f00b204e9800998ecf8427e',
      op: 'delete',
      baseRevision: 'rev-1',
      userId: 'user-1',
      deviceId: 'device-1',
      clientUpdatedAt: 100,
      tombstone: { deletedAt: 100 },
    });

    const [stored] = await outbox.getAll('user-1');
    expect(stored.op).toBe('delete');
    expect(stored).toHaveProperty('tombstone', { deletedAt: 100 });
    expect(stored).not.toHaveProperty('payload');
  });

  it('acknowledges accepted claimed mutations by removing them from the outbox', async () => {
    const outbox = new SyncOutbox(new MemorySyncOutboxStorage(), () => 1_000);
    await outbox.enqueue(bookMutation());
    await outbox.claimPending({ userId: 'user-1', leaseOwner: 'engine-a' });

    await expect(outbox.acknowledgeClaimed(['mutation-1'], 'engine-a')).resolves.toEqual([
      'mutation-1',
    ]);

    await expect(outbox.getAll('user-1')).resolves.toHaveLength(0);
  });

  it('ignores stale completion attempts after lease ownership transfers', async () => {
    let now = 1_000;
    const outbox = new SyncOutbox(new MemorySyncOutboxStorage(), () => now);
    await outbox.enqueue(bookMutation());
    await outbox.claimPending({
      userId: 'user-1',
      leaseOwner: 'engine-a',
      leaseDurationMs: 500,
    });
    now = 1_500;
    await outbox.claimPending({
      userId: 'user-1',
      leaseOwner: 'engine-b',
      leaseDurationMs: 500,
    });

    await expect(outbox.acknowledgeClaimed(['mutation-1'], 'engine-a')).resolves.toEqual([]);
    await expect(
      outbox.recordClaimFailure(['mutation-1'], 'engine-a', 'late failure'),
    ).resolves.toEqual([]);
    await expect(
      outbox.markClaimFailed(['mutation-1'], 'engine-a', 'late conflict'),
    ).resolves.toEqual([]);

    await expect(outbox.getAll('user-1')).resolves.toMatchObject([
      {
        id: 'mutation-1',
        status: 'pushing',
        retryCount: 0,
        leaseOwner: 'engine-b',
        leaseExpiresAt: 2_000,
        lastError: null,
      },
    ]);
  });
});
