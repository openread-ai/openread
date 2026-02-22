/**
 * @module @openread/sdk/ingest
 * IngestClient for uploading books to the OpenRead platform.
 */

import type {
  Book,
  BookFormat,
  UploadUrlRequest,
  UploadUrlResponse,
  ConfirmUploadRequest,
  ConfirmUploadResponse,
  MetadataDetails,
} from '@openread/types';
import { OpenreadError } from './error.js';
import type { Openread } from './index.js';

/**
 * Options for uploading a book.
 */
export interface UploadOptions {
  /**
   * Override extracted title.
   */
  title?: string;

  /**
   * Override extracted author.
   */
  author?: string;

  /**
   * Progress callback (0-100).
   * Called at various stages of the upload process.
   */
  onProgress?: (progress: number) => void;

  /**
   * Abort signal for cancellation.
   */
  signal?: AbortSignal;
}

/**
 * Result of a successful book upload.
 */
export interface UploadResult {
  /**
   * The created book entity.
   */
  book: Book;

  /**
   * Metadata extraction details.
   */
  metadata: MetadataDetails;
}

/**
 * Client for uploading books to the platform.
 *
 * Provides methods for the complete upload flow:
 * 1. getUploadUrl() - Request a signed URL for upload
 * 2. upload() - Upload the file directly to R2
 * 3. confirm() - Confirm the upload and create the book record
 * 4. uploadBook() - Convenience method that combines all steps
 *
 * @example
 * ```typescript
 * // Simple one-liner upload
 * const { book } = await sdk.ingest.uploadBook(file, {
 *   onProgress: (p) => console.log(`${p}%`),
 * });
 *
 * // Or step-by-step for more control
 * const { uploadUrl, bookId } = await sdk.ingest.getUploadUrl({
 *   format: 'epub',
 *   sizeBytes: file.size,
 *   hash: await computeHash(file),
 *   metaHash: await computeMetaHash(metadata),
 *   title: 'My Book',
 * });
 * await sdk.ingest.upload(uploadUrl, file);
 * const { book } = await sdk.ingest.confirm({ bookId });
 * ```
 */
export class IngestClient {
  /** @internal */
  readonly _sdk: Openread;

  constructor(sdk: Openread) {
    this._sdk = sdk;
  }

  /**
   * Request a signed URL for uploading a book.
   *
   * @param params - File metadata for the upload
   * @returns Upload URL and book ID
   *
   * @example
   * ```typescript
   * const { uploadUrl, bookId } = await sdk.ingest.getUploadUrl({
   *   format: 'epub',
   *   sizeBytes: file.size,
   *   hash: await computeHash(file),
   *   metaHash: await computeMetaHash(metadata),
   *   title: 'My Book',
   * });
   * ```
   */
  async getUploadUrl(params: UploadUrlRequest): Promise<UploadUrlResponse> {
    return this._sdk.fetch<UploadUrlResponse>('/api/books/upload-url', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /**
   * Upload a file to R2 using a signed URL.
   *
   * Supports progress tracking via XMLHttpRequest for browsers.
   * Falls back to simple fetch when progress tracking is not needed.
   *
   * @param uploadUrl - Signed URL from getUploadUrl()
   * @param file - File or Blob to upload
   * @param options - Upload options (progress callback, abort signal)
   *
   * @example
   * ```typescript
   * await sdk.ingest.upload(uploadUrl, file, {
   *   onProgress: (progress) => console.log(`${progress}%`),
   * });
   * ```
   */
  async upload(
    uploadUrl: string,
    file: File | Blob,
    options: Pick<UploadOptions, 'onProgress' | 'signal'> = {}
  ): Promise<void> {
    const { onProgress, signal } = options;

    // Check if cancelled before starting
    if (signal?.aborted) {
      throw new OpenreadError('UPLOAD_CANCELLED', 'Upload was cancelled');
    }

    // Use XMLHttpRequest for progress tracking
    if (onProgress && typeof XMLHttpRequest !== 'undefined') {
      await this.uploadWithProgress(uploadUrl, file, onProgress, signal);
    } else {
      // Simple fetch for no-progress uploads or non-browser environments
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
        },
        signal,
      });

      if (!response.ok) {
        throw this.handleUploadError(response);
      }
    }
  }

  /**
   * Upload with progress tracking using XMLHttpRequest.
   * @internal
   */
  private uploadWithProgress(
    url: string,
    file: File | Blob,
    onProgress: (progress: number) => void,
    signal?: AbortSignal
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          onProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(
            new OpenreadError('UPLOAD_FAILED', `Upload failed: ${xhr.status}`, {
              status: xhr.status,
            })
          );
        }
      });

      xhr.addEventListener('error', () => {
        reject(new OpenreadError('NETWORK_ERROR', 'Network error during upload'));
      });

      xhr.addEventListener('abort', () => {
        reject(new OpenreadError('UPLOAD_CANCELLED', 'Upload was cancelled'));
      });

      // Handle abort signal
      if (signal) {
        if (signal.aborted) {
          reject(new OpenreadError('UPLOAD_CANCELLED', 'Upload was cancelled'));
          return;
        }
        signal.addEventListener('abort', () => {
          xhr.abort();
        });
      }

      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.send(file);
    });
  }

  /**
   * Handle upload error responses.
   * @internal
   */
  private handleUploadError(response: Response): OpenreadError {
    if (response.status === 403) {
      return new OpenreadError(
        'UPLOAD_EXPIRED',
        'Upload URL has expired. Please request a new one.',
        { status: 403 }
      );
    }

    return new OpenreadError(
      'UPLOAD_FAILED',
      `Upload failed with status ${response.status}`,
      { status: response.status }
    );
  }

  /**
   * Confirm a book upload and create the database record.
   *
   * @param params - Confirmation params
   * @returns Created book with metadata info
   *
   * @example
   * ```typescript
   * const { book, metadata } = await sdk.ingest.confirm({
   *   bookId,
   *   title: 'Custom Title', // Optional override
   * });
   * ```
   */
  async confirm(params: ConfirmUploadRequest): Promise<ConfirmUploadResponse> {
    return this._sdk.fetch<ConfirmUploadResponse>('/api/books/confirm', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  /**
   * Upload a book with a single method call.
   *
   * This convenience method handles the full upload flow:
   * 1. Check file format
   * 2. Compute file hash
   * 3. Request upload URL
   * 4. Upload file to R2
   * 5. Confirm upload
   *
   * @param file - File to upload (must be .epub or .pdf)
   * @param options - Upload options
   * @returns Created book with metadata
   *
   * @example
   * ```typescript
   * const result = await sdk.ingest.uploadBook(file, {
   *   title: 'My Book', // Optional override
   *   onProgress: (p) => setProgress(p),
   * });
   *
   * console.log(result.book.title);
   * ```
   */
  async uploadBook(file: File, options: UploadOptions = {}): Promise<UploadResult> {
    const { title, author, onProgress, signal } = options;

    // Check if cancelled before starting
    if (signal?.aborted) {
      throw new OpenreadError('UPLOAD_CANCELLED', 'Upload was cancelled');
    }

    // Determine format from filename
    const format = this.getFormat(file.name);
    if (!format) {
      throw new OpenreadError(
        'INVALID_FORMAT',
        'Unsupported file format. File must be .epub or .pdf'
      );
    }

    // Report initial progress
    onProgress?.(0);

    // Compute file hash
    const hash = await this.computeHash(file);

    // Check if cancelled after hash computation
    if (signal?.aborted) {
      throw new OpenreadError('UPLOAD_CANCELLED', 'Upload was cancelled');
    }

    onProgress?.(5);

    // Compute metadata hash (simplified - just hash the title for now)
    // In a real implementation, this would hash the extracted metadata
    const metaHash = await this.computeMetaHash(title || file.name);

    // Get upload URL
    const uploadInfo = await this.getUploadUrl({
      format,
      sizeBytes: file.size,
      hash,
      metaHash,
      title: title || this.extractTitleFromFilename(file.name),
      author,
    });

    // Check if cancelled after getting URL
    if (signal?.aborted) {
      throw new OpenreadError('UPLOAD_CANCELLED', 'Upload was cancelled');
    }

    onProgress?.(10);

    // Upload file (reports progress 10-90)
    await this.upload(uploadInfo.uploadUrl, file, {
      onProgress: (p) => onProgress?.(10 + Math.round(p * 0.8)),
      signal,
    });

    onProgress?.(90);

    // Confirm upload
    const result = await this.confirm({
      bookId: uploadInfo.bookId,
      title,
      author,
    });

    onProgress?.(100);

    return result;
  }

  /**
   * Check if a book with the given hash already exists in the user's library.
   *
   * @param hash - SHA-256 hash of file content
   * @returns true if book exists, false otherwise
   *
   * @example
   * ```typescript
   * const hash = await computeHash(file);
   * if (await sdk.ingest.exists(hash)) {
   *   console.log('You already have this book');
   * }
   * ```
   */
  async exists(hash: string): Promise<boolean> {
    try {
      await this._sdk.fetch(`/api/books/hash/${encodeURIComponent(hash)}`);
      return true;
    } catch (err) {
      if (err instanceof OpenreadError && err.code === 'NOT_FOUND') {
        return false;
      }
      throw err;
    }
  }

  /**
   * Extract format from filename.
   * @internal
   */
  private getFormat(filename: string): BookFormat | null {
    const ext = filename.toLowerCase().split('.').pop();
    if (ext === 'epub') return 'epub';
    if (ext === 'pdf') return 'pdf';
    return null;
  }

  /**
   * Extract title from filename (removes extension).
   * @internal
   */
  private extractTitleFromFilename(filename: string): string {
    // Remove extension and replace common separators with spaces
    const withoutExt = filename.replace(/\.(epub|pdf)$/i, '');
    return withoutExt.replace(/[-_]/g, ' ').trim();
  }

  /**
   * Compute SHA-256 hash of a file.
   * @internal
   */
  async computeHash(file: File | Blob): Promise<string> {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Compute SHA-256 hash of metadata string.
   * @internal
   */
  private async computeMetaHash(metadata: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(metadata);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
}
