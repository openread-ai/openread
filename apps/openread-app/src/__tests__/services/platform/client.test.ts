import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockOpenreadConstructor } = vi.hoisted(() => ({
  mockOpenreadConstructor: vi.fn(),
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

describe('platform client', () => {
  const originalNodeBaseUrl = process.env.NEXT_PUBLIC_NODE_BASE_URL;

  beforeEach(() => {
    vi.clearAllMocks();
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
});
