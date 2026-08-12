import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { OPENREAD_NODE_BASE_URL } from '@/services/constants';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(process.cwd());
const marker = '__OPENREAD_NEXT_CONFIG__';
const require = createRequire(import.meta.url);
const { prepareDestination } = require('next/dist/shared/lib/router/utils/prepare-destination');

interface Rewrite {
  source: string;
  destination: string;
}

interface LoadedConfig {
  output?: string;
  assetPrefix?: string;
  rewrites: null | {
    beforeFiles: Rewrite[];
    afterFiles: Rewrite[];
    fallback: Rewrite[];
  };
}

function loadConfig(
  platform: 'web' | 'tauri',
  apiOrigin?: string,
  apiOriginVariable:
    | 'NEXT_PUBLIC_NODE_BASE_URL'
    | 'NEXT_PUBLIC_PLATFORM_URL' = 'NEXT_PUBLIC_NODE_BASE_URL',
): LoadedConfig {
  const script = `
    const config = (await import('./next.config.mjs?contract=${platform}-${Date.now()}')).default;
    const rewrites = typeof config.rewrites === 'function' ? await config.rewrites() : null;
    console.log('${marker}' + JSON.stringify({
      output: config.output,
      assetPrefix: config.assetPrefix,
      rewrites,
    }));
  `;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'production',
    NEXT_PUBLIC_APP_PLATFORM: platform,
    NEXT_PUBLIC_SENTRY_DSN: '',
  };
  delete env.PLATFORM_API_BASE_URL;
  delete env.NEXT_PUBLIC_NODE_BASE_URL;
  delete env.NEXT_PUBLIC_PLATFORM_URL;
  if (apiOrigin) env[apiOriginVariable] = apiOrigin;

  const output = execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: appRoot,
    env,
    encoding: 'utf8',
  });
  const line = output.split('\n').find((candidate) => candidate.startsWith(marker));
  if (!line) throw new Error(`Next config contract output missing: ${output}`);
  return JSON.parse(line.slice(marker.length)) as LoadedConfig;
}

function rewriteMatches(source: string, pathname: string): boolean {
  const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace('/:path\\*', '(?:/.*)?')}$`).test(pathname);
}

const expectedSources = [
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
];

const nextOwnedPaths = [
  '/api/ai/agentic-chat',
  '/api/apple/iap-verify',
  '/api/billing/subscription',
  '/api/catalog/books',
  '/api/catalog-covers/gutenberg/gutenberg-74/full.jpg',
  '/api/google/iap-verify',
  '/api/health',
  '/api/metadata/search',
  '/api/stripe/plans',
  '/api/sync/download-urls',
  '/api/tier-config',
  '/api/tts/edge',
  '/api/user/export',
  '/api/user/verify-student',
  '/api/user/verify-student/confirm',
  '/api/definitely-missing',
];

describe('same-origin Fly API rewrites', () => {
  it('adds only the explicit Fly-owned paths after filesystem routes in web builds', () => {
    const config = loadConfig('web', 'https://platform-api.example.test/');

    expect(config.assetPrefix).toBe('');
    expect(config.output).toBeUndefined();
    expect(config.rewrites).not.toBeNull();
    expect(config.rewrites?.beforeFiles).toEqual([]);
    expect(config.rewrites?.fallback).toEqual([]);
    expect(config.rewrites?.afterFiles.map((rewrite) => rewrite.source)).toEqual(expectedSources);
    expect(config.rewrites?.afterFiles.map((rewrite) => rewrite.destination)).toEqual(
      expectedSources.map((source) => `https://platform-api.example.test${source}`),
    );
  });

  it('preserves the canonical bare files collection path in the compiled destination', () => {
    const rewrites = loadConfig('web', 'https://platform-api.example.test').rewrites?.afterFiles;
    const rewrite = rewrites?.find((candidate) => candidate.source === '/api/files');

    expect(rewrite).toBeDefined();
    const result = prepareDestination({
      appendParamsToQuery: false,
      destination: rewrite!.destination,
      params: {},
      query: {},
    });
    expect(result.parsedDestination.pathname).toBe('/api/files');
  });

  it('matches the bare API key collection paths', () => {
    const rewrites = loadConfig('web', 'https://platform-api.example.test').rewrites?.afterFiles;

    for (const pathname of ['/api/api-keys', '/api/settings/api-keys']) {
      expect(
        rewrites?.some((rewrite) => rewriteMatches(rewrite.source, pathname)),
        `${pathname} must reach Fly without a trailing segment`,
      ).toBe(true);
    }
  });

  it('cannot shadow any existing Next API handler or the missing-route guard', () => {
    const rewrites = loadConfig('web', 'https://platform-api.example.test').rewrites?.afterFiles;

    expect(rewrites).toBeDefined();
    for (const pathname of nextOwnedPaths) {
      expect(
        rewrites?.some((rewrite) => rewriteMatches(rewrite.source, pathname)),
        `${pathname} must stay owned by Next`,
      ).toBe(false);
    }
  });

  it('omits rewrites from Tauri, iOS, and Android static-export configuration', () => {
    const config = loadConfig('tauri', 'https://platform-api.example.test');

    expect(config.output).toBe('export');
    expect(config.assetPrefix).toBe('');
    expect(config.rewrites).toBeNull();
  });

  it('reuses the existing Vercel platform origin configuration', () => {
    const config = loadConfig(
      'web',
      'https://vercel-platform-api.example.test',
      'NEXT_PUBLIC_PLATFORM_URL',
    );

    expect(config.rewrites?.afterFiles[0]?.destination).toBe(
      'https://vercel-platform-api.example.test/api/books/:path*',
    );
  });

  it('uses the runtime canonical origin as its environment-free fallback', () => {
    const config = loadConfig('web');

    expect(config.rewrites?.afterFiles.map((rewrite) => rewrite.destination)).toEqual(
      expectedSources.map((source) => `${OPENREAD_NODE_BASE_URL}${source}`),
    );
  });
});
