import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LibraryPersistence } from '@/services/libraryPersistence';
import type { FileSystem } from '@/types/system';

function createMockFs(files: Record<string, string> = {}): FileSystem {
  return {
    exists: vi.fn(async (path: string) => path in files),
    readFile: vi.fn(async (path: string) => files[path] ?? ''),
    writeFile: vi.fn(async (path: string, _base: string, content: string) => {
      files[path] = content as string;
    }),
    createDir: vi.fn(async () => {}),
    removeFile: vi.fn(),
    removeDir: vi.fn(),
    readDir: vi.fn(async () => []),
    openFile: vi.fn(),
    copyFile: vi.fn(),
    getPrefix: vi.fn(async (base: string) => `/mock/${base}`),
    getURL: vi.fn((p: string) => p),
    getBlobURL: vi.fn(async (p: string) => p),
    getImageURL: vi.fn(async (p: string) => p),
  } as unknown as FileSystem;
}

describe('LibraryPersistence', () => {
  let persistence: LibraryPersistence;
  let mockFs: FileSystem;

  beforeEach(() => {
    mockFs = createMockFs();
    persistence = new LibraryPersistence(mockFs);
  });

  describe('safeLoadJSON', () => {
    it('loads from main file when valid', async () => {
      (mockFs.exists as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (mockFs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue('{"key":"value"}');

      const result = await persistence.safeLoadJSON('test.json', 'Books', {});
      expect(result).toEqual({ key: 'value' });
    });

    it('falls back to backup when main file fails', async () => {
      let callCount = 0;
      (mockFs.readFile as ReturnType<typeof vi.fn>).mockImplementation(async (_path: string) => {
        callCount++;
        if (callCount === 1) throw new Error('corrupted');
        return '{"backup":true}';
      });

      const result = await persistence.safeLoadJSON('test.json', 'Books', {});
      expect(result).toEqual({ backup: true });
    });

    it('returns default when both files fail', async () => {
      (mockFs.readFile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('not found'));

      const result = await persistence.safeLoadJSON('test.json', 'Books', { default: true });
      expect(result).toEqual({ default: true });
    });
  });

  describe('safeSaveJSON', () => {
    it('writes to backup then main file', async () => {
      await persistence.safeSaveJSON('test.json', 'Books', { data: 1 });

      const calls = (mockFs.writeFile as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls).toHaveLength(2);
      expect(calls[0]![0]).toBe('test.json.bak');
      expect(calls[1]![0]).toBe('test.json');
    });
  });

  describe('saveLibraryBooks', () => {
    it('strips coverImageUrl before saving', async () => {
      const books = [
        { hash: 'h1', title: 'Book 1', coverImageUrl: 'blob:abc' },
      ] as unknown as import('@/types/book').Book[];

      await persistence.saveLibraryBooks(books);

      const calls = (mockFs.writeFile as ReturnType<typeof vi.fn>).mock.calls;
      const savedData = JSON.parse(calls[0]![2] as string);
      expect(savedData[0].coverImageUrl).toBeUndefined();
      expect(savedData[0].hash).toBe('h1');
    });
  });
});
