import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OfflineQueue } from '@/services/sync/offlineQueue';
import type { QueueItem } from '@/services/sync/offlineQueue';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockStorage = new Map<string, string>();

vi.stubGlobal('localStorage', {
  getItem: (key: string) => mockStorage.get(key) ?? null,
  setItem: (key: string, value: string) => mockStorage.set(key, value),
  removeItem: (key: string) => mockStorage.delete(key),
});

let uuidCounter = 0;
vi.stubGlobal('crypto', {
  randomUUID: () => `test-uuid-${++uuidCounter}`,
});

// Suppress console.error from the queue's internal error handling
vi.spyOn(console, 'error').mockImplementation(() => {});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'openread_sync_queue';

function rawQueue(): QueueItem[] {
  const raw = mockStorage.get(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OfflineQueue', () => {
  let queue: OfflineQueue;

  beforeEach(() => {
    mockStorage.clear();
    uuidCounter = 0;
    queue = new OfflineQueue();
  });

  // -----------------------------------------------------------------------
  // enqueue()
  // -----------------------------------------------------------------------

  describe('enqueue()', () => {
    it('adds an item to the queue and persists to localStorage', () => {
      queue.enqueue({ type: 'book', action: 'upsert', payload: { id: 'b1' } });

      const stored = rawQueue();
      expect(stored).toHaveLength(1);
      expect(stored[0].type).toBe('book');
      expect(stored[0].action).toBe('upsert');
      expect(stored[0].payload).toEqual({ id: 'b1' });
    });

    it('creates items with correct initial state (status pending, retries 0)', () => {
      queue.enqueue({ type: 'config', action: 'upsert', payload: { theme: 'dark' } });

      const item = rawQueue()[0];
      expect(item.status).toBe('pending');
      expect(item.retries).toBe(0);
      expect(item.maxRetries).toBe(5);
      expect(item.id).toBe('test-uuid-1');
      expect(typeof item.createdAt).toBe('number');
    });

    it('multiple items maintain insertion order', () => {
      queue.enqueue({ type: 'book', action: 'upsert', payload: { id: 'b1' } });
      queue.enqueue({ type: 'note', action: 'delete', payload: { id: 'n1' } });
      queue.enqueue({ type: 'config', action: 'upsert', payload: { key: 'v' } });

      const items = rawQueue();
      expect(items).toHaveLength(3);
      expect(items[0].id).toBe('test-uuid-1');
      expect(items[1].id).toBe('test-uuid-2');
      expect(items[2].id).toBe('test-uuid-3');
      expect(items[0].type).toBe('book');
      expect(items[1].type).toBe('note');
      expect(items[2].type).toBe('config');
    });
  });

  // -----------------------------------------------------------------------
  // getPending()
  // -----------------------------------------------------------------------

  describe('getPending()', () => {
    it('returns only items with status pending', () => {
      queue.enqueue({ type: 'book', action: 'upsert', payload: { id: 'b1' } });
      queue.enqueue({ type: 'book', action: 'upsert', payload: { id: 'b2' } });

      const items = rawQueue();
      items[0].status = 'failed';
      mockStorage.set(STORAGE_KEY, JSON.stringify(items));

      const pending = queue.getPending();
      expect(pending).toHaveLength(1);
      expect(pending[0].payload).toEqual({ id: 'b2' });
    });

    it('does not return failed items', () => {
      queue.enqueue({ type: 'book', action: 'upsert', payload: { id: 'b1' } });

      const items = rawQueue();
      items[0].status = 'failed';
      mockStorage.set(STORAGE_KEY, JSON.stringify(items));

      expect(queue.getPending()).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // pendingCount
  // -----------------------------------------------------------------------

  describe('pendingCount', () => {
    it('returns correct count of pending items', () => {
      queue.enqueue({ type: 'book', action: 'upsert', payload: { id: 'b1' } });
      queue.enqueue({ type: 'note', action: 'upsert', payload: { id: 'n1' } });
      queue.enqueue({ type: 'config', action: 'upsert', payload: { key: 'v' } });

      expect(queue.pendingCount).toBe(3);
    });

    it('returns 0 for empty queue', () => {
      expect(queue.pendingCount).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // drain()
  // -----------------------------------------------------------------------

  describe('drain()', () => {
    it('successful handler removes item from queue and returns synced: 1', async () => {
      queue.enqueue({ type: 'book', action: 'upsert', payload: { id: 'b1' } });

      const handler = vi.fn().mockResolvedValue(true);
      const result = await queue.drain(handler);

      expect(result).toEqual({ synced: 1, failed: 0, remaining: 0 });
      expect(handler).toHaveBeenCalledTimes(1);
      expect(rawQueue()).toHaveLength(0);
    });

    it('failing handler (returns false) increments retries and keeps item as pending', async () => {
      queue.enqueue({ type: 'book', action: 'upsert', payload: { id: 'b1' } });

      const handler = vi.fn().mockResolvedValue(false);
      const result = await queue.drain(handler);

      expect(result).toEqual({ synced: 0, failed: 0, remaining: 1 });

      const items = rawQueue();
      expect(items).toHaveLength(1);
      expect(items[0].retries).toBe(1);
      expect(items[0].status).toBe('pending');
    });

    it('item transitions to failed after reaching maxRetries', async () => {
      queue.enqueue({ type: 'book', action: 'upsert', payload: { id: 'b1' } });

      const items = rawQueue();
      items[0].retries = 4; // maxRetries is 5
      mockStorage.set(STORAGE_KEY, JSON.stringify(items));

      const handler = vi.fn().mockResolvedValue(false);
      const result = await queue.drain(handler);

      expect(result).toEqual({ synced: 0, failed: 1, remaining: 1 });

      const stored = rawQueue();
      expect(stored).toHaveLength(1);
      expect(stored[0].status).toBe('failed');
      expect(stored[0].retries).toBe(5);
    });

    it('item transitions to failed after reaching maxRetries via thrown error', async () => {
      queue.enqueue({ type: 'book', action: 'upsert', payload: { id: 'b1' } });

      const items = rawQueue();
      items[0].retries = 4;
      mockStorage.set(STORAGE_KEY, JSON.stringify(items));

      const handler = vi.fn().mockRejectedValue(new Error('network error'));
      const result = await queue.drain(handler);

      expect(result).toEqual({ synced: 0, failed: 1, remaining: 1 });

      const stored = rawQueue();
      expect(stored[0].status).toBe('failed');
    });

    it('handles a mix of success and failure with correct counts', async () => {
      queue.enqueue({ type: 'book', action: 'upsert', payload: { id: 'b1' } });
      queue.enqueue({ type: 'book', action: 'upsert', payload: { id: 'b2' } });
      queue.enqueue({ type: 'note', action: 'delete', payload: { id: 'n1' } });

      const items = rawQueue();
      items[1].retries = 4; // b2 will hit maxRetries on next failure
      mockStorage.set(STORAGE_KEY, JSON.stringify(items));

      const handler = vi.fn().mockImplementation(async (item: QueueItem) => {
        return item.payload.id === 'b1';
      });

      const result = await queue.drain(handler);

      expect(result.synced).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.remaining).toBe(2);

      const stored = rawQueue();
      expect(stored).toHaveLength(2);

      const n1 = stored.find((i) => i.payload.id === 'n1');
      expect(n1).toBeDefined();
      expect(n1!.status).toBe('pending');
      expect(n1!.retries).toBe(1);

      const b2 = stored.find((i) => i.payload.id === 'b2');
      expect(b2).toBeDefined();
      expect(b2!.status).toBe('failed');
    });

    it('does not reprocess already-failed items', async () => {
      queue.enqueue({ type: 'book', action: 'upsert', payload: { id: 'b1' } });
      queue.enqueue({ type: 'book', action: 'upsert', payload: { id: 'b2' } });

      const items = rawQueue();
      items[0].status = 'failed';
      mockStorage.set(STORAGE_KEY, JSON.stringify(items));

      const handler = vi.fn().mockResolvedValue(true);
      const result = await queue.drain(handler);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ payload: { id: 'b2' } }));

      expect(result.synced).toBe(1);
      expect(result.remaining).toBe(1);
    });

    it('persists queue state after drain', async () => {
      queue.enqueue({ type: 'book', action: 'upsert', payload: { id: 'b1' } });
      queue.enqueue({ type: 'note', action: 'upsert', payload: { id: 'n1' } });

      const handler = vi.fn().mockImplementation(async (item: QueueItem) => {
        return item.payload.id === 'b1';
      });

      await queue.drain(handler);

      const stored = rawQueue();
      expect(stored).toHaveLength(1);
      expect(stored[0].payload).toEqual({ id: 'n1' });
      expect(stored[0].retries).toBe(1);
    });

    it('returns zeros when queue is empty', async () => {
      const handler = vi.fn().mockResolvedValue(true);
      const result = await queue.drain(handler);

      expect(result).toEqual({ synced: 0, failed: 0, remaining: 0 });
      expect(handler).not.toHaveBeenCalled();
    });

    it('returns zeros when all items are already failed', async () => {
      queue.enqueue({ type: 'book', action: 'upsert', payload: { id: 'b1' } });

      const items = rawQueue();
      items[0].status = 'failed';
      mockStorage.set(STORAGE_KEY, JSON.stringify(items));

      const handler = vi.fn().mockResolvedValue(true);
      const result = await queue.drain(handler);

      expect(result).toEqual({ synced: 0, failed: 0, remaining: 0 });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // clear()
  // -----------------------------------------------------------------------

  describe('clear()', () => {
    it('empties the entire queue', () => {
      queue.enqueue({ type: 'book', action: 'upsert', payload: { id: 'b1' } });
      queue.enqueue({ type: 'note', action: 'delete', payload: { id: 'n1' } });

      const items = rawQueue();
      items[0].status = 'failed';
      mockStorage.set(STORAGE_KEY, JSON.stringify(items));

      queue.clear();

      expect(rawQueue()).toHaveLength(0);
      expect(queue.pendingCount).toBe(0);
      expect(queue.getAll()).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // clearFailed()
  // -----------------------------------------------------------------------

  describe('clearFailed()', () => {
    it('removes only failed items and keeps pending', () => {
      queue.enqueue({ type: 'book', action: 'upsert', payload: { id: 'b1' } });
      queue.enqueue({ type: 'note', action: 'upsert', payload: { id: 'n1' } });
      queue.enqueue({ type: 'config', action: 'upsert', payload: { id: 'c1' } });

      const items = rawQueue();
      items[0].status = 'failed';
      items[2].status = 'failed';
      mockStorage.set(STORAGE_KEY, JSON.stringify(items));

      queue.clearFailed();

      const remaining = rawQueue();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].payload).toEqual({ id: 'n1' });
      expect(remaining[0].status).toBe('pending');
    });

    it('does nothing when there are no failed items', () => {
      queue.enqueue({ type: 'book', action: 'upsert', payload: { id: 'b1' } });

      queue.clearFailed();

      expect(rawQueue()).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // Corrupt localStorage
  // -----------------------------------------------------------------------

  describe('corrupt localStorage', () => {
    it('invalid JSON returns empty array and does not throw', () => {
      mockStorage.set(STORAGE_KEY, '{not-valid-json!!!');

      const pending = queue.getPending();
      expect(pending).toEqual([]);
      expect(queue.pendingCount).toBe(0);
    });

    it('enqueue works after corrupt data (overwrites with valid queue)', () => {
      mockStorage.set(STORAGE_KEY, 'totally broken');

      queue.enqueue({ type: 'book', action: 'upsert', payload: { id: 'b1' } });

      const items = rawQueue();
      expect(items).toHaveLength(1);
      expect(items[0].payload).toEqual({ id: 'b1' });
    });
  });

  // -----------------------------------------------------------------------
  // getAll()
  // -----------------------------------------------------------------------

  describe('getAll()', () => {
    it('returns both pending and failed items', () => {
      queue.enqueue({ type: 'book', action: 'upsert', payload: { id: 'b1' } });
      queue.enqueue({ type: 'note', action: 'upsert', payload: { id: 'n1' } });

      const items = rawQueue();
      items[0].status = 'failed';
      mockStorage.set(STORAGE_KEY, JSON.stringify(items));

      const all = queue.getAll();
      expect(all).toHaveLength(2);
      expect(all[0].status).toBe('failed');
      expect(all[1].status).toBe('pending');
    });
  });
});
