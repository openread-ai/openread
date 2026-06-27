import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchWithAuth } from '@/utils/fetch';

vi.mock('@/utils/access', () => ({
  getAccessToken: vi.fn(async () => 'token-1'),
}));

vi.mock('@/services/environment', () => ({
  isTauriAppPlatform: vi.fn(() => false),
  isMobilePlatform: vi.fn(() => false),
}));

describe('fetchWithAuth', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves canonical JSON API error code and message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'STORAGE_LIMIT_REACHED',
          message: 'Storage limit reached. Upgrade your plan or remove files.',
        }),
        {
          status: 403,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    await expect(
      fetchWithAuth('/api/files/upload-intent', { method: 'POST' }),
    ).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 403,
      code: 'STORAGE_LIMIT_REACHED',
      message:
        'STORAGE_LIMIT_REACHED: Request failed with HTTP 403: Storage limit reached. Upgrade your plan or remove files.',
    });
  });

  it('surfaces plain backend errors without JSON parse SyntaxError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Internal Server Error', {
        status: 500,
        statusText: 'Internal Server Error',
        headers: { 'content-type': 'text/plain' },
      }),
    );

    await expect(
      fetchWithAuth('/api/files/upload-intent', { method: 'POST' }),
    ).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 500,
      message: 'Request failed with HTTP 500: Internal Server Error',
    });
  });
});
