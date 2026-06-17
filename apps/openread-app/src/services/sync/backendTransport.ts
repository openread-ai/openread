import type { SyncPushRequest, SyncPushResponse } from '@openread/sync';

import { SYNC_TIMEOUT_MS } from './client';
import { getNodeBaseUrl } from '@/services/environment';
import { getAccessToken } from '@/utils/access';
import { fetchWithTimeout } from '@/utils/fetch';
import type { SyncTransport } from './engine';

const pushUrl = (): string => `${getNodeBaseUrl()}/api/sync/push`;

const responseError = async (response: Response): Promise<Error> => {
  const body = await response.text().catch(() => '');
  if (!body) return new Error(`Sync push failed: ${response.status} ${response.statusText}`);

  try {
    const parsed = JSON.parse(body) as { message?: unknown; error?: unknown };
    const message = typeof parsed.message === 'string' ? parsed.message : parsed.error;
    if (typeof message === 'string' && message.length > 0) {
      return new Error(`Sync push failed: ${message}`);
    }
  } catch {
    // Fall through to raw body for non-JSON upstream errors.
  }

  return new Error(`Sync push failed: ${body}`);
};

export class BackendSyncTransport implements SyncTransport {
  async push(request: SyncPushRequest): Promise<SyncPushResponse> {
    const token = await getAccessToken();
    if (!token) throw new Error('Not authenticated');

    const response = await fetchWithTimeout(
      pushUrl(),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Sync-Protocol': String(request.protocolVersion),
        },
        body: JSON.stringify(request),
      },
      SYNC_TIMEOUT_MS,
    );

    if (!response.ok) throw await responseError(response);
    return (await response.json()) as SyncPushResponse;
  }
}

export const createBackendSyncTransport = (): SyncTransport => new BackendSyncTransport();
