import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mergeWithFieldVersions,
  updateFieldVersion,
  BOOK_TRACKED_FIELDS,
  CONFIG_TRACKED_FIELDS,
  type FieldVersions,
} from '@/services/sync/fieldLww';

describe('fieldLww', () => {
  // ---------------------------------------------------------------------------
  // mergeWithFieldVersions
  // ---------------------------------------------------------------------------
  describe('mergeWithFieldVersions', () => {
    const trackedFields = ['progress', 'tags', 'title'] as const;

    it('should merge per-field when timestamps differ — mixed conflict', () => {
      const local = {
        id: '1',
        progress: 0.7,
        tags: ['fiction'],
        title: 'Local Title',
        updated_at: '2024-01-10T00:00:00.000Z',
        field_versions: {
          progress: '2024-01-20T00:00:00.000Z',
          tags: '2024-01-05T00:00:00.000Z',
          title: '2024-01-10T00:00:00.000Z',
        },
      };

      const server = {
        id: '1',
        progress: 0.3,
        tags: ['non-fiction', 'science'],
        title: 'Server Title',
        updated_at: '2024-01-10T00:00:00.000Z',
        field_versions: {
          progress: '2024-01-15T00:00:00.000Z',
          tags: '2024-01-18T00:00:00.000Z',
          title: '2024-01-08T00:00:00.000Z',
        },
      };

      const result = mergeWithFieldVersions(local, server, trackedFields);

      expect(result.progress).toBe(0.7);
      expect(result.tags).toEqual(['non-fiction', 'science']);
      expect(result.title).toBe('Local Title');
      expect(result.field_versions.progress).toBe('2024-01-20T00:00:00.000Z');
      expect(result.field_versions.tags).toBe('2024-01-18T00:00:00.000Z');
      expect(result.field_versions.title).toBe('2024-01-10T00:00:00.000Z');
    });

    it('should take all server values when server timestamps are newer for all fields', () => {
      const local = {
        id: '1',
        progress: 0.1,
        tags: ['old'],
        title: 'Old Title',
        updated_at: '2024-01-01T00:00:00.000Z',
        field_versions: {
          progress: '2024-01-01T00:00:00.000Z',
          tags: '2024-01-01T00:00:00.000Z',
          title: '2024-01-01T00:00:00.000Z',
        },
      };

      const server = {
        id: '1',
        progress: 0.9,
        tags: ['new'],
        title: 'New Title',
        updated_at: '2024-02-01T00:00:00.000Z',
        field_versions: {
          progress: '2024-02-01T00:00:00.000Z',
          tags: '2024-02-01T00:00:00.000Z',
          title: '2024-02-01T00:00:00.000Z',
        },
      };

      const result = mergeWithFieldVersions(local, server, trackedFields);

      expect(result.progress).toBe(0.9);
      expect(result.tags).toEqual(['new']);
      expect(result.title).toBe('New Title');
    });

    it('should keep all local values when local timestamps are newer for all fields', () => {
      const local = {
        id: '1',
        progress: 0.9,
        tags: ['local-tag'],
        title: 'Local Wins',
        updated_at: '2024-02-01T00:00:00.000Z',
        field_versions: {
          progress: '2024-02-01T00:00:00.000Z',
          tags: '2024-02-01T00:00:00.000Z',
          title: '2024-02-01T00:00:00.000Z',
        },
      };

      const server = {
        id: '1',
        progress: 0.1,
        tags: ['server-tag'],
        title: 'Server Loses',
        updated_at: '2024-01-01T00:00:00.000Z',
        field_versions: {
          progress: '2024-01-01T00:00:00.000Z',
          tags: '2024-01-01T00:00:00.000Z',
          title: '2024-01-01T00:00:00.000Z',
        },
      };

      const result = mergeWithFieldVersions(local, server, trackedFields);

      expect(result.progress).toBe(0.9);
      expect(result.tags).toEqual(['local-tag']);
      expect(result.title).toBe('Local Wins');
    });

    it('should prefer local when field timestamps are identical (tie-breaking)', () => {
      const sameTime = '2024-01-15T12:00:00.000Z';

      const local = {
        id: '1',
        progress: 0.5,
        tags: ['local'],
        title: 'Local Title',
        updated_at: sameTime,
        field_versions: { progress: sameTime, tags: sameTime, title: sameTime },
      };

      const server = {
        id: '1',
        progress: 0.8,
        tags: ['server'],
        title: 'Server Title',
        updated_at: sameTime,
        field_versions: { progress: sameTime, tags: sameTime, title: sameTime },
      };

      const result = mergeWithFieldVersions(local, server, trackedFields);

      expect(result.progress).toBe(0.5);
      expect(result.tags).toEqual(['local']);
      expect(result.title).toBe('Local Title');
    });

    describe('record-level LWW fallback (empty field_versions)', () => {
      it('should use server record when server updated_at is newer', () => {
        const local = {
          id: '1',
          progress: 0.2,
          tags: ['local'],
          title: 'Local',
          updated_at: '2024-01-01T00:00:00.000Z',
          field_versions: {},
        };

        const server = {
          id: '1',
          progress: 0.9,
          tags: ['server'],
          title: 'Server',
          updated_at: '2024-02-01T00:00:00.000Z',
          field_versions: {},
        };

        const result = mergeWithFieldVersions(local, server, trackedFields);

        expect(result.progress).toBe(0.9);
        expect(result.tags).toEqual(['server']);
        expect(result.title).toBe('Server');
      });

      it('should use local record when local updated_at is newer', () => {
        const local = {
          id: '1',
          progress: 0.9,
          tags: ['local'],
          title: 'Local',
          updated_at: '2024-02-01T00:00:00.000Z',
          field_versions: {},
        };

        const server = {
          id: '1',
          progress: 0.2,
          tags: ['server'],
          title: 'Server',
          updated_at: '2024-01-01T00:00:00.000Z',
          field_versions: {},
        };

        const result = mergeWithFieldVersions(local, server, trackedFields);

        expect(result.progress).toBe(0.9);
        expect(result.tags).toEqual(['local']);
        expect(result.title).toBe('Local');
      });

      it('should use local record when updated_at timestamps are equal (tie)', () => {
        const sameTime = '2024-01-15T00:00:00.000Z';

        const local = {
          id: '1',
          progress: 0.5,
          title: 'Local',
          updated_at: sameTime,
          field_versions: {},
        };

        const server = {
          id: '1',
          progress: 0.8,
          title: 'Server',
          updated_at: sameTime,
          field_versions: {},
        };

        const result = mergeWithFieldVersions(local, server, trackedFields);

        expect(result.progress).toBe(0.5);
        expect(result.title).toBe('Local');
      });

      it('should treat undefined field_versions as empty', () => {
        const local = {
          id: '1',
          progress: 0.2,
          title: 'Local',
          updated_at: '2024-01-01T00:00:00.000Z',
        };

        const server = {
          id: '1',
          progress: 0.9,
          title: 'Server',
          updated_at: '2024-02-01T00:00:00.000Z',
        };

        const result = mergeWithFieldVersions(local, server, trackedFields);

        expect(result.progress).toBe(0.9);
        expect(result.title).toBe('Server');
      });
    });

    describe('migration scenario (one side has field_versions)', () => {
      it('should use updated_at as fallback for the side missing field_versions', () => {
        const local = {
          id: '1',
          progress: 0.5,
          tags: ['local'],
          title: 'Local Title',
          updated_at: '2024-01-10T00:00:00.000Z',
          field_versions: {
            progress: '2024-01-20T00:00:00.000Z',
            tags: '2024-01-05T00:00:00.000Z',
            title: '2024-01-15T00:00:00.000Z',
          },
        };

        const server = {
          id: '1',
          progress: 0.8,
          tags: ['server'],
          title: 'Server Title',
          updated_at: '2024-01-12T00:00:00.000Z',
        };

        const result = mergeWithFieldVersions(local, server, trackedFields);

        // progress: local 2024-01-20 > server fallback 2024-01-12 -> local wins
        expect(result.progress).toBe(0.5);
        // tags: local 2024-01-05 < server fallback 2024-01-12 -> server wins
        expect(result.tags).toEqual(['server']);
        // title: local 2024-01-15 > server fallback 2024-01-12 -> local wins
        expect(result.title).toBe('Local Title');
      });

      it('should compare against updated_at when only server has field_versions', () => {
        const local = {
          id: '1',
          progress: 0.5,
          tags: ['local'],
          title: 'Local Title',
          updated_at: '2024-01-12T00:00:00.000Z',
        };

        const server = {
          id: '1',
          progress: 0.8,
          tags: ['server'],
          title: 'Server Title',
          updated_at: '2024-01-10T00:00:00.000Z',
          field_versions: {
            progress: '2024-01-20T00:00:00.000Z',
            tags: '2024-01-05T00:00:00.000Z',
            title: '2024-01-15T00:00:00.000Z',
          },
        };

        const result = mergeWithFieldVersions(local, server, trackedFields);

        // progress: local fallback 2024-01-12 < server 2024-01-20 -> server wins
        expect(result.progress).toBe(0.8);
        // tags: local fallback 2024-01-12 > server 2024-01-05 -> local wins
        expect(result.tags).toEqual(['local']);
        // title: local fallback 2024-01-12 < server 2024-01-15 -> server wins
        expect(result.title).toBe('Server Title');
      });
    });

    it('should not overwrite fields that are not in trackedFields', () => {
      const local = {
        id: '1',
        progress: 0.5,
        tags: ['local'],
        title: 'Local Title',
        untracked_field: 'local-value',
        another_field: 42,
        updated_at: '2024-01-01T00:00:00.000Z',
        field_versions: { progress: '2024-01-01T00:00:00.000Z' },
      };

      const server = {
        id: '1',
        progress: 0.9,
        tags: ['server'],
        title: 'Server Title',
        untracked_field: 'server-value',
        another_field: 99,
        updated_at: '2024-02-01T00:00:00.000Z',
        field_versions: { progress: '2024-02-01T00:00:00.000Z' },
      };

      const result = mergeWithFieldVersions(local, server, trackedFields);

      expect(result.untracked_field).toBe('local-value');
      expect(result.another_field).toBe(42);
    });

    it('should treat missing updated_at as epoch zero in record-level fallback', () => {
      const local = { id: '1', progress: 0.5, title: 'Local' };
      const server = {
        id: '1',
        progress: 0.9,
        title: 'Server',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      const result = mergeWithFieldVersions(local, server, trackedFields);

      expect(result.progress).toBe(0.9);
      expect(result.title).toBe('Server');
    });

    it('should preserve the id and base fields from local in field-level merge', () => {
      const local = {
        id: 'local-id',
        progress: 0.5,
        updated_at: '2024-01-01T00:00:00.000Z',
        field_versions: { progress: '2024-01-01T00:00:00.000Z' },
      };

      const server = {
        id: 'server-id',
        progress: 0.9,
        updated_at: '2024-02-01T00:00:00.000Z',
        field_versions: { progress: '2024-02-01T00:00:00.000Z' },
      };

      const result = mergeWithFieldVersions(local, server, ['progress']);

      expect(result.id).toBe('local-id');
      expect(result.progress).toBe(0.9);
    });

    it('should handle empty trackedFields list', () => {
      const local = {
        id: '1',
        progress: 0.5,
        updated_at: '2024-01-01T00:00:00.000Z',
        field_versions: { progress: '2024-01-01T00:00:00.000Z' },
      };

      const server = {
        id: '1',
        progress: 0.9,
        updated_at: '2024-02-01T00:00:00.000Z',
        field_versions: { progress: '2024-02-01T00:00:00.000Z' },
      };

      const result = mergeWithFieldVersions(local, server, []);

      expect(result.progress).toBe(0.5);
      expect(result.id).toBe('1');
    });
  });

  // ---------------------------------------------------------------------------
  // updateFieldVersion
  // ---------------------------------------------------------------------------
  describe('updateFieldVersion', () => {
    let dateSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      dateSpy = vi.spyOn(Date.prototype, 'toISOString').mockReturnValue('2024-06-15T10:30:00.000Z');
    });

    afterEach(() => {
      dateSpy.mockRestore();
    });

    it('should create a new field_versions entry from undefined', () => {
      const result = updateFieldVersion(undefined, 'progress');
      expect(result).toEqual({ progress: '2024-06-15T10:30:00.000Z' });
    });

    it('should create a new field_versions entry from empty object', () => {
      const result = updateFieldVersion({}, 'title');
      expect(result).toEqual({ title: '2024-06-15T10:30:00.000Z' });
    });

    it('should update an existing field_versions entry', () => {
      const existing: FieldVersions = {
        progress: '2024-01-01T00:00:00.000Z',
        tags: '2024-01-05T00:00:00.000Z',
      };

      const result = updateFieldVersion(existing, 'progress');
      expect(result.progress).toBe('2024-06-15T10:30:00.000Z');
    });

    it('should preserve other fields in field_versions when updating one field', () => {
      const existing: FieldVersions = {
        progress: '2024-01-01T00:00:00.000Z',
        tags: '2024-01-05T00:00:00.000Z',
        title: '2024-01-03T00:00:00.000Z',
      };

      const result = updateFieldVersion(existing, 'progress');

      expect(result.tags).toBe('2024-01-05T00:00:00.000Z');
      expect(result.title).toBe('2024-01-03T00:00:00.000Z');
      expect(result.progress).toBe('2024-06-15T10:30:00.000Z');
    });

    it('should not mutate the original field_versions object', () => {
      const existing: FieldVersions = { progress: '2024-01-01T00:00:00.000Z' };

      const result = updateFieldVersion(existing, 'progress');

      expect(existing.progress).toBe('2024-01-01T00:00:00.000Z');
      expect(result.progress).toBe('2024-06-15T10:30:00.000Z');
      expect(result).not.toBe(existing);
    });
  });

  // ---------------------------------------------------------------------------
  // toTimestamp (tested indirectly via mergeWithFieldVersions)
  // ---------------------------------------------------------------------------
  describe('toTimestamp (tested via record-level fallback behavior)', () => {
    it('should correctly compare ISO 8601 strings via updated_at', () => {
      const local = { id: '1', value: 'local', updated_at: '2024-01-15T10:00:00.000Z' };
      const server = { id: '1', value: 'server', updated_at: '2024-01-20T10:00:00.000Z' };

      const result = mergeWithFieldVersions(local, server, ['value']);
      expect(result.value).toBe('server');
    });

    it('should correctly compare numeric timestamps via updated_at', () => {
      const local = { id: '1', value: 'local', updated_at: 1705312800000 };
      const server = { id: '1', value: 'server', updated_at: 1705744800000 };

      const result = mergeWithFieldVersions(local, server, ['value']);
      expect(result.value).toBe('server');
    });

    it('should correctly handle numeric updated_at where local is newer', () => {
      const local = { id: '1', value: 'local', updated_at: 1705744800000 };
      const server = { id: '1', value: 'server', updated_at: 1705312800000 };

      const result = mergeWithFieldVersions(local, server, ['value']);
      expect(result.value).toBe('local');
    });

    it('should treat undefined updated_at as 0 (epoch)', () => {
      const local = { id: '1', value: 'local' };
      const server = { id: '1', value: 'server', updated_at: '2024-01-01T00:00:00.000Z' };

      const result = mergeWithFieldVersions(local, server, ['value']);
      expect(result.value).toBe('server');
    });

    it('should treat both undefined updated_at as tie (local wins)', () => {
      const local = { id: '1', value: 'local' };
      const server = { id: '1', value: 'server' };

      const result = mergeWithFieldVersions(local, server, ['value']);
      expect(result.value).toBe('local');
    });

    it('should treat updated_at of 0 as epoch zero', () => {
      const local = { id: '1', value: 'local', updated_at: 0 as string | number };
      const server = {
        id: '1',
        value: 'server',
        updated_at: '2024-01-01T00:00:00.000Z' as string | number,
      };

      const result = mergeWithFieldVersions(local, server, ['value']);
      expect(result.value).toBe('server');
    });
  });

  // ---------------------------------------------------------------------------
  // BOOK_TRACKED_FIELDS and CONFIG_TRACKED_FIELDS
  // ---------------------------------------------------------------------------
  describe('BOOK_TRACKED_FIELDS', () => {
    it('should be a non-empty array', () => {
      expect(Array.isArray(BOOK_TRACKED_FIELDS)).toBe(true);
      expect(BOOK_TRACKED_FIELDS.length).toBeGreaterThan(0);
    });

    it('should contain only strings', () => {
      for (const field of BOOK_TRACKED_FIELDS) {
        expect(typeof field).toBe('string');
      }
    });

    it('should include expected fields', () => {
      expect(BOOK_TRACKED_FIELDS).toContain('title');
      expect(BOOK_TRACKED_FIELDS).toContain('author');
      expect(BOOK_TRACKED_FIELDS).toContain('progress');
      expect(BOOK_TRACKED_FIELDS).toContain('tags');
      expect(BOOK_TRACKED_FIELDS).toContain('reading_status');
      expect(BOOK_TRACKED_FIELDS).toContain('format');
    });
  });

  describe('CONFIG_TRACKED_FIELDS', () => {
    it('should be a non-empty array', () => {
      expect(Array.isArray(CONFIG_TRACKED_FIELDS)).toBe(true);
      expect(CONFIG_TRACKED_FIELDS.length).toBeGreaterThan(0);
    });

    it('should contain only strings', () => {
      for (const field of CONFIG_TRACKED_FIELDS) {
        expect(typeof field).toBe('string');
      }
    });

    it('should include expected fields', () => {
      expect(CONFIG_TRACKED_FIELDS).toContain('progress');
      expect(CONFIG_TRACKED_FIELDS).toContain('location');
      expect(CONFIG_TRACKED_FIELDS).toContain('view_settings');
      expect(CONFIG_TRACKED_FIELDS).toContain('search_config');
    });
  });
});
