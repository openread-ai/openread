import { describe, it, expect, vi } from 'vitest';

import {
  safeJsonParse,
  transformBookFromDB,
  transformBookToDB,
  transformBookConfigFromDB,
  transformBookConfigToDB,
} from '@/utils/transform';
import { DBBook, DBBookConfig } from '@/types/records';

describe('safeJsonParse', () => {
  it('should parse valid JSON strings', () => {
    expect(safeJsonParse('{"a":1}', 'test')).toEqual({ a: 1 });
    expect(safeJsonParse('[1,2]', 'test')).toEqual([1, 2]);
    expect(safeJsonParse('"hello"', 'test')).toBe('hello');
    expect(safeJsonParse('42', 'test')).toBe(42);
    expect(safeJsonParse('null', 'test')).toBe(null);
  });

  it('should return undefined for malformed JSON', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(safeJsonParse('{bad json}', 'myField')).toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith('Failed to parse myField as JSON, discarding value');

    errorSpy.mockRestore();
  });

  it('should return undefined for truncated JSON', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(safeJsonParse('{"key": "val', 'progress')).toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith('Failed to parse progress as JSON, discarding value');

    errorSpy.mockRestore();
  });

  it('should log the correct field name in the warning', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    safeJsonParse('not-json', 'metadata');
    expect(errorSpy).toHaveBeenCalledWith('Failed to parse metadata as JSON, discarding value');

    safeJsonParse('also{bad', 'search_config');
    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to parse search_config as JSON, discarding value',
    );

    errorSpy.mockRestore();
  });
});

describe('transformBookConfigFromDB - JSONB guards', () => {
  const baseConfig: DBBookConfig = {
    user_id: 'user-1',
    book_hash: 'hash-1',
    updated_at: '2024-01-01T00:00:00.000Z',
  };

  describe('progress field', () => {
    it('should parse a valid JSON string', () => {
      const result = transformBookConfigFromDB({
        ...baseConfig,
        progress: '[1, 100]' as unknown as [number, number],
      });
      expect(result.progress).toEqual([1, 100]);
    });

    it('should pass through an already-parsed array', () => {
      const result = transformBookConfigFromDB({
        ...baseConfig,
        progress: [5, 200],
      });
      expect(result.progress).toEqual([5, 200]);
    });

    it('should return undefined for malformed JSON', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = transformBookConfigFromDB({
        ...baseConfig,
        progress: '{corrupt' as unknown as [number, number],
      });
      expect(result.progress).toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith('Failed to parse progress as JSON, discarding value');
      errorSpy.mockRestore();
    });

    it('should return undefined when progress is null', () => {
      const result = transformBookConfigFromDB({
        ...baseConfig,
        progress: null,
      });
      expect(result.progress).toBeUndefined();
    });
  });

  describe('search_config field', () => {
    it('should parse a valid JSON string', () => {
      const result = transformBookConfigFromDB({
        ...baseConfig,
        search_config: '{"scope":"book"}' as unknown as Record<string, unknown>,
      });
      expect(result.searchConfig).toEqual({ scope: 'book' });
    });

    it('should pass through an already-parsed object', () => {
      const result = transformBookConfigFromDB({
        ...baseConfig,
        search_config: { scope: 'chapter' },
      });
      expect(result.searchConfig).toEqual({ scope: 'chapter' });
    });

    it('should return undefined for malformed JSON', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = transformBookConfigFromDB({
        ...baseConfig,
        search_config: 'not{valid' as unknown as Record<string, unknown>,
      });
      expect(result.searchConfig).toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith(
        'Failed to parse search_config as JSON, discarding value',
      );
      errorSpy.mockRestore();
    });

    it('should return undefined when search_config is null', () => {
      const result = transformBookConfigFromDB({
        ...baseConfig,
        search_config: null,
      });
      expect(result.searchConfig).toBeUndefined();
    });
  });

  describe('view_settings field', () => {
    it('should parse a valid JSON string', () => {
      const result = transformBookConfigFromDB({
        ...baseConfig,
        view_settings: '{"fontSize":16}' as unknown as Record<string, unknown>,
      });
      expect(result.viewSettings).toEqual({ fontSize: 16 });
    });

    it('should pass through an already-parsed object', () => {
      const result = transformBookConfigFromDB({
        ...baseConfig,
        view_settings: { fontSize: 14 },
      });
      expect(result.viewSettings).toEqual({ fontSize: 14 });
    });

    it('should return undefined for malformed JSON', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = transformBookConfigFromDB({
        ...baseConfig,
        view_settings: '{"fontSize":' as unknown as Record<string, unknown>,
      });
      expect(result.viewSettings).toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith(
        'Failed to parse view_settings as JSON, discarding value',
      );
      errorSpy.mockRestore();
    });

    it('should return undefined when view_settings is null', () => {
      const result = transformBookConfigFromDB({
        ...baseConfig,
        view_settings: null,
      });
      expect(result.viewSettings).toBeUndefined();
    });
  });
});

describe('transformBookFromDB - metadata JSONB guard', () => {
  const baseDBBook: DBBook = {
    user_id: 'user-1',
    book_hash: 'hash-abc',
    format: 'epub',
    title: 'Test Book',
    author: 'Test Author',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-02T00:00:00.000Z',
    deleted_at: null,
    uploaded_at: null,
  };

  it('should parse a valid JSON string for metadata', () => {
    const result = transformBookFromDB({
      ...baseDBBook,
      metadata: '{"publisher":"Acme"}' as unknown as Record<string, unknown>,
    });
    expect(result.metadata).toEqual({ publisher: 'Acme' });
  });

  it('should pass through an already-parsed object for metadata', () => {
    const result = transformBookFromDB({
      ...baseDBBook,
      metadata: { publisher: 'Acme' },
    });
    expect(result.metadata).toEqual({ publisher: 'Acme' });
  });

  it('should return undefined for malformed metadata JSON', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = transformBookFromDB({
      ...baseDBBook,
      metadata: '{broken' as unknown as Record<string, unknown>,
    });
    expect(result.metadata).toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith('Failed to parse metadata as JSON, discarding value');
    errorSpy.mockRestore();
  });

  it('should return undefined when metadata is null', () => {
    const result = transformBookFromDB({
      ...baseDBBook,
      metadata: null,
    });
    expect(result.metadata).toBeUndefined();
  });

  it('should return undefined when metadata is undefined', () => {
    const result = transformBookFromDB({
      ...baseDBBook,
      metadata: undefined as unknown as Record<string, unknown> | null,
    });
    expect(result.metadata).toBeUndefined();
  });

  it('should normalize uppercase format to lowercase', () => {
    const result = transformBookFromDB({
      ...baseDBBook,
      format: 'EPUB',
    });
    expect(result.format).toBe('epub');
  });
});

describe('transformBookToDB / transformBookFromDB round-trip', () => {
  const now = Date.now();
  const userId = 'user-round-trip';

  it('should preserve data through a toDB -> fromDB round-trip', () => {
    const book = {
      hash: 'hash-rt',
      metaHash: 'meta-rt',
      format: 'epub',
      title: 'Round Trip Book',
      author: 'RT Author',
      groupId: 'grp-1',
      groupName: 'Fiction',
      tags: ['sci-fi', 'classic'],
      progress: [42, 300] as [number, number],
      readingStatus: 'reading' as const,
      sourceTitle: 'round-trip.epub',
      metadata: { publisher: 'RT Press', isbn: '123-456' },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      uploadedAt: now,
    };

    const dbBook = transformBookToDB(book, userId);

    expect(dbBook.user_id).toBe(userId);
    expect(dbBook.book_hash).toBe('hash-rt');
    expect(dbBook.format).toBe('epub');
    expect(dbBook.title).toBe('Round Trip Book');
    expect(dbBook.author).toBe('RT Author');
    expect(dbBook.tags).toEqual(['sci-fi', 'classic']);
    expect(dbBook.progress).toEqual([42, 300]);
    expect(dbBook.metadata).toEqual({ publisher: 'RT Press', isbn: '123-456' });

    const result = transformBookFromDB(dbBook);

    expect(result.hash).toBe(book.hash);
    expect(result.metaHash).toBe(book.metaHash);
    expect(result.format).toBe(book.format);
    expect(result.title).toBe(book.title);
    expect(result.author).toBe(book.author);
    expect(result.groupId).toBe(book.groupId);
    expect(result.groupName).toBe(book.groupName);
    expect(result.tags).toEqual(book.tags);
    expect(result.progress).toEqual(book.progress);
    expect(result.readingStatus).toBe(book.readingStatus);
    expect(result.sourceTitle).toBe(book.sourceTitle);
    expect(result.metadata).toEqual(book.metadata);
    expect(result.deletedAt).toBeNull();
    expect(result.uploadedAt).toBeCloseTo(now, -2);
  });

  it('should handle minimal book with no optional fields', () => {
    const book = {
      hash: 'hash-min',
      format: 'pdf',
      title: 'Minimal',
      author: 'Nobody',
      createdAt: now,
      updatedAt: now,
    };

    const dbBook = transformBookToDB(book, userId);
    const result = transformBookFromDB(dbBook);

    expect(result.hash).toBe('hash-min');
    expect(result.format).toBe('pdf');
    expect(result.title).toBe('Minimal');
    expect(result.author).toBe('Nobody');
    expect(result.metadata).toBeUndefined();
    expect(result.deletedAt).toBeNull();
    expect(result.uploadedAt).toBeNull();
  });
});

describe('transformBookConfigToDB', () => {
  it('should transform a book config to DB format', () => {
    const config = {
      bookHash: 'hash-1',
      metaHash: 'meta-1',
      progress: [5, 100] as [number, number],
      location: '/chapter/1',
      updatedAt: 1704067200000, // 2024-01-01T00:00:00.000Z
    };
    const result = transformBookConfigToDB(config, 'user-1');
    expect(result.user_id).toBe('user-1');
    expect(result.book_hash).toBe('hash-1');
    expect(result.meta_hash).toBe('meta-1');
    expect(result.progress).toEqual([5, 100]);
    expect(result.location).toBe('/chapter/1');
    expect(result.updated_at).toBe('2024-01-01T00:00:00.000Z');
  });
});
