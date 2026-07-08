import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  pullCanonicalSyncChanges,
  reconcileCanonicalBooks,
  SYNC_TIMEOUT_MS,
} from '@/services/sync/client';

vi.mock('@/services/environment', () => ({
  getNodeAPIBaseUrl: () => 'http://localhost:3001/api',
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
const token = [
  'header',
  Buffer.from(JSON.stringify({ sub: 'user-1' })).toString('base64url'),
  'signature',
].join('.');

describe('canonical sync backend client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccessToken.mockResolvedValue(token);
  });

  it('keeps the 60s timeout for large libraries', () => {
    expect(SYNC_TIMEOUT_MS).toBe(60000);
  });

  it('pulls canonical book records from backend /sync/pull', async () => {
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          records: [
            {
              entity: 'book',
              entityId: 'book-1',
              payload: { hash: 'book-1', title: 'Book One', updatedAt: 1000 },
              serverRevision: 'rev-1',
              serverUpdatedAt: 1000,
            },
          ],
          tombstones: [],
          cursorByEntity: { book: '1000' },
          hasMore: false,
        }),
    } as Response);

    const result = await pullCanonicalSyncChanges(1000, 'books');

    expect(mockFetchWithTimeout).toHaveBeenCalledWith(
      'http://localhost:3001/api/sync/pull',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Sync-Protocol': '1',
        },
      }),
      SYNC_TIMEOUT_MS,
    );
    const body = JSON.parse((mockFetchWithTimeout.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toMatchObject({
      protocolVersion: 1,
      userId: 'user-1',
      deviceId: 'test-device-id',
      cursors: { book: '1000' },
      entities: ['book'],
    });
    expect(result.books).toMatchObject([{ hash: 'book-1', book_hash: 'book-1' }]);
  });

  it('carries canonical pull tombstones through to callers', async () => {
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          records: [],
          tombstones: [
            {
              entity: 'bookNote',
              entityId: 'book-1:note-1',
              serverRevision: 'rev-delete',
              serverUpdatedAt: 2000,
              deletedAt: 2000,
            },
          ],
          cursorByEntity: { bookNote: '2000' },
          hasMore: false,
        }),
    } as Response);

    const result = await pullCanonicalSyncChanges(1000, 'notes', 'book-1');

    expect(result.tombstones).toEqual([
      {
        entity: 'bookNote',
        entityId: 'book-1:note-1',
        serverRevision: 'rev-delete',
        serverUpdatedAt: 2000,
        deletedAt: 2000,
      },
    ]);
  });

  it('does not attach unscoped AI messages to a book-scoped pull', async () => {
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          records: [
            {
              entity: 'aiConversation',
              entityId: 'conversation-other',
              payload: {
                id: 'conversation-other',
                bookHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
                title: 'Other book',
                updatedAt: 2000,
              },
              serverRevision: 'rev-conversation-other',
              serverUpdatedAt: 2000,
            },
            {
              entity: 'aiMessage',
              entityId: 'message-other',
              payload: {
                id: 'message-other',
                conversationId: 'conversation-other',
                role: 'assistant',
                content: 'unrelated',
                createdAt: 2000,
              },
              serverRevision: 'rev-message-other',
              serverUpdatedAt: 2000,
            },
          ],
          tombstones: [],
          cursorByEntity: { aiConversation: '2000', aiMessage: '2000' },
          hasMore: false,
        }),
    } as Response);

    const result = await pullCanonicalSyncChanges(0, 'ai', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

    expect(result.aiConversations).toEqual([]);
    expect(result.aiMessages).toEqual([]);
  });

  it('keeps known book conversation messages in a book-scoped AI pull', async () => {
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          records: [
            {
              entity: 'aiMessage',
              entityId: 'message-known',
              payload: {
                id: 'message-known',
                conversationId: 'conversation-known',
                role: 'assistant',
                content: 'related',
                createdAt: 3000,
              },
              serverRevision: 'rev-message-known',
              serverUpdatedAt: 3000,
            },
          ],
          tombstones: [],
          cursorByEntity: { aiMessage: '3000' },
          hasMore: false,
        }),
    } as Response);

    const result = await pullCanonicalSyncChanges(
      0,
      'ai',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      undefined,
      ['conversation-known'],
    );

    expect(result.aiMessages).toMatchObject([{ id: 'message-known' }]);
  });

  it('returns canonical settings and collections as separate pull outputs', async () => {
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          records: [
            {
              entity: 'settings',
              entityId: 'settings',
              payload: { id: 'settings', settings: { libraryViewMode: 'grid' }, updatedAt: 1000 },
              serverRevision: 'rev-settings',
              serverUpdatedAt: 1000,
            },
            {
              entity: 'collection',
              entityId: 'collection-1',
              payload: { id: 'collection-1', name: 'Favorites', bookHashes: [], updatedAt: 2000 },
              serverRevision: 'rev-collection',
              serverUpdatedAt: 2000,
            },
          ],
          tombstones: [],
          cursorByEntity: { settings: '1000', collection: '2000' },
          hasMore: false,
        }),
    } as Response);

    const result = await pullCanonicalSyncChanges(0, 'settings');

    expect(result.settings).toEqual({ libraryViewMode: 'grid' });
    expect(result.collections).toMatchObject([
      { id: 'collection-1', name: 'Favorites', bookHashes: [] },
    ]);
    expect(result.settingsUpdatedAt).toBe(2000);
  });

  it('reconciles book inventory through backend /sync/reconcile', async () => {
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          upsert: [],
          remove: [
            {
              entity: 'book',
              entityId: 'missing-book',
              serverRevision: '1',
              serverUpdatedAt: 1,
              deletedAt: 1,
            },
          ],
          cursorByEntity: { book: '1' },
        }),
    } as Response);

    const result = await reconcileCanonicalBooks({ 'book-1': 1000 });

    expect(mockFetchWithTimeout).toHaveBeenCalledWith(
      'http://localhost:3001/api/sync/reconcile',
      expect.objectContaining({ method: 'POST' }),
      SYNC_TIMEOUT_MS,
    );
    const body = JSON.parse((mockFetchWithTimeout.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toMatchObject({
      protocolVersion: 1,
      userId: 'user-1',
      deviceId: 'test-device-id',
      inventory: { book: { 'book-1': '1970-01-01T00:00:01.000Z' } },
    });
    expect(result.reconcile?.remove).toEqual(['missing-book']);
  });

  it('throws when not authenticated', async () => {
    mockGetAccessToken.mockResolvedValue(null as unknown as string);

    await expect(pullCanonicalSyncChanges(1000)).rejects.toThrow('Not authenticated');
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
  });
});
