import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Openread, OpenreadError } from './index.js';

describe('Openread SDK', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('creates SDK instance with config', () => {
      const sdk = new Openread({
        baseUrl: 'https://api.example.com',
        getAccessToken: async () => 'test-token',
      });

      expect(sdk).toBeDefined();
      expect(sdk.auth).toBeDefined();
      expect(sdk.books).toBeDefined();
      expect(sdk.ingest).toBeDefined();
    });
  });

  describe('fetch', () => {
    it('adds Authorization header when token is provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: 'test' }),
      });

      const sdk = new Openread({
        baseUrl: 'https://api.example.com',
        getAccessToken: async () => 'my-token',
      });

      await sdk.fetch('/api/test');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer my-token',
          }),
        })
      );
    });

    it('does not add Authorization header when token is null', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: 'test' }),
      });

      const sdk = new Openread({
        baseUrl: 'https://api.example.com',
        getAccessToken: async () => null,
      });

      await sdk.fetch('/api/test');

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].headers).not.toHaveProperty('Authorization');
    });

    it('includes Content-Type header', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: 'test' }),
      });

      const sdk = new Openread({
        baseUrl: 'https://api.example.com',
        getAccessToken: async () => 'token',
      });

      await sdk.fetch('/api/test');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('throws OpenreadError on API error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ code: 'NOT_FOUND', message: 'Book not found' }),
      });

      const sdk = new Openread({
        baseUrl: 'https://api.example.com',
        getAccessToken: async () => 'token',
      });

      await expect(sdk.fetch('/api/books/123')).rejects.toThrow(OpenreadError);
    });

    it('throws OpenreadError with correct properties', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({
          code: 'NOT_FOUND',
          message: 'Book not found',
          details: { bookId: '123' },
        }),
      });

      const sdk = new Openread({
        baseUrl: 'https://api.example.com',
        getAccessToken: async () => 'token',
      });

      try {
        await sdk.fetch('/api/books/123');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(OpenreadError);
        const error = err as OpenreadError;
        expect(error.code).toBe('NOT_FOUND');
        expect(error.message).toBe('Book not found');
        expect(error.status).toBe(404);
        expect(error.details).toEqual({ bookId: '123' });
      }
    });

    it('handles non-JSON error responses', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      const sdk = new Openread({
        baseUrl: 'https://api.example.com',
        getAccessToken: async () => 'token',
      });

      try {
        await sdk.fetch('/api/test');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(OpenreadError);
        const error = err as OpenreadError;
        expect(error.code).toBe('INTERNAL_ERROR');
        expect(error.message).toBe('Internal Server Error');
        expect(error.status).toBe(500);
      }
    });

    it('retries on 401 if token changes', async () => {
      let tokenCallCount = 0;
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ code: 'UNAUTHORIZED' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        });

      const sdk = new Openread({
        baseUrl: 'https://api.example.com',
        getAccessToken: async () => {
          tokenCallCount++;
          return tokenCallCount === 1 ? 'old-token' : 'new-token';
        },
      });

      const result = await sdk.fetch('/api/test');

      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('does not retry on 401 if token remains the same', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ code: 'UNAUTHORIZED', message: 'Invalid token' }),
      });

      const sdk = new Openread({
        baseUrl: 'https://api.example.com',
        getAccessToken: async () => 'same-token',
      });

      try {
        await sdk.fetch('/api/test');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(OpenreadError);
        const error = err as OpenreadError;
        expect(error.code).toBe('UNAUTHORIZED');
        expect(error.status).toBe(401);
      }

      // Should only call fetch once (no retry since token didn't change)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('does not retry on 401 if new token is null', async () => {
      let tokenCallCount = 0;
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ code: 'UNAUTHORIZED', message: 'Invalid token' }),
      });

      const sdk = new Openread({
        baseUrl: 'https://api.example.com',
        getAccessToken: async () => {
          tokenCallCount++;
          return tokenCallCount === 1 ? 'old-token' : null;
        },
      });

      try {
        await sdk.fetch('/api/test');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(OpenreadError);
        const error = err as OpenreadError;
        expect(error.code).toBe('UNAUTHORIZED');
      }

      // Should only call fetch once (no retry since new token is null)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('retries only once on 401 (no infinite retry loop)', async () => {
      let tokenCallCount = 0;
      // Both attempts return 401
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ code: 'UNAUTHORIZED', message: 'Still invalid' }),
      });

      const sdk = new Openread({
        baseUrl: 'https://api.example.com',
        getAccessToken: async () => {
          tokenCallCount++;
          // Return different tokens each time to allow retry
          return `token-${tokenCallCount}`;
        },
      });

      try {
        await sdk.fetch('/api/test');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(OpenreadError);
        const error = err as OpenreadError;
        expect(error.code).toBe('UNAUTHORIZED');
      }

      // Should call fetch exactly twice: initial + one retry
      expect(mockFetch).toHaveBeenCalledTimes(2);
      // Token callback called twice: initial request + refresh attempt
      expect(tokenCallCount).toBe(2);
    });

    it('uses lock to prevent concurrent token refreshes', async () => {
      let refreshCallCount = 0;
      const callTimes: number[] = [];

      // Mock SDK to track when getAccessToken is called
      const sdk = new Openread({
        baseUrl: 'https://api.example.com',
        getAccessToken: async () => {
          refreshCallCount++;
          const callTime = Date.now();
          callTimes.push(callTime);
          // Simulate slow token refresh
          await new Promise((r) => setTimeout(r, 50));
          return 'token';
        },
      });

      // Access the private refreshTokenWithLock method via any
      const sdkAny = sdk as unknown as { refreshTokenWithLock: () => Promise<string | null> };

      // Call refresh concurrently
      const [token1, token2, token3] = await Promise.all([
        sdkAny.refreshTokenWithLock(),
        sdkAny.refreshTokenWithLock(),
        sdkAny.refreshTokenWithLock(),
      ]);

      // All should get the same token
      expect(token1).toBe('token');
      expect(token2).toBe('token');
      expect(token3).toBe('token');

      // Due to the lock, only ONE actual refresh should happen
      // (not 3 concurrent refreshes)
      expect(refreshCallCount).toBe(1);
    });

    it('handles 204 No Content', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
        json: async () => {
          throw new Error('No content');
        },
      });

      const sdk = new Openread({
        baseUrl: 'https://api.example.com',
        getAccessToken: async () => 'token',
      });

      const result = await sdk.fetch('/api/books/123');

      expect(result).toBeUndefined();
    });

    it('passes through request init options', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ created: true }),
      });

      const sdk = new Openread({
        baseUrl: 'https://api.example.com',
        getAccessToken: async () => 'token',
      });

      await sdk.fetch('/api/books', {
        method: 'POST',
        body: JSON.stringify({ title: 'Test Book' }),
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/books',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ title: 'Test Book' }),
        })
      );
    });

    it('allows custom headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      const sdk = new Openread({
        baseUrl: 'https://api.example.com',
        getAccessToken: async () => 'token',
      });

      await sdk.fetch('/api/test', {
        headers: {
          'X-Custom-Header': 'custom-value',
        },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom-Header': 'custom-value',
            Authorization: 'Bearer token',
          }),
        })
      );
    });
  });
});

describe('OpenreadError', () => {
  it('creates error with code and message', () => {
    const error = new OpenreadError('NOT_FOUND', 'Book not found');

    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('Book not found');
    expect(error.name).toBe('OpenreadError');
  });

  it('extends Error', () => {
    const error = new OpenreadError('NOT_FOUND', 'Book not found');

    expect(error).toBeInstanceOf(Error);
  });

  it('includes details and status when provided', () => {
    const error = new OpenreadError('VALIDATION_ERROR', 'Invalid input', {
      details: { field: 'title', reason: 'required' },
      status: 400,
    });

    expect(error.details).toEqual({ field: 'title', reason: 'required' });
    expect(error.status).toBe(400);
  });

  it('has undefined details and status when not provided', () => {
    const error = new OpenreadError('INTERNAL_ERROR', 'Server error');

    expect(error.details).toBeUndefined();
    expect(error.status).toBeUndefined();
  });

  it('is catchable as Error', () => {
    const error = new OpenreadError('NOT_FOUND', 'Not found');

    try {
      throw error;
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(e).toBeInstanceOf(OpenreadError);
    }
  });
});

describe('AuthClient', () => {
  let sdk: Openread;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
    sdk = new Openread({
      baseUrl: 'https://api.example.com',
      getAccessToken: async () => 'test-token',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getUser', () => {
    it('returns user profile on success', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        createdAt: '2024-01-01T00:00:00Z',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockUser,
      });

      const user = await sdk.auth.getUser();

      expect(user).toEqual(mockUser);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/auth/me',
        expect.anything()
      );
    });

    it('throws OpenreadError on 401', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ code: 'UNAUTHORIZED', message: 'Invalid token' }),
      });

      // Use a token that won't change on retry
      sdk = new Openread({
        baseUrl: 'https://api.example.com',
        getAccessToken: async () => 'same-token',
      });

      await expect(sdk.auth.getUser()).rejects.toThrow(OpenreadError);

      try {
        await sdk.auth.getUser();
      } catch (err) {
        expect(err).toBeInstanceOf(OpenreadError);
        const error = err as OpenreadError;
        expect(error.code).toBe('UNAUTHORIZED');
      }
    });
  });

  describe('isAuthenticated', () => {
    it('returns true when authenticated', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
        json: async () => {
          throw new Error('No content');
        },
      });

      const result = await sdk.auth.isAuthenticated();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/auth/verify',
        expect.anything()
      );
    });

    it('returns false on auth failure (does not throw)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ code: 'UNAUTHORIZED' }),
      });

      // Use a token that won't change on retry
      sdk = new Openread({
        baseUrl: 'https://api.example.com',
        getAccessToken: async () => 'same-token',
      });

      const result = await sdk.auth.isAuthenticated();

      expect(result).toBe(false);
    });

    it('throws on network error (does not conflate with auth failure)', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(sdk.auth.isAuthenticated()).rejects.toThrow('Network error');
    });

    it('returns false on FORBIDDEN error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ code: 'FORBIDDEN' }),
      });

      // Use a token that won't change on retry
      sdk = new Openread({
        baseUrl: 'https://api.example.com',
        getAccessToken: async () => 'same-token',
      });

      const result = await sdk.auth.isAuthenticated();

      expect(result).toBe(false);
    });
  });

  describe('hasToken', () => {
    it('returns true when token callback succeeds', async () => {
      const result = await sdk.auth.hasToken();

      expect(result).toBe(true);
    });

    it('throws when token callback throws unexpected error', async () => {
      sdk = new Openread({
        baseUrl: 'https://api.example.com',
        getAccessToken: async () => {
          throw new Error('Callback bug - not an auth error');
        },
      });

      // Non-OpenreadError exceptions should propagate to help developers find bugs
      await expect(sdk.auth.hasToken()).rejects.toThrow('Callback bug - not an auth error');
    });

    it('returns false when token callback throws OpenreadError UNAUTHORIZED', async () => {
      sdk = new Openread({
        baseUrl: 'https://api.example.com',
        getAccessToken: async () => {
          throw new OpenreadError('UNAUTHORIZED', 'Not authenticated');
        },
      });

      // UNAUTHORIZED errors are expected and should return false
      const result = await sdk.auth.hasToken();
      expect(result).toBe(false);
    });

    it('returns false when token is empty string', async () => {
      sdk = new Openread({
        baseUrl: 'https://api.example.com',
        getAccessToken: async () => '',
      });

      const result = await sdk.auth.hasToken();

      expect(result).toBe(false);
    });

    it('returns false when token is null', async () => {
      sdk = new Openread({
        baseUrl: 'https://api.example.com',
        getAccessToken: async () => null,
      });

      const result = await sdk.auth.hasToken();

      expect(result).toBe(false);
    });
  });
});

describe('BooksClient', () => {
  let sdk: Openread;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
    sdk = new Openread({
      baseUrl: 'https://api.example.com',
      getAccessToken: async () => 'test-token',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('list', () => {
    it('returns paginated books', async () => {
      const mockResponse = {
        books: [
          {
            id: 'book-1',
            hash: 'abc123',
            metaHash: 'def456',
            title: 'Test Book',
            author: 'Test Author',
            format: 'epub',
            sizeBytes: 1000000,
            storagePath: 'users/user-1/books/book-1.epub',
            userId: 'user-1',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await sdk.books.list();

      expect(result.books).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/books?page=1&pageSize=20',
        expect.anything()
      );
    });

    it('respects pagination parameters', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ books: [], total: 0, page: 2, pageSize: 50 }),
      });

      await sdk.books.list(2, 50);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/books?page=2&pageSize=50',
        expect.anything()
      );
    });

    it('caps pageSize at 100', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ books: [], total: 0, page: 1, pageSize: 100 }),
      });

      await sdk.books.list(1, 500);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/books?page=1&pageSize=100',
        expect.anything()
      );
    });
  });

  describe('get', () => {
    it('returns book by id', async () => {
      const mockBook = {
        id: 'book-123',
        title: 'Test Book',
        format: 'epub',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockBook,
      });

      const book = await sdk.books.get('book-123');

      expect(book.id).toBe('book-123');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/books/book-123',
        expect.anything()
      );
    });

    it('throws NOT_FOUND for missing book', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ code: 'NOT_FOUND', message: 'Book not found' }),
      });

      await expect(sdk.books.get('missing')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('encodes special characters in id', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 'book/with/slashes' }),
      });

      await sdk.books.get('book/with/slashes');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/books/book%2Fwith%2Fslashes',
        expect.anything()
      );
    });
  });

  describe('exists', () => {
    it('returns true when book exists', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 'book-1' }),
      });

      const result = await sdk.books.exists('abc123hash');

      expect(result).toBe(true);
    });

    it('returns false when book not found', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ code: 'NOT_FOUND', message: 'Not found' }),
      });

      const result = await sdk.books.exists('nonexistent');

      expect(result).toBe(false);
    });

    it('throws on other errors (500)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ code: 'INTERNAL_ERROR', message: 'Server error' }),
      });

      await expect(sdk.books.exists('hash')).rejects.toThrow(OpenreadError);
    });

    it('encodes special characters in hash', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 'book-1' }),
      });

      await sdk.books.exists('hash+with+plus');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/books/hash/hash%2Bwith%2Bplus',
        expect.anything()
      );
    });
  });

  describe('getByHash', () => {
    it('returns book when found', async () => {
      const mockBook = { id: 'book-1', title: 'Found Book' };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockBook,
      });

      const result = await sdk.books.getByHash('abc123');

      expect(result).toEqual(mockBook);
    });

    it('returns null when not found', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ code: 'NOT_FOUND' }),
      });

      const result = await sdk.books.getByHash('nonexistent');

      expect(result).toBeNull();
    });

    it('throws on other errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ code: 'INTERNAL_ERROR', message: 'Server error' }),
      });

      await expect(sdk.books.getByHash('hash')).rejects.toThrow(OpenreadError);
    });
  });

  describe('getDownloadUrl', () => {
    it('returns download URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ downloadUrl: 'https://r2.example.com/file.epub' }),
      });

      const url = await sdk.books.getDownloadUrl('book-123');

      expect(url).toBe('https://r2.example.com/file.epub');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/books/book-123/download',
        expect.anything()
      );
    });

    it('encodes special characters in id', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ downloadUrl: 'https://r2.example.com/file.epub' }),
      });

      await sdk.books.getDownloadUrl('book/with/slashes');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/books/book%2Fwith%2Fslashes/download',
        expect.anything()
      );
    });
  });
});
