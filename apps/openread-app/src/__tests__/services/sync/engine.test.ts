import { testSyncableBookRef } from '../../utils/bookIdentityFixtures';
import { describe, expect, it, vi } from 'vitest';
import type {
  SyncPushRequest,
  SyncPushResponse,
  SyncUpsertMutation,
} from '@openread/sync/protocol';

import { SyncEngine, type SyncTransport } from '@/services/sync/engine';
import {
  MemorySyncOutboxStorage,
  type StoredSyncMutation,
  SyncOutbox,
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

const createEngine = (transport: SyncTransport, now = 1_000) => {
  const outbox = new SyncOutbox(new MemorySyncOutboxStorage(), () => now);
  const engine = new SyncEngine({ userId: 'user-1', deviceId: 'device-1', outbox, transport });
  return { engine, outbox };
};

describe('canonical SyncEngine skeleton', () => {
  it('drains pending outbox mutations through the injected canonical transport', async () => {
    const push = vi.fn(async (request: SyncPushRequest): Promise<SyncPushResponse> => {
      return {
        accepted: request.mutations.map((mutation) => ({
          mutationId: mutation.id,
          entity: mutation.entity,
          entityId: mutation.entityId,
          serverRevision: 'server-rev-2',
          serverUpdatedAt: 200,
        })),
        conflicts: [],
      };
    });
    const transport: SyncTransport = { push };
    const { engine, outbox } = createEngine(transport);
    const enqueuedRecord = await engine.enqueue(bookMutation());

    const result = await engine.drainOnce();

    expect(result).toEqual({ attempted: 1, accepted: 1, conflicted: 0, failed: 0, remaining: 0 });
    const receivedRequest = push.mock.calls[0]?.[0];
    expect(receivedRequest).toMatchObject({
      protocolVersion: 1,
      userId: 'user-1',
      deviceId: 'device-1',
    });
    expect(receivedRequest?.mutations[0]).toMatchObject({
      id: 'mutation-1',
      baseRevision: 'rev-1',
    });
    expect(receivedRequest?.mutations[0]).not.toHaveProperty('status');
    await expect(outbox.getAll('user-1')).resolves.toHaveLength(0);
    await expect(engine.resolveDelivery([enqueuedRecord], enqueuedRecord.userId)).resolves.toEqual({
      status: 'accepted',
      mutationIds: ['mutation-1'],
      acceptedMutationIds: ['mutation-1'],
      pendingMutationIds: [],
      failedMutationIds: [],
    });
  });

  it('durably claims pending batches so two engine instances do not duplicate pushes', async () => {
    const records = new Map<string, StoredSyncMutation>();
    const outboxA = new SyncOutbox(new MemorySyncOutboxStorage(records), () => 1_000);
    const outboxB = new SyncOutbox(new MemorySyncOutboxStorage(records), () => 1_000);
    await outboxA.enqueue(bookMutation());

    let resolvePush!: (response: SyncPushResponse) => void;
    const pushA = vi.fn(
      (): Promise<SyncPushResponse> =>
        new Promise((resolve) => {
          resolvePush = resolve;
        }),
    );
    const pushB = vi.fn(async (): Promise<SyncPushResponse> => ({ accepted: [], conflicts: [] }));
    const engineA = new SyncEngine({
      userId: 'user-1',
      deviceId: 'device-1',
      outbox: outboxA,
      transport: { push: pushA },
      claimOwner: 'engine-a',
    });
    const engineB = new SyncEngine({
      userId: 'user-1',
      deviceId: 'device-1',
      outbox: outboxB,
      transport: { push: pushB },
      claimOwner: 'engine-b',
    });

    const firstDrain = engineA.drainOnce();
    await vi.waitFor(() => expect(pushA).toHaveBeenCalledTimes(1));
    await expect(engineB.drainOnce()).resolves.toEqual({
      attempted: 0,
      accepted: 0,
      conflicted: 0,
      failed: 0,
      remaining: 0,
    });
    expect(pushB).not.toHaveBeenCalled();

    resolvePush({
      accepted: [
        {
          mutationId: 'mutation-1',
          entity: 'book',
          entityId: 'd41d8cd98f00b204e9800998ecf8427e',
          serverRevision: 'rev-2',
          serverUpdatedAt: 200,
        },
      ],
      conflicts: [],
    });

    await expect(firstDrain).resolves.toEqual({
      attempted: 1,
      accepted: 1,
      conflicted: 0,
      failed: 0,
      remaining: 0,
    });
  });

  it('resolves acceptance from durable absence after a separate engine acknowledges the row', async () => {
    const records = new Map<string, StoredSyncMutation>();
    const outboxA = new SyncOutbox(new MemorySyncOutboxStorage(records), () => 1_000);
    const outboxB = new SyncOutbox(new MemorySyncOutboxStorage(records), () => 1_000);
    const enqueuedRecord = await outboxA.enqueue(bookMutation());
    const engineA = new SyncEngine({
      userId: 'user-1',
      deviceId: 'device-1',
      outbox: outboxA,
    });
    const engineB = new SyncEngine({
      userId: 'user-1',
      deviceId: 'device-2',
      outbox: outboxB,
      transport: {
        push: async (request) => ({
          accepted: request.mutations.map((mutation) => ({
            mutationId: mutation.id,
            entity: mutation.entity,
            entityId: mutation.entityId,
            serverRevision: 'server-rev-2',
            serverUpdatedAt: 200,
          })),
          conflicts: [],
        }),
      },
    });

    await expect(engineB.drainOnce()).resolves.toMatchObject({ accepted: 1, remaining: 0 });
    await expect(engineA.resolveDelivery([enqueuedRecord], enqueuedRecord.userId)).resolves.toEqual(
      {
        status: 'accepted',
        mutationIds: ['mutation-1'],
        acceptedMutationIds: ['mutation-1'],
        pendingMutationIds: [],
        failedMutationIds: [],
      },
    );
  });

  it('fails closed when exact enqueue proof belongs to another user', async () => {
    const transport: SyncTransport = {
      push: vi.fn(async (): Promise<SyncPushResponse> => ({ accepted: [], conflicts: [] })),
    };
    const { engine } = createEngine(transport);
    const enqueuedRecord = await engine.enqueue(bookMutation());

    await expect(
      engine.resolveDelivery([enqueuedRecord], 'user-2' as typeof enqueuedRecord.userId),
    ).rejects.toMatchObject({
      failedMutationIds: [],
      unknownMutationIds: ['mutation-1'],
    });
  });

  it('reclaims expired pushing leases on later drain after crash or close', async () => {
    let now = 1_000;
    const outbox = new SyncOutbox(new MemorySyncOutboxStorage(), () => now);
    await outbox.enqueue(bookMutation());
    await outbox.claimPending({
      userId: 'user-1',
      leaseOwner: 'closed-engine',
      leaseDurationMs: 500,
    });
    now = 1_500;

    const push = vi.fn(async (request: SyncPushRequest): Promise<SyncPushResponse> => {
      expect(request.mutations.map((mutation) => mutation.id)).toEqual(['mutation-1']);
      return {
        accepted: [
          {
            mutationId: 'mutation-1',
            entity: 'book',
            entityId: 'd41d8cd98f00b204e9800998ecf8427e',
            serverRevision: 'rev-2',
            serverUpdatedAt: 200,
          },
        ],
        conflicts: [],
      };
    });
    const engine = new SyncEngine({
      userId: 'user-1',
      deviceId: 'device-1',
      outbox,
      transport: { push },
      claimOwner: 'recovery-engine',
      claimLeaseDurationMs: 500,
    });

    await expect(engine.drainOnce()).resolves.toEqual({
      attempted: 1,
      accepted: 1,
      conflicted: 0,
      failed: 0,
      remaining: 0,
    });
    await expect(outbox.getAll('user-1')).resolves.toHaveLength(0);
  });

  it('only applies server acknowledgements to the current drain batch', async () => {
    const push = vi.fn(async (request: SyncPushRequest): Promise<SyncPushResponse> => {
      expect(request.mutations.map((mutation) => mutation.id)).toEqual(['mutation-1']);
      return {
        accepted: [
          {
            mutationId: 'mutation-1',
            entity: 'book',
            entityId: 'd41d8cd98f00b204e9800998ecf8427e',
            serverRevision: 'server-rev-2',
            serverUpdatedAt: 200,
          },
          {
            mutationId: 'mutation-2',
            entity: 'book',
            entityId: '0123456789abcdef0123456789abcdef',
            serverRevision: 'server-rev-2',
            serverUpdatedAt: 200,
          },
        ],
        conflicts: [],
      };
    });
    const storage = new MemorySyncOutboxStorage();
    const outbox = new SyncOutbox(storage, () => 1_000);
    const engine = new SyncEngine({
      userId: 'user-1',
      deviceId: 'device-1',
      outbox,
      transport: { push },
    });
    await engine.enqueue(bookMutation());
    await storage.putMany([
      {
        ...bookMutation({
          id: 'mutation-2',
          entityId: '0123456789abcdef0123456789abcdef',
          payload: {
            hash: testSyncableBookRef('0123456789abcdef0123456789abcdef'),
            title: 'Book 2',
            updatedAt: 100,
          },
        }),
        status: 'pending',
        retryCount: 1,
        createdAt: 1_001,
        updatedAt: 1_001,
        nextAttemptAt: 2_000,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: 'previous offline',
      },
    ]);

    const result = await engine.drainOnce();

    expect(result).toEqual({ attempted: 1, accepted: 1, conflicted: 0, failed: 0, remaining: 0 });
    expect(await outbox.getAll('user-1')).toMatchObject([
      { id: 'mutation-2', status: 'pending', lastError: 'previous offline' },
    ]);
  });

  it('does not let a stale expired owner complete a row reclaimed by another engine', async () => {
    let now = 1_000;
    const records = new Map<string, StoredSyncMutation>();
    const outboxA = new SyncOutbox(new MemorySyncOutboxStorage(records), () => now);
    const outboxB = new SyncOutbox(new MemorySyncOutboxStorage(records), () => now);
    await outboxA.enqueue(bookMutation());

    let resolvePushA!: (response: SyncPushResponse) => void;
    let resolvePushB!: (response: SyncPushResponse) => void;
    const pushA = vi.fn(
      (): Promise<SyncPushResponse> =>
        new Promise((resolve) => {
          resolvePushA = resolve;
        }),
    );
    const pushB = vi.fn(
      (): Promise<SyncPushResponse> =>
        new Promise((resolve) => {
          resolvePushB = resolve;
        }),
    );
    const engineA = new SyncEngine({
      userId: 'user-1',
      deviceId: 'device-1',
      outbox: outboxA,
      transport: { push: pushA },
      claimOwner: 'engine-a',
      claimLeaseDurationMs: 500,
    });
    const engineB = new SyncEngine({
      userId: 'user-1',
      deviceId: 'device-1',
      outbox: outboxB,
      transport: { push: pushB },
      claimOwner: 'engine-b',
      claimLeaseDurationMs: 500,
    });

    const firstDrain = engineA.drainOnce();
    await vi.waitFor(() => expect(pushA).toHaveBeenCalledTimes(1));
    now = 1_500;
    const secondDrain = engineB.drainOnce();
    await vi.waitFor(() => expect(pushB).toHaveBeenCalledTimes(1));

    resolvePushA({
      accepted: [
        {
          mutationId: 'mutation-1',
          entity: 'book',
          entityId: 'd41d8cd98f00b204e9800998ecf8427e',
          serverRevision: 'rev-2',
          serverUpdatedAt: 200,
        },
      ],
      conflicts: [],
    });

    await expect(firstDrain).resolves.toEqual({
      attempted: 1,
      accepted: 0,
      conflicted: 0,
      failed: 0,
      remaining: 0,
    });
    await expect(outboxA.getAll('user-1')).resolves.toMatchObject([
      {
        id: 'mutation-1',
        status: 'pushing',
        retryCount: 0,
        leaseOwner: 'engine-b',
        lastError: null,
      },
    ]);

    resolvePushB({
      accepted: [
        {
          mutationId: 'mutation-1',
          entity: 'book',
          entityId: 'd41d8cd98f00b204e9800998ecf8427e',
          serverRevision: 'rev-3',
          serverUpdatedAt: 300,
        },
      ],
      conflicts: [],
    });

    await expect(secondDrain).resolves.toEqual({
      attempted: 1,
      accepted: 1,
      conflicted: 0,
      failed: 0,
      remaining: 0,
    });
    await expect(outboxA.getAll('user-1')).resolves.toHaveLength(0);
  });

  it('does not let a stale expired owner fail a row reclaimed by another engine', async () => {
    let now = 1_000;
    const records = new Map<string, StoredSyncMutation>();
    const outboxA = new SyncOutbox(new MemorySyncOutboxStorage(records), () => now);
    const outboxB = new SyncOutbox(new MemorySyncOutboxStorage(records), () => now);
    await outboxA.enqueue(bookMutation());

    let rejectPushA!: (error: Error) => void;
    let resolvePushB!: (response: SyncPushResponse) => void;
    const pushA = vi.fn(
      (): Promise<SyncPushResponse> =>
        new Promise((_resolve, reject) => {
          rejectPushA = reject;
        }),
    );
    const pushB = vi.fn(
      (): Promise<SyncPushResponse> =>
        new Promise((resolve) => {
          resolvePushB = resolve;
        }),
    );
    const engineA = new SyncEngine({
      userId: 'user-1',
      deviceId: 'device-1',
      outbox: outboxA,
      transport: { push: pushA },
      claimOwner: 'engine-a',
      claimLeaseDurationMs: 500,
    });
    const engineB = new SyncEngine({
      userId: 'user-1',
      deviceId: 'device-1',
      outbox: outboxB,
      transport: { push: pushB },
      claimOwner: 'engine-b',
      claimLeaseDurationMs: 500,
    });

    const firstDrain = engineA.drainOnce();
    await vi.waitFor(() => expect(pushA).toHaveBeenCalledTimes(1));
    now = 1_500;
    const secondDrain = engineB.drainOnce();
    await vi.waitFor(() => expect(pushB).toHaveBeenCalledTimes(1));

    rejectPushA(new Error('late offline'));

    await expect(firstDrain).resolves.toEqual({
      attempted: 1,
      accepted: 0,
      conflicted: 0,
      failed: 0,
      remaining: 0,
    });
    await expect(outboxA.getAll('user-1')).resolves.toMatchObject([
      {
        id: 'mutation-1',
        status: 'pushing',
        retryCount: 0,
        leaseOwner: 'engine-b',
        lastError: null,
      },
    ]);

    resolvePushB({
      accepted: [
        {
          mutationId: 'mutation-1',
          entity: 'book',
          entityId: 'd41d8cd98f00b204e9800998ecf8427e',
          serverRevision: 'rev-2',
          serverUpdatedAt: 200,
        },
      ],
      conflicts: [],
    });

    await expect(secondDrain).resolves.toEqual({
      attempted: 1,
      accepted: 1,
      conflicted: 0,
      failed: 0,
      remaining: 0,
    });
  });

  it('marks conflicts as failed for adapter-level reconciliation instead of retry loops', async () => {
    const transport: SyncTransport = {
      push: vi.fn(
        async (request: SyncPushRequest): Promise<SyncPushResponse> => ({
          accepted: [],
          conflicts: request.mutations.map((mutation) => ({
            mutationId: mutation.id,
            entity: mutation.entity,
            entityId: mutation.entityId,
            reason: 'stale-client' as const,
            message: 'stale baseRevision',
          })),
        }),
      ),
    };
    const { engine, outbox } = createEngine(transport);
    const enqueuedRecord = await engine.enqueue(bookMutation());

    const result = await engine.drainOnce();

    expect(result).toEqual({ attempted: 1, accepted: 0, conflicted: 1, failed: 0, remaining: 0 });
    const records = await outbox.getAll('user-1');
    expect(records[0]).toMatchObject({
      status: 'failed',
      lastError: 'Server rejected sync mutation',
    });
    await expect(engine.resolveDelivery([enqueuedRecord], enqueuedRecord.userId)).resolves.toEqual({
      status: 'failed',
      mutationIds: ['mutation-1'],
      acceptedMutationIds: [],
      pendingMutationIds: [],
      failedMutationIds: ['mutation-1'],
    });
  });

  it('keeps a pending row across engine restart and pushes it exactly once on retry', async () => {
    let now = 1_000;
    const records = new Map<string, StoredSyncMutation>();
    const outboxA = new SyncOutbox(new MemorySyncOutboxStorage(records), () => now);
    const enqueuedRecord = await outboxA.enqueue(bookMutation());
    const firstPush = vi.fn(async (): Promise<SyncPushResponse> => {
      throw new Error('offline');
    });
    const engineA = new SyncEngine({
      userId: 'user-1',
      deviceId: 'device-1',
      outbox: outboxA,
      transport: { push: firstPush },
      retryBackoffMs: 1_000,
    });

    await expect(engineA.drainOnce()).resolves.toMatchObject({ accepted: 0, failed: 1 });
    await expect(outboxA.getAll('user-1')).resolves.toMatchObject([
      { id: enqueuedRecord.id, status: 'pending', nextAttemptAt: 2_000 },
    ]);

    now = 2_000;
    const outboxB = new SyncOutbox(new MemorySyncOutboxStorage(records), () => now);
    const secondPush = vi.fn(
      async (request: SyncPushRequest): Promise<SyncPushResponse> => ({
        accepted: request.mutations.map((mutation) => ({
          mutationId: mutation.id,
          entity: mutation.entity,
          entityId: mutation.entityId,
          serverRevision: 'server-rev-retry',
          serverUpdatedAt: now,
        })),
        conflicts: [],
      }),
    );
    const engineB = new SyncEngine({
      userId: 'user-1',
      deviceId: 'device-2',
      outbox: outboxB,
      transport: { push: secondPush },
    });

    await expect(engineB.drainOnce()).resolves.toMatchObject({ accepted: 1, remaining: 0 });
    expect(firstPush).toHaveBeenCalledTimes(1);
    expect(secondPush).toHaveBeenCalledTimes(1);
    await expect(outboxB.getAll('user-1')).resolves.toHaveLength(0);
    await expect(engineB.resolveDelivery([enqueuedRecord], enqueuedRecord.userId)).resolves.toEqual(
      {
        status: 'accepted',
        mutationIds: [enqueuedRecord.id],
        acceptedMutationIds: [enqueuedRecord.id],
        pendingMutationIds: [],
        failedMutationIds: [],
      },
    );
  });

  it('reports an exact actively pushing durable record as pending', async () => {
    const outbox = new SyncOutbox(new MemorySyncOutboxStorage(), () => 1_000);
    const enqueuedRecord = await outbox.enqueue(bookMutation());
    await outbox.claimPending({
      userId: enqueuedRecord.userId,
      leaseOwner: 'other-engine',
      leaseDurationMs: 30_000,
    });
    const engine = new SyncEngine({
      userId: 'user-1',
      deviceId: 'device-1',
      outbox,
    });

    await expect(engine.resolveDelivery([enqueuedRecord], enqueuedRecord.userId)).resolves.toEqual({
      status: 'pending',
      mutationIds: ['mutation-1'],
      acceptedMutationIds: [],
      pendingMutationIds: ['mutation-1'],
      failedMutationIds: [],
    });
  });

  it('backs off retryable transport failures and keeps mutations pending', async () => {
    const transport: SyncTransport = {
      push: vi.fn(async (): Promise<SyncPushResponse> => Promise.reject(new Error('offline'))),
    };
    const { engine, outbox } = createEngine(transport, 1_000);
    const enqueuedRecord = await engine.enqueue(bookMutation());

    const result = await engine.drainOnce();

    expect(result).toEqual({ attempted: 1, accepted: 0, conflicted: 0, failed: 1, remaining: 0 });
    const records = await outbox.getAll('user-1');
    expect(records[0]).toMatchObject({ status: 'pending', retryCount: 1, lastError: 'offline' });
    expect(engine.status.lastError).toBe('offline');
    await expect(engine.resolveDelivery([enqueuedRecord], enqueuedRecord.userId)).resolves.toEqual({
      status: 'pending',
      mutationIds: ['mutation-1'],
      acceptedMutationIds: [],
      pendingMutationIds: ['mutation-1'],
      failedMutationIds: [],
    });
  });

  it('coalesces concurrent drain requests into one transport push', async () => {
    let resolvePush!: (response: SyncPushResponse) => void;
    const transport: SyncTransport = {
      push: vi.fn(
        (): Promise<SyncPushResponse> =>
          new Promise((resolve) => {
            resolvePush = resolve;
          }),
      ),
    };
    const { engine } = createEngine(transport);
    await engine.enqueue(bookMutation());

    const first = engine.drainOnce();
    const second = engine.drainOnce();
    await vi.waitFor(() => expect(transport.push).toHaveBeenCalledTimes(1));

    resolvePush({
      accepted: [
        {
          mutationId: 'mutation-1',
          entity: 'book',
          entityId: 'd41d8cd98f00b204e9800998ecf8427e',
          serverRevision: 'rev-2',
          serverUpdatedAt: 200,
        },
      ],
      conflicts: [],
    });

    await expect(first).resolves.toEqual({
      attempted: 1,
      accepted: 1,
      conflicted: 0,
      failed: 0,
      remaining: 0,
    });
    await expect(second).resolves.toEqual({
      attempted: 1,
      accepted: 1,
      conflicted: 0,
      failed: 0,
      remaining: 0,
    });
  });
});
