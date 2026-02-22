import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncClient, SYNC_TIMEOUT_MS } from '@/libs/sync';

// Mock dependencies
vi.mock('@/services/environment', () => ({
  getAPIBaseUrl: () => 'http://localhost:3000/api',
}));

vi.mock('@/utils/access', () => ({
  getAccessToken: vi.fn().mockResolvedValue('mock-token'),
}));

vi.mock('@/utils/fetch', () => ({
  fetchWithTimeout: vi.fn(),
}));

vi.mock('@/services/deviceService', () => ({
  getDeviceId: vi.fn(() => 'test-device-id'),
}));

import { fetchWithTimeout } from '@/utils/fetch';
import { getAccessToken } from '@/utils/access';

const mockFetchWithTimeout = vi.mocked(fetchWithTimeout);
const mockGetAccessToken = vi.mocked(getAccessToken);

describe('SyncClient', () => {
  let client: SyncClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new SyncClient();
    mockGetAccessToken.mockResolvedValue('mock-token');
  });

  describe('SYNC_TIMEOUT_MS', () => {
    it('should be 60000ms (60 seconds) for large libraries', () => {
      expect(SYNC_TIMEOUT_MS).toBe(60000);
    });
  });

  describe('pullChanges', () => {
    it('should call fetchWithTimeout with SYNC_TIMEOUT_MS', async () => {
      const mockResult = { books: [], configs: [], notes: [] };
      mockFetchWithTimeout.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResult),
      } as Response);

      await client.pullChanges(1000);

      expect(mockFetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('/sync?since='),
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer mock-token',
            'X-Sync-Protocol': '1',
          },
        }),
        SYNC_TIMEOUT_MS,
      );
    });

    it('should use 60000ms timeout for large libraries', async () => {
      const mockResult = { books: [], configs: [], notes: [] };
      mockFetchWithTimeout.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResult),
      } as Response);

      await client.pullChanges(0);

      const timeoutArg = mockFetchWithTimeout.mock.calls[0]![2];
      expect(timeoutArg).toBe(60000);
      expect(timeoutArg).toBeGreaterThan(8000);
    });

    it('should throw on non-ok response', async () => {
      mockFetchWithTimeout.mockResolvedValue({
        ok: false,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({ error: 'DB connection failed' }),
      } as unknown as Response);

      await expect(client.pullChanges(1000)).rejects.toThrow(
        'Failed to pull changes: DB connection failed',
      );
    });

    it('should throw when not authenticated', async () => {
      mockGetAccessToken.mockResolvedValue(null as unknown as string);

      await expect(client.pullChanges(1000)).rejects.toThrow('Not authenticated');
      expect(mockFetchWithTimeout).not.toHaveBeenCalled();
    });

    it('should throw upgrade message on 426 response with JSON body', async () => {
      mockFetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 426,
        json: () => Promise.resolve({ message: 'Upgrade to v2.0 to continue syncing.' }),
      } as unknown as Response);

      await expect(client.pullChanges(1000)).rejects.toThrow(
        'Upgrade to v2.0 to continue syncing.',
      );
    });

    it('should fall back to statusText when error body is not JSON', async () => {
      mockFetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        json: () => Promise.reject(new SyntaxError('Unexpected token <')),
      } as unknown as Response);

      await expect(client.pullChanges(1000)).rejects.toThrow('Failed to pull changes: Bad Gateway');
    });

    it('should pass type, book, and metaHash params in URL', async () => {
      const mockResult = { books: [], configs: [], notes: [] };
      mockFetchWithTimeout.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResult),
      } as Response);

      await client.pullChanges(5000, 'books', 'book-hash-123', 'meta-hash-456');

      const url = mockFetchWithTimeout.mock.calls[0]![0] as string;
      expect(url).toContain('type=books');
      expect(url).toContain('book=book-hash-123');
      expect(url).toContain('meta_hash=meta-hash-456');
    });
  });

  describe('pushChanges', () => {
    it('should call fetchWithTimeout with SYNC_TIMEOUT_MS', async () => {
      const mockResult = { books: [], configs: [], notes: [] };
      mockFetchWithTimeout.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResult),
      } as Response);

      await client.pushChanges({ books: [] });

      expect(mockFetchWithTimeout).toHaveBeenCalledWith(
        expect.stringContaining('/sync'),
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer mock-token',
            'X-Sync-Protocol': '1',
          },
        }),
        SYNC_TIMEOUT_MS,
      );
    });

    it('should use 60000ms timeout for large libraries', async () => {
      const mockResult = { books: [], configs: [], notes: [] };
      mockFetchWithTimeout.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResult),
      } as Response);

      await client.pushChanges({ books: [] });

      const timeoutArg = mockFetchWithTimeout.mock.calls[0]![2];
      expect(timeoutArg).toBe(60000);
      expect(timeoutArg).toBeGreaterThan(8000);
    });

    it('should throw on non-ok response', async () => {
      mockFetchWithTimeout.mockResolvedValue({
        ok: false,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({ error: 'Payload too large' }),
      } as unknown as Response);

      await expect(client.pushChanges({ books: [] })).rejects.toThrow(
        'Failed to push changes: Payload too large',
      );
    });

    it('should throw when not authenticated', async () => {
      mockGetAccessToken.mockResolvedValue(null as unknown as string);

      await expect(client.pushChanges({ books: [] })).rejects.toThrow('Not authenticated');
      expect(mockFetchWithTimeout).not.toHaveBeenCalled();
    });

    it('should throw upgrade message on 426 response with JSON body', async () => {
      mockFetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 426,
        json: () => Promise.resolve({ message: 'Upgrade to v2.0 to continue syncing.' }),
      } as unknown as Response);

      await expect(client.pushChanges({ books: [] })).rejects.toThrow(
        'Upgrade to v2.0 to continue syncing.',
      );
    });

    it('should fall back to statusText when error body is not JSON', async () => {
      mockFetchWithTimeout.mockResolvedValue({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        json: () => Promise.reject(new SyntaxError('Unexpected token <')),
      } as unknown as Response);

      await expect(client.pushChanges({ books: [] })).rejects.toThrow(
        'Failed to push changes: Bad Gateway',
      );
    });

    it('should send payload as JSON body with deviceId', async () => {
      const mockResult = { books: [], configs: [], notes: [] };
      mockFetchWithTimeout.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResult),
      } as Response);

      const payload = { books: [{ hash: 'test', title: 'Test' }] };
      await client.pushChanges(payload);

      const requestOptions = mockFetchWithTimeout.mock.calls[0]![1] as RequestInit;
      const parsedBody = JSON.parse(requestOptions.body as string);
      expect(parsedBody.books).toEqual(payload.books);
      expect(parsedBody.deviceId).toBe('test-device-id');
    });
  });
});
