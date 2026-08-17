import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchWithTimeout = vi.hoisted(() => vi.fn());

vi.mock('@/utils/fetch', () => ({ fetchWithTimeout }));
vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
  }),
}));

import { GoogleBooksProvider } from '@/services/metadata/providers/googlebooks';

const API_KEY = 'test-google-books-api-key-123456789';

beforeEach(() => {
  vi.clearAllMocks();
  fetchWithTimeout.mockResolvedValue(
    new Response(
      JSON.stringify({
        items: [
          {
            volumeInfo: {
              title: 'Test Book',
              authors: ['Test Author'],
              industryIdentifiers: [{ type: 'ISBN_13', identifier: '9781234567890' }],
            },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ),
  );
});

describe('GoogleBooksProvider credential handling', () => {
  it('sends the API key only in the x-goog-api-key header for ISBN search', async () => {
    const provider = new GoogleBooksProvider(API_KEY);

    await provider.search({ isbn: '9781234567890' });

    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
    const [url, options] = fetchWithTimeout.mock.calls[0]!;
    expect(url).toBe('https://www.googleapis.com/books/v1/volumes?q=isbn:9781234567890');
    expect(url).not.toContain(API_KEY);
    expect(url).not.toContain('key=');
    expect(new Headers(options.headers).get('x-goog-api-key')).toBe(API_KEY);
  });

  it('sends the API key only in the x-goog-api-key header for title search', async () => {
    const provider = new GoogleBooksProvider(API_KEY);

    await provider.search({ title: 'Test Book', author: 'Test Author' });

    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
    const [url, options] = fetchWithTimeout.mock.calls[0]!;
    expect(url).not.toContain(API_KEY);
    expect(url).not.toContain('key=');
    expect(new Headers(options.headers).get('x-goog-api-key')).toBe(API_KEY);
  });

  it.each([
    '',
    'short',
    ` ${API_KEY}`,
    `${API_KEY} `,
    `${API_KEY},another-key-with-enough-length`,
    'a'.repeat(257),
  ])('rejects invalid or multi-key configuration', (value) => {
    expect(() => new GoogleBooksProvider(value)).toThrow(
      'Invalid Google Books API key configuration',
    );
  });
});
