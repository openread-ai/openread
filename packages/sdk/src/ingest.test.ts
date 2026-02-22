import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Openread, OpenreadError } from './index.js';

describe('IngestClient', () => {
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

  describe('getUploadUrl', () => {
    it('requests upload URL with correct parameters', async () => {
      const mockResponse = {
        uploadUrl: 'https://r2.example.com/signed',
        bookId: 'book-123',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await sdk.ingest.getUploadUrl({
        format: 'epub',
        sizeBytes: 1000000,
        hash: 'a'.repeat(64),
        metaHash: 'b'.repeat(64),
        title: 'Test Book',
      });

      expect(result.uploadUrl).toBe(mockResponse.uploadUrl);
      expect(result.bookId).toBe(mockResponse.bookId);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/books/upload-url',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            format: 'epub',
            sizeBytes: 1000000,
            hash: 'a'.repeat(64),
            metaHash: 'b'.repeat(64),
            title: 'Test Book',
          }),
        })
      );
    });

    it('includes author when provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ uploadUrl: 'https://r2.example.com/signed', bookId: 'book-123' }),
      });

      await sdk.ingest.getUploadUrl({
        format: 'pdf',
        sizeBytes: 500000,
        hash: 'c'.repeat(64),
        metaHash: 'd'.repeat(64),
        title: 'Test Book',
        author: 'Test Author',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"author":"Test Author"'),
        })
      );
    });

    it('throws OpenreadError on API error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ code: 'VALIDATION_ERROR', message: 'Invalid format' }),
      });

      await expect(
        sdk.ingest.getUploadUrl({
          format: 'epub',
          sizeBytes: 1000000,
          hash: 'a'.repeat(64),
          metaHash: 'b'.repeat(64),
          title: 'Test',
        })
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        message: 'Invalid format',
      });
    });
  });

  describe('upload', () => {
    it('uploads file with PUT request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      const file = new Blob(['test content'], { type: 'application/epub+zip' });
      await sdk.ingest.upload('https://r2.example.com/signed', file);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://r2.example.com/signed',
        expect.objectContaining({
          method: 'PUT',
          body: file,
          headers: {
            'Content-Type': 'application/epub+zip',
          },
        })
      );
    });

    it('uses default content type when not provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      const file = new Blob(['test content']);
      await sdk.ingest.upload('https://r2.example.com/signed', file);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/octet-stream',
          },
        })
      );
    });

    it('throws UPLOAD_FAILED on non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      const file = new Blob(['test content']);

      await expect(sdk.ingest.upload('https://r2.example.com/signed', file)).rejects.toMatchObject({
        code: 'UPLOAD_FAILED',
      });
    });

    it('throws UPLOAD_EXPIRED on 403 response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
      });

      const file = new Blob(['test content']);

      await expect(sdk.ingest.upload('https://r2.example.com/signed', file)).rejects.toMatchObject({
        code: 'UPLOAD_EXPIRED',
        message: 'Upload URL has expired. Please request a new one.',
      });
    });

    it('throws UPLOAD_CANCELLED when signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      const file = new Blob(['test content']);

      await expect(
        sdk.ingest.upload('https://r2.example.com/signed', file, { signal: controller.signal })
      ).rejects.toMatchObject({
        code: 'UPLOAD_CANCELLED',
      });

      // fetch should not have been called
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('confirm', () => {
    it('confirms upload with bookId', async () => {
      const mockResponse = {
        book: {
          id: 'book-123',
          title: 'Test Book',
          author: 'Test Author',
          format: 'epub',
          hash: 'a'.repeat(64),
          metaHash: 'b'.repeat(64),
          sizeBytes: 1000000,
          storagePath: 'users/user-1/books/book-123.epub',
          userId: 'user-1',
          createdAt: '2024-01-15T00:00:00Z',
          updatedAt: '2024-01-15T00:00:00Z',
        },
        metadata: {
          titleSource: 'extracted' as const,
          authorSource: 'extracted' as const,
          warnings: [],
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => mockResponse,
      });

      const result = await sdk.ingest.confirm({
        bookId: 'book-123',
      });

      expect(result.book.title).toBe('Test Book');
      expect(result.metadata.titleSource).toBe('extracted');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/books/confirm',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ bookId: 'book-123' }),
        })
      );
    });

    it('allows title override', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          book: { id: 'book-123', title: 'Custom Title' },
          metadata: { titleSource: 'provided', authorSource: null, warnings: [] },
        }),
      });

      const result = await sdk.ingest.confirm({
        bookId: 'book-123',
        title: 'Custom Title',
      });

      expect(result.metadata.titleSource).toBe('provided');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"title":"Custom Title"'),
        })
      );
    });

    it('allows author override', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          book: { id: 'book-123', author: 'Custom Author' },
          metadata: { titleSource: 'extracted', authorSource: 'provided', warnings: [] },
        }),
      });

      const result = await sdk.ingest.confirm({
        bookId: 'book-123',
        author: 'Custom Author',
      });

      expect(result.metadata.authorSource).toBe('provided');
    });
  });

  describe('exists', () => {
    it('returns true when book exists', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 'book-1' }),
      });

      const result = await sdk.ingest.exists('a'.repeat(64));

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        `https://api.example.com/api/books/hash/${'a'.repeat(64)}`,
        expect.anything()
      );
    });

    it('returns false when not found', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ code: 'NOT_FOUND' }),
      });

      const result = await sdk.ingest.exists('nonexistent');

      expect(result).toBe(false);
    });

    it('throws on other errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ code: 'INTERNAL_ERROR', message: 'Server error' }),
      });

      await expect(sdk.ingest.exists('hash')).rejects.toThrow(OpenreadError);
    });

    it('encodes special characters in hash', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 'book-1' }),
      });

      await sdk.ingest.exists('hash+with+plus');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/books/hash/hash%2Bwith%2Bplus',
        expect.anything()
      );
    });
  });

  describe('uploadBook', () => {
    beforeEach(() => {
      // Mock crypto.subtle.digest for hash computation
      vi.spyOn(crypto.subtle, 'digest').mockResolvedValue(new Uint8Array(32).buffer);
    });

    it('completes full upload flow', async () => {
      const file = new File(['test content'], 'test-book.epub', {
        type: 'application/epub+zip',
      });

      // Mock API calls in sequence
      mockFetch
        // getUploadUrl
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            uploadUrl: 'https://r2.example.com/signed',
            bookId: 'book-123',
          }),
        })
        // upload to R2
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
        })
        // confirm
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({
            book: { id: 'book-123', title: 'Test Book', format: 'epub' },
            metadata: { titleSource: 'extracted', authorSource: null, warnings: [] },
          }),
        });

      const progressUpdates: number[] = [];
      const result = await sdk.ingest.uploadBook(file, {
        onProgress: (p) => progressUpdates.push(p),
      });

      expect(result.book.id).toBe('book-123');
      expect(progressUpdates).toContain(0);
      expect(progressUpdates).toContain(100);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('passes title and author to API calls', async () => {
      const file = new File(['test content'], 'test-book.epub', {
        type: 'application/epub+zip',
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            uploadUrl: 'https://r2.example.com/signed',
            bookId: 'book-123',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({
            book: { id: 'book-123', title: 'Custom Title' },
            metadata: { titleSource: 'provided', authorSource: 'provided', warnings: [] },
          }),
        });

      await sdk.ingest.uploadBook(file, {
        title: 'Custom Title',
        author: 'Custom Author',
      });

      // Check getUploadUrl call
      const uploadUrlCall = mockFetch.mock.calls[0];
      const uploadUrlBody = JSON.parse(uploadUrlCall[1].body);
      expect(uploadUrlBody.title).toBe('Custom Title');
      expect(uploadUrlBody.author).toBe('Custom Author');

      // Check confirm call
      const confirmCall = mockFetch.mock.calls[2];
      const confirmBody = JSON.parse(confirmCall[1].body);
      expect(confirmBody.title).toBe('Custom Title');
      expect(confirmBody.author).toBe('Custom Author');
    });

    it('extracts title from filename when not provided', async () => {
      const file = new File(['test content'], 'my-awesome-book.epub', {
        type: 'application/epub+zip',
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            uploadUrl: 'https://r2.example.com/signed',
            bookId: 'book-123',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({
            book: { id: 'book-123' },
            metadata: { titleSource: 'filename', authorSource: null, warnings: [] },
          }),
        });

      await sdk.ingest.uploadBook(file);

      const uploadUrlCall = mockFetch.mock.calls[0];
      const uploadUrlBody = JSON.parse(uploadUrlCall[1].body);
      expect(uploadUrlBody.title).toBe('my awesome book');
    });

    it('rejects invalid file format', async () => {
      const file = new File(['content'], 'test.txt');

      await expect(sdk.ingest.uploadBook(file)).rejects.toMatchObject({
        code: 'INVALID_FORMAT',
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects .doc files', async () => {
      const file = new File(['content'], 'test.doc');

      await expect(sdk.ingest.uploadBook(file)).rejects.toMatchObject({
        code: 'INVALID_FORMAT',
        message: expect.stringContaining('.epub or .pdf'),
      });
    });

    it('accepts .epub files', async () => {
      const file = new File(['content'], 'test.epub', { type: 'application/epub+zip' });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ uploadUrl: 'url', bookId: 'id' }),
        })
        .mockResolvedValueOnce({ ok: true, status: 200 })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({
            book: { id: 'id' },
            metadata: { titleSource: 'filename', authorSource: null, warnings: [] },
          }),
        });

      await sdk.ingest.uploadBook(file);

      const uploadUrlCall = mockFetch.mock.calls[0];
      const body = JSON.parse(uploadUrlCall[1].body);
      expect(body.format).toBe('epub');
    });

    it('accepts .pdf files', async () => {
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ uploadUrl: 'url', bookId: 'id' }),
        })
        .mockResolvedValueOnce({ ok: true, status: 200 })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({
            book: { id: 'id' },
            metadata: { titleSource: 'filename', authorSource: null, warnings: [] },
          }),
        });

      await sdk.ingest.uploadBook(file);

      const uploadUrlCall = mockFetch.mock.calls[0];
      const body = JSON.parse(uploadUrlCall[1].body);
      expect(body.format).toBe('pdf');
    });

    it('can be cancelled before starting', async () => {
      const file = new File(['content'], 'test.epub');
      const controller = new AbortController();
      controller.abort();

      await expect(
        sdk.ingest.uploadBook(file, { signal: controller.signal })
      ).rejects.toMatchObject({
        code: 'UPLOAD_CANCELLED',
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('can be cancelled during hash computation', async () => {
      const file = new File(['content'], 'test.epub');
      const controller = new AbortController();

      // Delay hash computation to allow abort
      vi.spyOn(crypto.subtle, 'digest').mockImplementation(async () => {
        controller.abort();
        return new Uint8Array(32).buffer;
      });

      await expect(
        sdk.ingest.uploadBook(file, { signal: controller.signal })
      ).rejects.toMatchObject({
        code: 'UPLOAD_CANCELLED',
      });
    });

    it('handles getUploadUrl error', async () => {
      const file = new File(['content'], 'test.epub');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ code: 'VALIDATION_ERROR', message: 'File too large' }),
      });

      await expect(sdk.ingest.uploadBook(file)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        message: 'File too large',
      });
    });

    it('handles upload error', async () => {
      const file = new File(['content'], 'test.epub');

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ uploadUrl: 'url', bookId: 'id' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        });

      await expect(sdk.ingest.uploadBook(file)).rejects.toMatchObject({
        code: 'UPLOAD_FAILED',
      });
    });

    it('handles confirm error', async () => {
      const file = new File(['content'], 'test.epub');

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ uploadUrl: 'url', bookId: 'id' }),
        })
        .mockResolvedValueOnce({ ok: true, status: 200 })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({ code: 'INTERNAL_ERROR', message: 'Database error' }),
        });

      await expect(sdk.ingest.uploadBook(file)).rejects.toMatchObject({
        code: 'INTERNAL_ERROR',
        message: 'Database error',
      });
    });

    it('reports progress at each stage', async () => {
      const file = new File(['content'], 'test.epub');

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ uploadUrl: 'url', bookId: 'id' }),
        })
        .mockResolvedValueOnce({ ok: true, status: 200 })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({
            book: { id: 'id' },
            metadata: { titleSource: 'filename', authorSource: null, warnings: [] },
          }),
        });

      const progressUpdates: number[] = [];
      await sdk.ingest.uploadBook(file, {
        onProgress: (p) => progressUpdates.push(p),
      });

      // Should have progress updates at: 0, 5, 10, 90, 100
      expect(progressUpdates[0]).toBe(0);
      expect(progressUpdates).toContain(5);
      expect(progressUpdates).toContain(10);
      expect(progressUpdates).toContain(90);
      expect(progressUpdates[progressUpdates.length - 1]).toBe(100);
    });
  });

  describe('computeHash', () => {
    it('computes SHA-256 hash of file content', async () => {
      // Mock a specific hash result
      const expectedHash = new Uint8Array([
        0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef, 0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd,
        0xef, 0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef, 0x01, 0x23, 0x45, 0x67, 0x89, 0xab,
        0xcd, 0xef,
      ]);
      vi.spyOn(crypto.subtle, 'digest').mockResolvedValue(expectedHash.buffer);

      const file = new File(['test content'], 'test.epub');
      const hash = await sdk.ingest.computeHash(file);

      expect(hash).toBe('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
      expect(crypto.subtle.digest).toHaveBeenCalledWith('SHA-256', expect.any(ArrayBuffer));
    });
  });
});
