import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { testOpenReadBookRef } from '../../utils/bookIdentityFixtures';

const { mockLoggerWarn, mockEnqueueBatch, mockSyncNow, mockSyncWorkerState } = vi.hoisted(() => ({
  mockLoggerWarn: vi.fn(),
  mockEnqueueBatch: vi.fn(),
  mockSyncNow: vi.fn(),
  mockSyncWorkerState: { currentUserId: 'user-1' as string | null },
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    warn: mockLoggerWarn,
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@/services/deviceService', () => ({
  getDeviceId: () => 'device-1',
}));

vi.mock('@/services/sync/outbox', () => ({
  syncOutbox: {
    enqueueBatch: mockEnqueueBatch,
  },
}));

vi.mock('@/services/sync/syncWorker', () => ({
  syncWorker: {
    get currentUserId() {
      return mockSyncWorkerState.currentUserId;
    },
    syncNow: mockSyncNow,
  },
}));

function walkSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__') continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...walkSourceFiles(path));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

describe('sync helpers fire-and-forget enqueue handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSyncWorkerState.currentUserId = 'user-1';
    mockEnqueueBatch.mockResolvedValue([]);
    mockSyncNow.mockResolvedValue(undefined);
  });

  it('keeps app source free of bare void enqueue*ForSync fire-and-forget calls', () => {
    const offenders = walkSourceFiles(join(process.cwd(), 'src')).flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return /void\s+enqueue\w+ForSync\(/.test(text) ? [file.replace(`${process.cwd()}/`, '')] : [];
    });

    expect(offenders).toEqual([]);
  });

  it('fails closed when a deletion has no authenticated sync user context', async () => {
    const { enqueueBookForSync, SyncMutationContextUnavailableError } =
      await import('@/services/sync/helpers');
    mockSyncWorkerState.currentUserId = null;

    await expect(
      enqueueBookForSync({
        hash: testOpenReadBookRef('d41d8cd98f00b204e9800998ecf8427e'),
        title: 'Delete me',
        author: 'Test Author',
        format: 'epub',
        createdAt: 1,
        updatedAt: 2,
        deletedAt: 2,
      }),
    ).rejects.toBeInstanceOf(SyncMutationContextUnavailableError);

    expect(mockEnqueueBatch).not.toHaveBeenCalled();
    expect(mockSyncNow).not.toHaveBeenCalled();
  });

  it('fails closed before enqueue when the expected deletion user changed', async () => {
    const { enqueueBookForSync, SyncMutationContextUnavailableError } =
      await import('@/services/sync/helpers');
    mockSyncWorkerState.currentUserId = 'user-2';

    await expect(
      enqueueBookForSync(
        {
          hash: testOpenReadBookRef('d41d8cd98f00b204e9800998ecf8427e'),
          title: 'Delete me',
          author: 'Test Author',
          format: 'epub',
          createdAt: 1,
          updatedAt: 2,
          deletedAt: 2,
        },
        'user-1',
      ),
    ).rejects.toBeInstanceOf(SyncMutationContextUnavailableError);

    expect(mockEnqueueBatch).not.toHaveBeenCalled();
    expect(mockSyncNow).not.toHaveBeenCalled();
  });

  it('preserves a pre-durable enqueue persistence failure without starting a drain', async () => {
    const { enqueueBookForSync } = await import('@/services/sync/helpers');
    const error = new Error('IndexedDB unavailable');
    mockEnqueueBatch.mockRejectedValueOnce(error);

    await expect(
      enqueueBookForSync({
        hash: testOpenReadBookRef('d41d8cd98f00b204e9800998ecf8427e'),
        title: 'Delete me',
        author: 'Test Author',
        format: 'epub',
        createdAt: 1,
        updatedAt: 2,
        deletedAt: 2,
      }),
    ).rejects.toBe(error);

    expect(mockSyncNow).not.toHaveBeenCalled();
  });

  it('returns the exact typed delivery result for the durable mutation record', async () => {
    const { enqueueBookForSync } = await import('@/services/sync/helpers');
    const accepted = {
      status: 'accepted' as const,
      mutationIds: ['mutation-delete'],
      acceptedMutationIds: ['mutation-delete'],
      pendingMutationIds: [],
      failedMutationIds: [],
    };
    const enqueuedRecord = { id: 'mutation-delete', userId: 'user-1' };
    mockEnqueueBatch.mockResolvedValueOnce([enqueuedRecord]);
    mockSyncNow.mockResolvedValueOnce(accepted);

    await expect(
      enqueueBookForSync({
        hash: testOpenReadBookRef('d41d8cd98f00b204e9800998ecf8427e'),
        title: 'Delete me',
        author: 'Test Author',
        format: 'epub',
        createdAt: 1,
        updatedAt: 2,
        deletedAt: 2,
      }),
    ).resolves.toEqual(accepted);

    expect(mockSyncNow).toHaveBeenCalledWith([enqueuedRecord], 'user-1');
  });

  it('fails closed with exact IDs when post-enqueue delivery resolution throws unexpectedly', async () => {
    const { enqueueBookForSync, SyncMutationContextUnavailableError } =
      await import('@/services/sync/helpers');
    const { SyncMutationDeliveryError } = await import('@/services/sync/engine');
    const enqueuedRecord = { id: 'mutation-unknown', userId: 'user-1' };
    mockEnqueueBatch.mockResolvedValueOnce([enqueuedRecord]);
    mockSyncNow.mockRejectedValueOnce(new Error('durable read unavailable'));

    const result = enqueueBookForSync({
      hash: testOpenReadBookRef('d41d8cd98f00b204e9800998ecf8427e'),
      title: 'Delete me',
      author: 'Test Author',
      format: 'epub',
      createdAt: 1,
      updatedAt: 2,
      deletedAt: 2,
    });

    await expect(result).rejects.toBeInstanceOf(SyncMutationDeliveryError);
    await expect(result).rejects.not.toBeInstanceOf(SyncMutationContextUnavailableError);
    await expect(result).rejects.toMatchObject({ unknownMutationIds: ['mutation-unknown'] });
  });

  it('returns a truthful failed result for an exact durable deletion record', async () => {
    const { enqueueBookForSync } = await import('@/services/sync/helpers');
    const enqueuedRecord = { id: 'mutation-failed', userId: 'user-1' };
    const failed = {
      status: 'failed' as const,
      mutationIds: ['mutation-failed'],
      acceptedMutationIds: [],
      pendingMutationIds: [],
      failedMutationIds: ['mutation-failed'],
    };
    mockEnqueueBatch.mockResolvedValueOnce([enqueuedRecord]);
    mockSyncNow.mockResolvedValueOnce(failed);

    await expect(
      enqueueBookForSync({
        hash: testOpenReadBookRef('d41d8cd98f00b204e9800998ecf8427e'),
        title: 'Delete me',
        author: 'Test Author',
        format: 'epub',
        createdAt: 1,
        updatedAt: 2,
        deletedAt: 2,
      }),
    ).resolves.toEqual(failed);

    expect(mockSyncNow).toHaveBeenCalledWith([enqueuedRecord], 'user-1');
  });

  it('preserves unauthenticated local-only upserts', async () => {
    const { enqueueBookForSync } = await import('@/services/sync/helpers');
    mockSyncWorkerState.currentUserId = null;

    await expect(
      enqueueBookForSync({
        hash: testOpenReadBookRef('d41d8cd98f00b204e9800998ecf8427e'),
        title: 'Local book',
        author: 'Test Author',
        format: 'epub',
        createdAt: 1,
        updatedAt: 2,
      }),
    ).resolves.toBeUndefined();

    expect(mockEnqueueBatch).not.toHaveBeenCalled();
  });

  it('logs rejected background sync enqueue promises without rethrowing', async () => {
    const { handleFireAndForgetSyncEnqueue } = await import('@/services/sync/helpers');
    const error = new Error('outbox unavailable');

    handleFireAndForgetSyncEnqueue(Promise.reject(error), {
      source: 'book-actions.setReadingStatus',
      mutationType: 'book',
      operation: 'upsert',
      hasBookHash: true,
      count: 1,
    });

    await vi.waitFor(() => {
      expect(mockLoggerWarn).toHaveBeenCalledWith('Fire-and-forget sync enqueue failed', {
        source: 'book-actions.setReadingStatus',
        mutationType: 'book',
        operation: 'upsert',
        hasBookHash: true,
        count: 1,
        error,
      });
    });
  });
});
