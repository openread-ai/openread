import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getProductAPIBaseUrl } from '@/services/environment';

const ABSOLUTE_PRODUCT_API = 'https://api.openread.ai/api';

const { fetchWithAuthMock, getUserIDMock } = vi.hoisted(() => ({
  fetchWithAuthMock: vi.fn(async () => new Response(null, { status: 204 })),
  getUserIDMock: vi.fn(async () => 'user-id'),
}));

vi.mock('@/utils/access', () => ({ getUserID: getUserIDMock }));
vi.mock('@/utils/fetch', () => ({ fetchWithAuth: fetchWithAuthMock }));
vi.mock('@/utils/logger', () => ({
  createLogger: () => ({ error: vi.fn() }),
}));

const callerPaths = [
  { caller: 'useApiKeys.ts:77', path: '/api-keys' },
  { caller: 'useApiKeys.ts:113', path: '/api-keys' },
  { caller: 'useApiKeys.ts:161', path: '/api-keys/key-id' },
  { caller: 'useProviderKeys.ts:58', path: '/settings/api-keys' },
  { caller: 'useProviderKeys.ts:91', path: '/settings/api-keys' },
  { caller: 'useProviderKeys.ts:137', path: '/settings/api-keys/provider' },
  { caller: 'useProviderKeys.ts:180', path: '/settings/api-keys/test' },
  { caller: 'useStorageQuota.ts:58', path: '/files/stats' },
  { caller: 'storage.ts:20', path: '/files/example.epub' },
  { caller: 'user.ts:8', path: '/user/delete' },
] as const;

const rewriteSources = [
  '/api/books/:path*',
  '/api/admin/:path*',
  '/api/quota/:path*',
  '/api/files',
  '/api/files/:path*',
  '/api/user/delete',
  '/api/api-keys/:path*',
  '/api/settings/api-keys/:path*',
  '/api/mcp/:path*',
  '/api/pricing',
] as const;

function configuredRewriteSources(): string[] {
  const configSource = readFileSync(resolve(process.cwd(), 'next.config.mjs'), 'utf8');
  const allowlist = configSource.match(/const flyOwnedApiRewriteSources = \[(.*?)\];/s)?.[1];
  if (!allowlist) throw new Error('Fly-owned rewrite allowlist not found');
  return [...allowlist.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

function rewriteMatches(source: string, pathname: string): boolean {
  const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace('/:path\\*', '(?:/.*)?')}$`).test(pathname);
}

function setPlatform(platform?: string): void {
  if (platform === undefined) delete process.env['NEXT_PUBLIC_APP_PLATFORM'];
  else vi.stubEnv('NEXT_PUBLIC_APP_PLATFORM', platform);
}

describe('same-origin product API callers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    fetchWithAuthMock.mockClear();
    getUserIDMock.mockClear();
  });

  it('routes every current product API caller through a shipped web rewrite', () => {
    setPlatform('web');

    const configuredSources = configuredRewriteSources();
    expect(configuredSources).toEqual(rewriteSources);
    expect(callerPaths).toHaveLength(10);
    for (const { caller, path } of callerPaths) {
      const requestPath = `${getProductAPIBaseUrl()}${path}`;
      expect(requestPath, `${caller} must use the same-origin web API`).toMatch(/^\/api\//);
      expect(
        configuredSources.some((source) => rewriteMatches(source, requestPath)),
        `${caller} must reach a shipped Fly rewrite`,
      ).toBe(true);
    }
  });

  it.each([
    { platform: 'web', expected: '/api' },
    { platform: 'tauri', expected: ABSOLUTE_PRODUCT_API },
    { platform: 'ios', expected: ABSOLUTE_PRODUCT_API },
    { platform: 'android', expected: ABSOLUTE_PRODUCT_API },
  ])('resolves the product API for $platform builds', ({ platform, expected }) => {
    setPlatform(platform);

    expect(getProductAPIBaseUrl()).toBe(expected);
  });

  it.each([
    { platform: 'web', expected: '/api/user/delete' },
    { platform: 'tauri', expected: `${ABSOLUTE_PRODUCT_API}/user/delete` },
    { platform: undefined, expected: `${ABSOLUTE_PRODUCT_API}/user/delete` },
  ])(
    'freezes the module-load user endpoint safely for $platform builds',
    async ({ platform, expected }) => {
      setPlatform(platform);
      const { deleteUser } = await import('@/libs/user');

      await deleteUser();

      expect(fetchWithAuthMock).toHaveBeenCalledWith(expected, { method: 'DELETE' });
    },
  );
});
