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

    it('serializes concurrent saves so the latest invocation reaches disk last', async () => {
      let releaseFirstWrite!: () => void;
      const firstWrite = new Promise<void>((resolve) => {
        releaseFirstWrite = resolve;
      });
      (mockFs.writeFile as ReturnType<typeof vi.fn>).mockImplementation(
        async (_path: string, _base: string, _content: string) => {
          if ((mockFs.writeFile as ReturnType<typeof vi.fn>).mock.calls.length === 1) {
            await firstWrite;
          }
        },
      );
      const firstBooks = [
        { hash: 'h1', title: 'First' },
      ] as unknown as import('@/types/book').Book[];
      const latestBooks = [
        { hash: 'h1', title: 'Latest' },
      ] as unknown as import('@/types/book').Book[];

      const firstSave = persistence.saveLibraryBooks(firstBooks);
      await vi.waitFor(() => expect(mockFs.writeFile).toHaveBeenCalledTimes(1));
      const latestSave = persistence.saveLibraryBooks(latestBooks);
      await Promise.resolve();
      expect(mockFs.writeFile).toHaveBeenCalledTimes(1);

      releaseFirstWrite();
      await Promise.all([firstSave, latestSave]);

      const calls = (mockFs.writeFile as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.map((call) => call[0])).toEqual([
        'library.json.bak',
        'library.json',
        'library.json.bak',
        'library.json',
      ]);
      expect(calls.slice(0, 2).map((call) => JSON.parse(call[2] as string)[0].title)).toEqual([
        'First',
        'First',
      ]);
      expect(calls.slice(2).map((call) => JSON.parse(call[2] as string)[0].title)).toEqual([
        'Latest',
        'Latest',
      ]);
    });

    it('continues the save queue after a rejected write', async () => {
      (mockFs.writeFile as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('disk full'))
        .mockResolvedValue(undefined);
      const firstBooks = [
        { hash: 'h1', title: 'First' },
      ] as unknown as import('@/types/book').Book[];
      const recoveredBooks = [
        { hash: 'h1', title: 'Recovered' },
      ] as unknown as import('@/types/book').Book[];

      const failedSave = persistence.saveLibraryBooks(firstBooks);
      const recoveredSave = persistence.saveLibraryBooks(recoveredBooks);

      await expect(failedSave).rejects.toThrow('disk full');
      await expect(recoveredSave).resolves.toBeUndefined();
      expect(mockFs.writeFile).toHaveBeenCalledTimes(3);
      const calls = (mockFs.writeFile as ReturnType<typeof vi.fn>).mock.calls;
      expect(JSON.parse(calls[2]![2] as string)[0].title).toBe('Recovered');
    });
  });
});
