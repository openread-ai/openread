import { describe, expect, it, vi, beforeEach } from 'vitest';
import { KOSyncClient } from '@/services/sync/KOSyncClient';
import { LAUNCH_DISABLED_FEATURE_MESSAGE } from '@/services/launchFeatures';
import type { Book } from '@/types/book';
import type { KOSyncSettings } from '@/types/settings';

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: vi.fn(),
}));

const config: KOSyncSettings = {
  enabled: true,
  serverUrl: 'https://sync.example.com',
  username: 'saved-user',
  userkey: 'saved-key',
  deviceId: 'device-1',
  deviceName: 'Openread',
  checksumMethod: 'binary',
  strategy: 'silent',
};

const book = {
  hash: 'book-hash',
  title: 'Book',
  author: 'Author',
  format: 'epub',
} as Book;

describe('KOSyncClient launch holdback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('does not connect or request progress while KOReader sync is disabled for launch', async () => {
    const client = new KOSyncClient(config);

    await expect(client.connect('saved-user', 'password')).resolves.toEqual({
      success: false,
      message: LAUNCH_DISABLED_FEATURE_MESSAGE,
    });
    await expect(client.getProgress(book)).resolves.toBeNull();
    await expect(client.updateProgress(book, '/body/1', 0.5)).resolves.toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
