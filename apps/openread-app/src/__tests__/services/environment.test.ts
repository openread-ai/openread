import { afterEach, describe, expect, it } from 'vitest';

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
    if (originalNodeBaseUrl === undefined) {
      delete process.env['NEXT_PUBLIC_NODE_BASE_URL'];
    } else {
      process.env['NEXT_PUBLIC_NODE_BASE_URL'] = originalNodeBaseUrl;
    }
  });

  it('defaults canonical backend traffic to the public API host', () => {
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
    process.env['NEXT_PUBLIC_NODE_BASE_URL'] = 'https://staging-api.openread.ai';

    expect(getNodeBaseUrl()).toBe('https://staging-api.openread.ai');
    expect(getNodeAPIBaseUrl()).toBe('https://staging-api.openread.ai/api');
    expect(getProductAPIBaseUrl()).toBe('https://staging-api.openread.ai/api');
    expect(getCatalogBookCoverUrl('catalog-id')).toBe(
      'https://staging-api.openread.ai/catalog/books/catalog-id/cover',
    );
  });
});
