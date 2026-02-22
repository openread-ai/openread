import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for the Upstash-backed rate limiter used in middleware.
 *
 * We mock @upstash/ratelimit and @upstash/redis so tests run without
 * a real Redis instance, and we can verify the wiring logic.
 */

// --- Hoisted mocks (available inside vi.mock factories) ---
const { mockLimit, mockSlidingWindow, mockRatelimitCtor, mockRedisCtor } = vi.hoisted(() => ({
  mockLimit: vi.fn(),
  mockSlidingWindow: vi.fn().mockReturnValue('sliding-window-config'),
  mockRatelimitCtor: vi.fn(),
  mockRedisCtor: vi.fn(),
}));

vi.mock('@upstash/ratelimit', () => {
  // Must use a real function (not arrow) so `new Ratelimit(...)` works
  function Ratelimit(this: Record<string, unknown>, opts: Record<string, unknown>) {
    mockRatelimitCtor(opts);
    this.limit = mockLimit;
  }
  Ratelimit.slidingWindow = mockSlidingWindow;
  return { Ratelimit };
});

vi.mock('@upstash/redis', () => {
  // Must use a real function so `new Redis(...)` works
  function Redis(this: Record<string, unknown>, opts: { url: string; token: string }) {
    mockRedisCtor(opts);
    this.url = opts.url;
    this.token = opts.token;
  }
  return { Redis };
});

// Import after mocks are registered
import { getRateLimiter, getIdentifier, RATE_LIMITS, DEFAULT_LIMIT } from '@/lib/rate-limit';

describe('rate-limit (Upstash)', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  // -------------------------------------------------------------------
  // getRateLimiter
  // -------------------------------------------------------------------
  describe('getRateLimiter', () => {
    it('should return null when UPSTASH_REDIS_REST_URL is not set', () => {
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;

      const limiter = getRateLimiter('/api/ai/chat');
      expect(limiter).toBeNull();
    });

    it('should return null when UPSTASH_REDIS_REST_TOKEN is not set', () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com';
      delete process.env.UPSTASH_REDIS_REST_TOKEN;

      const limiter = getRateLimiter('/api/ai/chat');
      expect(limiter).toBeNull();
    });

    it('should return null when both env vars are empty strings', () => {
      process.env.UPSTASH_REDIS_REST_URL = '';
      process.env.UPSTASH_REDIS_REST_TOKEN = '';

      const limiter = getRateLimiter('/api/ai/chat');
      expect(limiter).toBeNull();
    });

    it('should return a Ratelimit instance when Upstash is configured', () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'tok_secret';

      const limiter = getRateLimiter('/api/ai/chat');
      expect(limiter).not.toBeNull();
      expect(limiter).toHaveProperty('limit');
    });

    it('should use the AI route limit for /api/ai/ paths', () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'tok_secret';

      getRateLimiter('/api/ai/chat');

      expect(mockSlidingWindow).toHaveBeenCalledWith(
        RATE_LIMITS['/api/ai/']!.limit,
        RATE_LIMITS['/api/ai/']!.window,
      );
    });

    it('should use the metadata route limit for /api/metadata/ paths', () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'tok_secret';

      getRateLimiter('/api/metadata/lookup');

      expect(mockSlidingWindow).toHaveBeenCalledWith(
        RATE_LIMITS['/api/metadata/']!.limit,
        RATE_LIMITS['/api/metadata/']!.window,
      );
    });

    it('should use the TTS route limit for /api/tts/ paths', () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'tok_secret';

      getRateLimiter('/api/tts/synthesize');

      expect(mockSlidingWindow).toHaveBeenCalledWith(
        RATE_LIMITS['/api/tts/']!.limit,
        RATE_LIMITS['/api/tts/']!.window,
      );
    });

    it('should use the stripe route limit for /api/stripe/ paths', () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'tok_secret';

      getRateLimiter('/api/stripe/webhook');

      expect(mockSlidingWindow).toHaveBeenCalledWith(
        RATE_LIMITS['/api/stripe/']!.limit,
        RATE_LIMITS['/api/stripe/']!.window,
      );
    });

    it('should use the user route limit for /api/user/ paths', () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'tok_secret';

      getRateLimiter('/api/user/profile');

      expect(mockSlidingWindow).toHaveBeenCalledWith(
        RATE_LIMITS['/api/user/']!.limit,
        RATE_LIMITS['/api/user/']!.window,
      );
    });

    it('should use the MCP route limit for /api/mcp/ paths', () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'tok_secret';

      getRateLimiter('/api/mcp/tools');

      expect(mockSlidingWindow).toHaveBeenCalledWith(
        RATE_LIMITS['/api/mcp/']!.limit,
        RATE_LIMITS['/api/mcp/']!.window,
      );
    });

    it('should use the default limit for unmatched /api/ paths', () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'tok_secret';

      getRateLimiter('/api/health');

      expect(mockSlidingWindow).toHaveBeenCalledWith(DEFAULT_LIMIT.limit, DEFAULT_LIMIT.window);
    });

    it('should use "rl" as the Redis key prefix', () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'tok_secret';

      getRateLimiter('/api/ai/chat');

      expect(mockRatelimitCtor).toHaveBeenCalledWith(expect.objectContaining({ prefix: 'rl' }));
    });
  });

  // -------------------------------------------------------------------
  // getIdentifier
  // -------------------------------------------------------------------
  describe('getIdentifier', () => {
    it('should hash the bearer token when Authorization header is present', () => {
      const request = {
        headers: {
          get(name: string) {
            if (name === 'authorization') return 'Bearer my-jwt-token';
            return null;
          },
        },
      };

      const result = getIdentifier(request);
      // Should be a 16-char hex hash, not the raw token
      expect(result).not.toBe('my-jwt-token');
      expect(result).toMatch(/^[0-9a-f]{16}$/);
    });

    it('should fall back to X-Forwarded-For when no auth header', () => {
      const request = {
        headers: {
          get(name: string) {
            if (name === 'x-forwarded-for') return '1.2.3.4, 5.6.7.8';
            return null;
          },
        },
      };

      expect(getIdentifier(request)).toBe('1.2.3.4');
    });

    it('should trim whitespace from the forwarded IP', () => {
      const request = {
        headers: {
          get(name: string) {
            if (name === 'x-forwarded-for') return '  10.0.0.1  , 192.168.1.1';
            return null;
          },
        },
      };

      expect(getIdentifier(request)).toBe('10.0.0.1');
    });

    it('should return "anonymous" when neither header is present', () => {
      const request = {
        headers: {
          get() {
            return null;
          },
        },
      };

      expect(getIdentifier(request)).toBe('anonymous');
    });

    it('should prefer auth token over forwarded IP', () => {
      const request = {
        headers: {
          get(name: string) {
            if (name === 'authorization') return 'Bearer tok_123';
            if (name === 'x-forwarded-for') return '1.2.3.4';
            return null;
          },
        },
      };

      const result = getIdentifier(request);
      // Should use hashed token, not the IP
      expect(result).not.toBe('1.2.3.4');
      expect(result).toMatch(/^[0-9a-f]{16}$/);
    });

    it('should hash Authorization header without Bearer prefix gracefully', () => {
      // "Basic abc".split(" ")[1] => "abc" -- still hashed
      const request = {
        headers: {
          get(name: string) {
            if (name === 'authorization') return 'Basic abc123';
            return null;
          },
        },
      };

      const result = getIdentifier(request);
      expect(result).toMatch(/^[0-9a-f]{16}$/);
    });

    it('should produce deterministic hashes for the same token', () => {
      const request = {
        headers: {
          get(name: string) {
            if (name === 'authorization') return 'Bearer same-token';
            return null;
          },
        },
      };

      const result1 = getIdentifier(request);
      const result2 = getIdentifier(request);
      expect(result1).toBe(result2);
    });
  });

  // -------------------------------------------------------------------
  // Rate limit config constants
  // -------------------------------------------------------------------
  describe('RATE_LIMITS config', () => {
    it('should define limits for all expected route groups', () => {
      const expectedPrefixes = [
        '/api/ai/',
        '/api/metadata/',
        '/api/tts/',
        '/api/stripe/',
        '/api/user/',
        '/api/mcp/',
      ];
      for (const prefix of expectedPrefixes) {
        expect(RATE_LIMITS).toHaveProperty(prefix);
      }
    });

    it('should have positive limits for all route groups', () => {
      for (const [, cfg] of Object.entries(RATE_LIMITS)) {
        expect(cfg.limit).toBeGreaterThan(0);
        expect(cfg.window).toBeTruthy();
      }
    });

    it('should set the strictest limit on stripe routes', () => {
      const stripeLimit = RATE_LIMITS['/api/stripe/']!.limit;
      for (const [prefix, cfg] of Object.entries(RATE_LIMITS)) {
        if (prefix !== '/api/stripe/') {
          expect(cfg.limit).toBeGreaterThanOrEqual(stripeLimit);
        }
      }
    });

    it('should have a default limit of 100 per minute', () => {
      expect(DEFAULT_LIMIT).toEqual({ limit: 100, window: '1m' });
    });
  });
});
