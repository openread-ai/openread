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
  const originalPlatformUrl = process.env.NEXT_PUBLIC_PLATFORM_URL;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    process.env.NEXT_PUBLIC_PLATFORM_URL = originalPlatformUrl;
    const { resetPlatformClient } = await import('@/services/platform/client');
    resetPlatformClient();
  });

  it('uses the canonical OpenRead API domain when NEXT_PUBLIC_PLATFORM_URL is unset', async () => {
    delete process.env.NEXT_PUBLIC_PLATFORM_URL;
    const { getPlatformClient } = await import('@/services/platform/client');

    getPlatformClient();

    expect(mockOpenreadConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'https://api.openread.ai' }),
    );
  });

  it('uses NEXT_PUBLIC_PLATFORM_URL when configured', async () => {
    process.env.NEXT_PUBLIC_PLATFORM_URL = 'https://custom.example.test';
    const { getPlatformClient } = await import('@/services/platform/client');

    getPlatformClient();

    expect(mockOpenreadConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'https://custom.example.test' }),
    );
  });
});
