import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const { mockLoggerWarn } = vi.hoisted(() => ({
  mockLoggerWarn: vi.fn(),
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
    enqueueBatch: vi.fn(),
  },
}));

vi.mock('@/services/sync/syncWorker', () => ({
  syncWorker: {
    currentUserId: 'user-1',
    syncNow: vi.fn(),
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
  it('keeps app source free of bare void enqueue*ForSync fire-and-forget calls', () => {
    const offenders = walkSourceFiles(join(process.cwd(), 'src')).flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return /void\s+enqueue\w+ForSync\(/.test(text) ? [file.replace(`${process.cwd()}/`, '')] : [];
    });

    expect(offenders).toEqual([]);
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
