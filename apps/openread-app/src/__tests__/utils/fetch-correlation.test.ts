import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  OPENREAD_REQUEST_ID_HEADER,
  withOpenreadCorrelationHeaders,
  withWebDevPlatformProxyUrl,
} from '@/utils/fetch';

describe('OpenRead fetch correlation headers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it('adds a safe request ID to OpenRead API requests without touching auth headers', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'request-id-123' });

    const init = withOpenreadCorrelationHeaders('https://api.openread.ai/api/platform-books', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer private-token',
      },
    });
    const headers = new Headers(init.headers);

    expect(headers.get(OPENREAD_REQUEST_ID_HEADER)).toBe('web_request-id-123');
    expect(headers.get('Authorization')).toBe('Bearer private-token');
  });

  it('preserves an existing request ID and supports local API URLs', () => {
    const init = withOpenreadCorrelationHeaders('/api/quota/usage', {
      headers: { 'x-request-id': 'existing-id' },
    });

    expect(new Headers(init.headers).get(OPENREAD_REQUEST_ID_HEADER)).toBe('existing-id');
  });

  it('does not add OpenRead correlation headers to third-party requests', () => {
    const init = { headers: { Accept: 'application/json' } };

    expect(withOpenreadCorrelationHeaders('https://openlibrary.org/search.json', init)).toBe(init);
  });

  it('routes local web platform API calls through same-origin proxy routes', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_APP_PLATFORM', 'web');
    vi.stubGlobal('window', {
      location: { href: 'http://localhost:3000/explore', origin: 'http://localhost:3000' },
    });

    expect(withWebDevPlatformProxyUrl('https://api.openread.ai/catalog/books?page=1')).toBe(
      '/catalog/books?page=1',
    );
    expect(
      withWebDevPlatformProxyUrl('https://api.openread.ai/api/catalog/books/cat-1/import'),
    ).toBe('/api/catalog/books/cat-1/import');
    expect(withWebDevPlatformProxyUrl('https://api.openread.ai/api/sync/push')).toBe(
      '/api/sync/push',
    );
    expect(withWebDevPlatformProxyUrl('https://api.openread.ai/api/tier-config')).toBe(
      '/api/tier-config',
    );
  });

  it('keeps backend calls without local proxy routes on the configured backend host', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_APP_PLATFORM', 'web');
    vi.stubGlobal('window', {
      location: { href: 'http://localhost:3000/explore', origin: 'http://localhost:3000' },
    });

    expect(withWebDevPlatformProxyUrl('https://api.openread.ai/api/platform-books')).toBe(
      'https://api.openread.ai/api/platform-books',
    );
  });
});
