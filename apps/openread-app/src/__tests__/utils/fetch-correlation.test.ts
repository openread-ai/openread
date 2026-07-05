import { describe, expect, it, vi } from 'vitest';

import { OPENREAD_REQUEST_ID_HEADER, withOpenreadCorrelationHeaders } from '@/utils/fetch';

describe('OpenRead fetch correlation headers', () => {
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
});
