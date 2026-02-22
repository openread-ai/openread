import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../../middleware';

describe('Security Headers - CORS', () => {
  const allowedOrigins = [
    'https://web.openread.com',
    'https://tauri.localhost',
    'http://tauri.localhost',
    'http://localhost:3000',
    'http://localhost:3001',
    'tauri://localhost',
  ];

  describe('CORS headers', () => {
    it('should not use wildcard for Access-Control-Allow-Headers', async () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'OPTIONS',
        headers: {
          origin: 'http://localhost:3000',
        },
      });

      const response = await middleware(request);

      const allowHeaders = response.headers.get('Access-Control-Allow-Headers');
      expect(allowHeaders).not.toBe('*');
      expect(allowHeaders).toBeTruthy();
    });

    it('should include explicit list of allowed headers', async () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'OPTIONS',
        headers: {
          origin: 'http://localhost:3000',
        },
      });

      const response = await middleware(request);

      const allowHeaders = response.headers.get('Access-Control-Allow-Headers');
      expect(allowHeaders).toContain('Content-Type');
      expect(allowHeaders).toContain('Authorization');
      expect(allowHeaders).toContain('X-Requested-With');
      expect(allowHeaders).toContain('X-Request-ID');
    });

    it('should set CORS headers for allowed origins', async () => {
      for (const origin of allowedOrigins) {
        const request = new NextRequest('http://localhost:3000/api/test', {
          method: 'GET',
          headers: {
            origin,
          },
        });

        const response = await middleware(request);

        expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
        expect(response.headers.get('Access-Control-Allow-Methods')).toBe(
          'GET, POST, PUT, DELETE, OPTIONS',
        );
      }
    });

    it('should not set Access-Control-Allow-Origin for disallowed origins', async () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'GET',
        headers: {
          origin: 'https://evil.com',
        },
      });

      const response = await middleware(request);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('should handle OPTIONS preflight requests', async () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'OPTIONS',
        headers: {
          origin: 'http://localhost:3000',
        },
      });

      const response = await middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe(
        'GET, POST, PUT, DELETE, OPTIONS',
      );
      expect(response.headers.get('Access-Control-Max-Age')).toBe('86400');
    });
  });

  describe('CORS allowlist validation', () => {
    it('should only allow Content-Type header', async () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'OPTIONS',
        headers: {
          origin: 'http://localhost:3000',
        },
      });

      const response = await middleware(request);
      const allowHeaders = response.headers.get('Access-Control-Allow-Headers');

      expect(allowHeaders).toContain('Content-Type');
    });

    it('should only allow Authorization header', async () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'OPTIONS',
        headers: {
          origin: 'http://localhost:3000',
        },
      });

      const response = await middleware(request);
      const allowHeaders = response.headers.get('Access-Control-Allow-Headers');

      expect(allowHeaders).toContain('Authorization');
    });

    it('should only allow X-Requested-With header', async () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'OPTIONS',
        headers: {
          origin: 'http://localhost:3000',
        },
      });

      const response = await middleware(request);
      const allowHeaders = response.headers.get('Access-Control-Allow-Headers');

      expect(allowHeaders).toContain('X-Requested-With');
    });

    it('should only allow X-Request-ID header', async () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'OPTIONS',
        headers: {
          origin: 'http://localhost:3000',
        },
      });

      const response = await middleware(request);
      const allowHeaders = response.headers.get('Access-Control-Allow-Headers');

      expect(allowHeaders).toContain('X-Request-ID');
    });
  });
});

describe('Security Headers - Next.js Config', () => {
  // Read the actual config file to validate security headers are present
  const configContent = readFileSync(resolve(process.cwd(), 'next.config.mjs'), 'utf-8');

  it('should include required CSP domains in config', () => {
    const requiredDomains = [
      '*.supabase.co',
      '*.posthog.com',
      '*.sentry.io',
      'js.stripe.com',
      'fonts.googleapis.com',
      'fonts.gstatic.com',
      'cdnjs.cloudflare.com',
      'cdn.jsdelivr.net',
      'cdn.openread.com',
      'storage.openread.com',
      '*.r2.cloudflarestorage.com',
      'speech.platform.bing.com',
      '*.googleapis.com',
    ];

    for (const domain of requiredDomains) {
      expect(configContent).toContain(domain);
    }
  });

  it('should include required CSP special sources in config', () => {
    expect(configContent).toContain("'unsafe-eval'");
    expect(configContent).toContain("'unsafe-inline'");
    expect(configContent).toContain('blob:');
    expect(configContent).toContain('data:');
  });

  it('should configure required security headers', () => {
    expect(configContent).toContain('X-Content-Type-Options');
    expect(configContent).toContain('nosniff');
    expect(configContent).toContain('X-Frame-Options');
    expect(configContent).toContain('DENY');
    expect(configContent).toContain('Referrer-Policy');
    expect(configContent).toContain('strict-origin-when-cross-origin');
    expect(configContent).toContain('Permissions-Policy');
    expect(configContent).toContain('camera=(), microphone=(), geolocation=()');
  });

  it('should configure HSTS header', () => {
    expect(configContent).toContain('Strict-Transport-Security');
    expect(configContent).toContain('max-age=63072000');
    expect(configContent).toContain('includeSubDomains');
    expect(configContent).toContain('preload');
  });

  it('should use Content-Security-Policy header', () => {
    expect(configContent).toContain("key: 'Content-Security-Policy'");
  });
});
