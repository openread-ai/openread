import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockOpenreadConstructor, mockCorrelatedPlatformFetch } = vi.hoisted(() => ({
  mockOpenreadConstructor: vi.fn(),
  mockCorrelatedPlatformFetch: vi.fn(),
}));

vi.mock('@openread/sdk', () => ({
  Openread: class MockOpenread {
    auth = {
      isAuthenticated: vi.fn().mockResolvedValue(true),
      getUser: vi.fn(),
      hasToken: vi.fn(),
    };
    runtime = {
      getTierConfig: vi.fn(),
      getPricing: vi.fn(),
    };
    books = {
      exists: vi.fn(),
      get: vi.fn(),
      getByHash: vi.fn(),
      list: vi.fn(),
      getDownloadUrl: vi.fn(),
    };
    ingest = {
      uploadBook: vi.fn(),
      exists: vi.fn(),
    };

    constructor(config: unknown) {
      mockOpenreadConstructor(config);
    }
  },
  OpenreadError: class OpenreadError extends Error {
    code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

vi.mock('@/services/platform/auth', () => ({
  getAccessToken: vi.fn().mockResolvedValue('token'),
  clearTokenCache: vi.fn(),
}));

vi.mock('@/utils/fetch', () => ({
  correlatedPlatformFetch: mockCorrelatedPlatformFetch,
}));

describe('platform client', () => {
  const originalNodeBaseUrl = process.env.NEXT_PUBLIC_NODE_BASE_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCorrelatedPlatformFetch.mockResolvedValue(new Response('{}', { status: 200 }));
  });

  afterEach(async () => {
    if (originalNodeBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_NODE_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_NODE_BASE_URL = originalNodeBaseUrl;
    }
    const { resetPlatformClient } = await import('@/services/platform/client');
    resetPlatformClient();
  });

  it('uses the canonical OpenRead API domain when NEXT_PUBLIC_NODE_BASE_URL is unset', async () => {
    delete process.env.NEXT_PUBLIC_NODE_BASE_URL;
    const { getPlatformClient } = await import('@/services/platform/client');

    getPlatformClient();

    expect(mockOpenreadConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'https://api.openread.ai' }),
    );
  });

  it('uses NEXT_PUBLIC_NODE_BASE_URL when configured', async () => {
    process.env.NEXT_PUBLIC_NODE_BASE_URL = 'https://custom.example.test';
    const { getPlatformClient } = await import('@/services/platform/client');

    getPlatformClient();

    expect(mockOpenreadConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'https://custom.example.test' }),
    );
  });

  it('injects correlated platform fetch so SDK calls preserve native webview transport and request IDs', async () => {
    const { getPlatformClient } = await import('@/services/platform/client');

    getPlatformClient();

    const config = mockOpenreadConstructor.mock.calls[0]?.[0] as { fetch: typeof globalThis.fetch };
    await config.fetch('https://api.openread.ai/catalog/books', { method: 'GET' });

    expect(mockCorrelatedPlatformFetch).toHaveBeenCalledWith(
      'https://api.openread.ai/catalog/books',
      {
        method: 'GET',
      },
    );
  });
});
