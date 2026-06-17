import { testSyncableBookRef } from '../../utils/bookIdentityFixtures';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncPushRequest } from '@openread/sync';

import { BackendSyncTransport } from '@/services/sync/backendTransport';
import { SYNC_TIMEOUT_MS } from '@/services/sync/client';

const getAccessToken = vi.fn();
const fetchWithTimeout = vi.fn();
const getNodeBaseUrl = vi.fn();

vi.mock('@/utils/access', () => ({ getAccessToken: () => getAccessToken() }));
vi.mock('@/utils/fetch', () => ({
  fetchWithTimeout: (...args: unknown[]) => fetchWithTimeout(...args),
}));
vi.mock('@/services/environment', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  getNodeBaseUrl: () => getNodeBaseUrl(),
}));

const request: SyncPushRequest = {
  protocolVersion: 1,
  userId: 'user-1',
  deviceId: 'device-1',
  mutations: [
    {
      id: 'mutation-1',
      entity: 'book',
      entityId: 'book-1',
      op: 'upsert',
      baseRevision: null,
      userId: 'user-1',
      deviceId: 'device-1',
      clientUpdatedAt: 1,
      payload: { hash: testSyncableBookRef('book-1'), title: 'Book One', updatedAt: 1 },
    },
  ],
};

describe('BackendSyncTransport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAccessToken.mockResolvedValue('token-1');
    getNodeBaseUrl.mockReturnValue('https://api.openread.ai');
  });

  it('pushes canonical mutations to the backend sync API with auth and protocol headers', async () => {
    const responseBody = {
      accepted: [
        {
          mutationId: 'mutation-1',
          entity: 'book',
          entityId: 'book-1',
          serverRevision: 'rev-1',
          serverUpdatedAt: 1,
        },
      ],
      conflicts: [],
    };
    fetchWithTimeout.mockResolvedValue({ ok: true, json: async () => responseBody });

    await expect(new BackendSyncTransport().push(request)).resolves.toEqual(responseBody);

    expect(fetchWithTimeout).toHaveBeenCalledWith(
      'https://api.openread.ai/api/sync/push',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-1',
          'Content-Type': 'application/json',
          'X-Sync-Protocol': '1',
        },
        body: JSON.stringify(request),
      },
      SYNC_TIMEOUT_MS,
    );
  });

  it('fails before network when the user is not authenticated', async () => {
    getAccessToken.mockResolvedValue(null);

    await expect(new BackendSyncTransport().push(request)).rejects.toThrow('Not authenticated');
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });

  it('surfaces backend validation errors as transport failures for outbox retry handling', async () => {
    fetchWithTimeout.mockResolvedValue({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      text: async () => JSON.stringify({ message: 'Invalid sync push request' }),
    });

    await expect(new BackendSyncTransport().push(request)).rejects.toThrow(
      'Sync push failed: Invalid sync push request',
    );
  });
});
