import { describe, expect, it } from 'vitest';
import {
  BOOK_FORMAT_REGISTRY,
  PLATFORM_UPLOAD_FORMATS,
  PLATFORM_UPLOAD_SIZE_LIMITS,
  parsePlatformUploadBookFormat,
} from '../catalog-source-verification.js';

const STAGE_ONE_FORMATS = ['epub', 'pdf', 'mobi', 'azw3', 'fb2', 'cbz'] as const;

describe('platform upload formats', () => {
  it('derives the Stage 1 set from the typed format registry', () => {
    expect(PLATFORM_UPLOAD_FORMATS).toEqual(STAGE_ONE_FORMATS);

    for (const [format, entry] of Object.entries(BOOK_FORMAT_REGISTRY)) {
      expect(entry.platformUpload).toBe(
        STAGE_ONE_FORMATS.includes(format as (typeof STAGE_ONE_FORMATS)[number]),
      );
    }
  });

  it('parses every Stage 1 format and rejects Stage 2 or unknown formats', () => {
    for (const format of STAGE_ONE_FORMATS) {
      expect(parsePlatformUploadBookFormat(format)).toBe(format);
    }

    for (const format of ['azw', 'fbz', 'txt', 'md', 'zip', 'doc']) {
      expect(parsePlatformUploadBookFormat(format)).toBeNull();
    }
  });

  it('derives a positive size limit for every uploadable format', () => {
    expect(Object.keys(PLATFORM_UPLOAD_SIZE_LIMITS)).toEqual(STAGE_ONE_FORMATS);
    for (const format of STAGE_ONE_FORMATS) {
      expect(PLATFORM_UPLOAD_SIZE_LIMITS[format]).toBeGreaterThan(0);
    }
  });

  it('keeps the buffered CBZ upload limit below the catalog import limit', () => {
    expect(BOOK_FORMAT_REGISTRY.cbz.maxBytes).toBe(500 * 1024 * 1024);
    expect(BOOK_FORMAT_REGISTRY.cbz.platformUploadMaxBytes).toBe(100 * 1024 * 1024);
    expect(PLATFORM_UPLOAD_SIZE_LIMITS.cbz).toBe(100 * 1024 * 1024);
  });
});
