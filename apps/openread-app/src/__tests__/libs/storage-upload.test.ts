import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFetchWithAuth, mockWebUpload } = vi.hoisted(() => ({
  mockFetchWithAuth: vi.fn(),
  mockWebUpload: vi.fn(async () => {}),
}));

vi.mock('@/utils/fetch', () => ({
  fetchWithAuth: mockFetchWithAuth,
}));
vi.mock('@/services/environment', () => ({
  getProductAPIBaseUrl: () => 'https://api.example.com/api',
  isWebAppPlatform: () => true,
}));
vi.mock('@/utils/transfer', () => ({
  tauriUpload: vi.fn(),
  tauriDownload: vi.fn(),
  webUpload: mockWebUpload,
  webDownload: vi.fn(),
}));
vi.mock('@/services/coverPipelineObservability', () => ({
  captureCoverPipelineWarning: vi.fn(),
}));

import { uploadFile } from '@/libs/storage';

const PDF_FIXTURE = resolve(process.cwd(), 'e2e/fixtures/books/openread-e2e-mobile-fixed.pdf');

describe('book file upload intents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uploads the real PDF fixture through the generic file-intent path', async () => {
    const bytes = new Uint8Array(readFileSync(PDF_FIXTURE));
    const file = new File([bytes], 'openread-e2e-mobile-fixed.pdf', {
      type: 'application/pdf',
    });
    mockFetchWithAuth
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            fileId: 'file-1',
            objectKey: 'users/user-1/books/file-1.pdf',
            uploadUrl: 'https://r2.example.com/signed',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    await expect(
      uploadFile(file, '/books/openread-e2e-mobile-fixed.pdf', undefined, 'book-hash'),
    ).resolves.toBeUndefined();

    expect(file.size).toBe(911);
    expect(mockFetchWithAuth).toHaveBeenNthCalledWith(
      1,
      'https://api.example.com/api/files/upload-intent',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          kind: 'user_book_file',
          fileId: 'book-hash',
          bookHash: 'book-hash',
          filename: 'openread-e2e-mobile-fixed.pdf',
          sizeBytes: 911,
        }),
      }),
    );
    expect(mockWebUpload).toHaveBeenCalledWith(file, 'https://r2.example.com/signed', undefined);
    expect(mockFetchWithAuth).toHaveBeenNthCalledWith(
      2,
      'https://api.example.com/api/files/confirm-upload',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
