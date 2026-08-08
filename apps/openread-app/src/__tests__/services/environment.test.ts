import { afterEach, describe, expect, it, vi } from 'vitest';

import { OPENREAD_NODE_BASE_URL } from '@/services/constants';
import {
  getCatalogBookCoverUrl,
  getNodeAPIBaseUrl,
  getNodeBaseUrl,
  getProductAPIBaseUrl,
} from '@/services/environment';

const originalNodeBaseUrl = process.env['NEXT_PUBLIC_NODE_BASE_URL'];

describe('environment node API base URL', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    if (originalNodeBaseUrl === undefined) {
      delete process.env['NEXT_PUBLIC_NODE_BASE_URL'];
    } else {
      process.env['NEXT_PUBLIC_NODE_BASE_URL'] = originalNodeBaseUrl;
    }
  });

  it('defaults canonical backend traffic to the public API host', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_PLATFORM', 'tauri');
    delete process.env['NEXT_PUBLIC_NODE_BASE_URL'];

    expect(OPENREAD_NODE_BASE_URL).toBe('https://api.openread.ai');
    expect(getNodeBaseUrl()).toBe('https://api.openread.ai');
    expect(getNodeAPIBaseUrl()).toBe('https://api.openread.ai/api');
    expect(getProductAPIBaseUrl()).toBe('https://api.openread.ai/api');
    expect(getCatalogBookCoverUrl('catalog id/with?reserved')).toBe(
      'https://api.openread.ai/catalog/books/catalog%20id%2Fwith%3Freserved/cover',
    );
  });

  it('still allows explicit backend host overrides for self-hosted or staging builds', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_PLATFORM', 'tauri');
    process.env['NEXT_PUBLIC_NODE_BASE_URL'] = 'https://staging-api.openread.ai';

    expect(getNodeBaseUrl()).toBe('https://staging-api.openread.ai');
    expect(getNodeAPIBaseUrl()).toBe('https://staging-api.openread.ai/api');
    expect(getProductAPIBaseUrl()).toBe('https://staging-api.openread.ai/api');
    expect(getCatalogBookCoverUrl('catalog-id')).toBe(
      'https://staging-api.openread.ai/catalog/books/catalog-id/cover',
    );
  });

  it('keeps surviving Next API callers same-origin in web development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_APP_PLATFORM', 'web');

    const baseUrl = getNodeAPIBaseUrl();

    expect({
      edgeTTS: `${baseUrl}/tts/edge`,
      appleIAP: `${baseUrl}/apple/iap-verify`,
      googleIAP: `${baseUrl}/google/iap-verify`,
      syncPush: `${baseUrl}/sync/push`,
      syncPull: `${baseUrl}/sync/pull`,
      syncReconcile: `${baseUrl}/sync/reconcile`,
    }).toEqual({
      edgeTTS: '/api/tts/edge',
      appleIAP: '/api/apple/iap-verify',
      googleIAP: '/api/google/iap-verify',
      syncPush: '/api/sync/push',
      syncPull: '/api/sync/pull',
      syncReconcile: '/api/sync/reconcile',
    });
  });

  it('routes product callers through the production web BFF without changing node callers', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_PLATFORM', 'web');

    expect(getNodeAPIBaseUrl()).toBe('https://api.openread.ai/api');
    expect(getProductAPIBaseUrl()).toBe('/api');
  });

  it('keeps node and product API origins absolute for Tauri development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_APP_PLATFORM', 'tauri');

    expect(getNodeAPIBaseUrl()).toBe('https://api.openread.ai/api');
    expect(getProductAPIBaseUrl()).toBe('https://api.openread.ai/api');
  });
});
