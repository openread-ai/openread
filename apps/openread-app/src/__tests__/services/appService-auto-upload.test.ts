import { testOpenReadBookRef } from '../utils/bookIdentityFixtures';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted so these are available inside hoisted vi.mock factories
const { mockQueueUpload, mockIsReady, mockGetState, MockDocumentLoader } = vi.hoisted(() => {
  // Must use a regular function (not arrow) so it can be called with `new`
  class FakeDocumentLoader {
    async open() {
      return {
        book: {
          metadata: { title: 'Test Book', author: 'Author', language: 'en' },
          getCover: async () => null,
        },
        format: 'epub',
      };
    }
  }

  return {
    mockQueueUpload: vi.fn(),
    mockIsReady: vi.fn(),
    mockGetState: vi.fn(() => ({
      settings: { autoUpload: true },
    })),
    MockDocumentLoader: FakeDocumentLoader,
  };
});

vi.mock('@/services/transferManager', () => ({
  transferManager: {
    queueUpload: mockQueueUpload,
    isReady: mockIsReady,
  },
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: {
    getState: mockGetState,
  },
}));

// Mock heavy dependencies that appService.ts imports
vi.mock('@/libs/document', () => ({
  DocumentLoader: MockDocumentLoader,
  EXTS: {},
}));

vi.mock('@/utils/md5', () => ({
  md5: vi.fn(() => 'mock-md5'),
  partialMD5: vi.fn(() => 'd41d8cd98f00b204e9800998ecf8427e'),
}));

vi.mock('@/services/platform/storage', () => ({
  computeFileHash: vi.fn(() => 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'),
}));

vi.mock('@/utils/book', () => ({
  getDir: vi.fn(() => 'mock-dir'),
  getLocalBookFilename: vi.fn(() => 'mock-local-filename'),
  getRemoteBookFilename: vi.fn(() => 'mock-remote-filename'),
  getCoverFilename: vi.fn(() => 'mock-cover-filename'),
  getConfigFilename: vi.fn(() => 'mock-config-filename'),
  getLibraryFilename: vi.fn(() => 'mock-library-filename'),
  getLibraryBackupFilename: vi.fn(() => 'mock-library-backup-filename'),
  INIT_BOOK_CONFIG: {},
  formatTitle: vi.fn((t: string) => t || 'Untitled'),
  formatAuthors: vi.fn((a: string) => a || 'Unknown'),
  getPrimaryLanguage: vi.fn(() => 'en'),
}));

vi.mock('@/utils/path', () => ({
  getBaseFilename: vi.fn((f: string) => f),
  getFilename: vi.fn((f: string) => f),
}));

vi.mock('@/utils/misc', () => ({
  getOSPlatform: vi.fn(() => 'macos'),
  getTargetLang: vi.fn(() => 'en'),
  isCJKEnv: vi.fn(() => false),
  isContentURI: vi.fn(() => false),
  isValidURL: vi.fn(() => false),
  makeSafeFilename: vi.fn((f: string) => f),
}));

vi.mock('@/utils/serializer', () => ({
  deserializeConfig: vi.fn(),
  serializeConfig: vi.fn(),
}));

vi.mock('@/libs/storage', () => ({
  downloadFile: vi.fn(),
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
  createProgressHandler: vi.fn(),
  batchGetDownloadUrls: vi.fn(),
}));

vi.mock('@/utils/file', () => ({
  ClosableFile: vi.fn(),
}));

vi.mock('@/utils/transfer', () => ({
  ProgressHandler: vi.fn(),
}));

vi.mock('@/utils/txt', () => ({
  TxtToEpubConverter: vi.fn(),
}));

vi.mock('@/services/errors', () => ({
  BOOK_FILE_NOT_FOUND_ERROR: 'Book file not found',
}));

vi.mock('@/styles/textures', () => ({}));
vi.mock('@/styles/fonts', () => ({}));

vi.mock('@/utils/font', () => ({
  parseFontInfo: vi.fn(),
}));

vi.mock('@/utils/svg', () => ({
  svg2png: vi.fn(),
}));

vi.mock('@/services/constants', () => ({
  DEFAULT_BOOK_LAYOUT: {},
  DEFAULT_BOOK_STYLE: {},
  DEFAULT_BOOK_FONT: {},
  DEFAULT_BOOK_LANGUAGE: {},
  DEFAULT_VIEW_CONFIG: {},
  DEFAULT_READSETTINGS: {},
  SYSTEM_SETTINGS_VERSION: 1,
  DEFAULT_BOOK_SEARCH_CONFIG: {},
  DEFAULT_TTS_CONFIG: {},
  CLOUD_BOOKS_SUBDIR: 'books',
  DEFAULT_MOBILE_VIEW_SETTINGS: {},
  DEFAULT_SYSTEM_SETTINGS: {},
  DEFAULT_CJK_VIEW_SETTINGS: {},
  DEFAULT_MOBILE_READSETTINGS: {},
  DEFAULT_SCREEN_CONFIG: {},
  DEFAULT_TRANSLATOR_CONFIG: {},
  DEFAULT_FIXED_LAYOUT_VIEW_SETTINGS: {},
  SETTINGS_FILENAME: 'settings.json',
  DEFAULT_MOBILE_SYSTEM_SETTINGS: {},
  DEFAULT_ANNOTATOR_CONFIG: {},
  DEFAULT_EINK_VIEW_SETTINGS: {},
}));

vi.mock('@/services/ai/constants', () => ({
  DEFAULT_AI_SETTINGS: {},
}));

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: vi.fn(),
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid'),
}));

import type { Book, BookFormat } from '@/types/book';
import { BaseAppService } from '@/services/appService';
import { CloudSyncService } from '@/services/cloudSync';
import { deleteFile } from '@/libs/storage';
import type { FileSystem, BaseDir, ResolvedPath, SelectDirectoryMode } from '@/types/system';

class TestAppService extends BaseAppService {
  protected fs: FileSystem = {
    getPrefix: vi.fn(async () => '/mock/books'),
    openFile: vi.fn(async (path: string) => new File(['test content'], path || 'test.epub')),
    copyFile: vi.fn(async () => {}),
    readFile: vi.fn(async () => '{}'),
    writeFile: vi.fn(async () => {}),
    createDir: vi.fn(async () => {}),
    removeFile: vi.fn(async () => {}),
    removeDir: vi.fn(async () => {}),
    readDir: vi.fn(async () => []),
    exists: vi.fn(async () => false),
    getURL: vi.fn(() => 'mock-url'),
    getBlobURL: vi.fn(async () => 'mock-blob-url'),
    getImageURL: vi.fn(async () => 'mock-image-url'),
  } as unknown as FileSystem;

  protected resolvePath(fp: string, base: BaseDir): ResolvedPath {
    return { path: fp, base } as unknown as ResolvedPath;
  }

  async init(): Promise<void> {}
  async setCustomRootDir(): Promise<void> {}
  async selectDirectory(_mode: SelectDirectoryMode): Promise<string> {
    return '';
  }
  async selectFiles(): Promise<string[]> {
    return [];
  }
  async saveFile(): Promise<boolean> {
    return true;
  }
  async ask(): Promise<boolean> {
    return true;
  }
}

function createMockBook(overrides: Partial<Book> = {}): Book {
  return {
    hash: testOpenReadBookRef('test-hash-123'),
    format: 'epub' as BookFormat,
    title: 'Test Book',
    sourceTitle: 'Test Book',
    primaryLanguage: 'en',
    author: 'Test Author',
    createdAt: Date.now(),
    uploadedAt: null,
    deletedAt: null,
    downloadedAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('appService deleteBook storage lifecycle', () => {
  let appService: TestAppService;

  beforeEach(() => {
    vi.clearAllMocks();
    appService = new TestAppService();
  });

  it('local delete removes only the local book file and clears downloadedAt', async () => {
    const book = createMockBook({ downloadedAt: 123, coverDownloadedAt: 456, uploadedAt: 789 });
    const fs = (appService as unknown as { fs: FileSystem }).fs;
    vi.mocked(fs.exists).mockResolvedValue(true);

    await appService.deleteBook(book, 'local');

    expect(fs.removeFile).toHaveBeenCalledWith('mock-local-filename', 'Books');
    expect(fs.removeFile).not.toHaveBeenCalledWith('mock-cover-filename', 'Books');
    expect(deleteFile).not.toHaveBeenCalled();
    expect(book.downloadedAt).toBeNull();
    expect(book.coverDownloadedAt).toBe(456);
    expect(book.uploadedAt).toBe(789);
    expect(book.deletedAt).toBeNull();
  });

  it('cloud delete delegates to CloudSyncService and clears uploadedAt only', async () => {
    await appService.prepareBooksDir();
    const cloudDeleteSpy = vi.spyOn(CloudSyncService.prototype, 'deleteBookFromCloud');
    const book = createMockBook({ downloadedAt: 123, uploadedAt: 789, deletedAt: null });
    const fs = (appService as unknown as { fs: FileSystem }).fs;

    await appService.deleteBook(book, 'cloud');

    expect(cloudDeleteSpy).toHaveBeenCalledWith(book);
    expect(fs.removeFile).not.toHaveBeenCalled();
    expect(book.uploadedAt).toBeNull();
    expect(book.downloadedAt).toBe(123);
    expect(book.deletedAt).toBeNull();
  });

  it('both delete removes local book and cover, delegates cloud delete, and tombstones the book', async () => {
    await appService.prepareBooksDir();
    const cloudDeleteSpy = vi.spyOn(CloudSyncService.prototype, 'deleteBookFromCloud');
    const book = createMockBook({ downloadedAt: 123, coverDownloadedAt: 456, uploadedAt: 789 });
    const fs = (appService as unknown as { fs: FileSystem }).fs;
    vi.mocked(fs.exists).mockResolvedValue(true);

    await appService.deleteBook(book, 'both');

    expect(fs.removeFile).toHaveBeenCalledWith('mock-local-filename', 'Books');
    expect(fs.removeFile).toHaveBeenCalledWith('mock-cover-filename', 'Books');
    expect(cloudDeleteSpy).toHaveBeenCalledWith(book);
    expect(book.deletedAt).toEqual(expect.any(Number));
    expect(book.downloadedAt).toBeNull();
    expect(book.coverDownloadedAt).toBeNull();
    expect(book.uploadedAt).toBeNull();
  });
});

describe('appService importBook auto-upload', () => {
  let appService: TestAppService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    appService = new TestAppService();

    // Default mock: autoUpload enabled, transferManager ready
    mockIsReady.mockReturnValue(true);
    mockGetState.mockReturnValue({
      settings: { autoUpload: true },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should queue upload for non-transient import when autoUpload is enabled', async () => {
    const mockFile = new File(['test content'], 'test.epub');
    const books: Book[] = [];

    await appService.importBook(mockFile, books, true, true, false);

    // Auto-upload is called immediately (no delay)
    expect(mockQueueUpload).toHaveBeenCalledTimes(1);
    expect(mockQueueUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        hash: testOpenReadBookRef('d41d8cd98f00b204e9800998ecf8427e'),
        title: 'Test Book',
      }),
      1,
    );
  });

  it('should NOT queue upload when book already has uploadedAt', async () => {
    const mockFile = new File(['test content'], 'test.epub');
    const existingBook = createMockBook({
      hash: testOpenReadBookRef('d41d8cd98f00b204e9800998ecf8427e'),
      uploadedAt: Date.now(),
    });
    const books: Book[] = [existingBook];

    await appService.importBook(mockFile, books, true, true, false);

    // Advance timers
    vi.advanceTimersByTime(5000);

    expect(mockQueueUpload).not.toHaveBeenCalled();
  });

  it('should NOT queue upload when autoUpload setting is disabled', async () => {
    mockGetState.mockReturnValue({
      settings: { autoUpload: false },
    });

    const mockFile = new File(['test content'], 'test.epub');
    const books: Book[] = [];

    await appService.importBook(mockFile, books, true, true, false);

    // Advance timers
    vi.advanceTimersByTime(5000);

    expect(mockQueueUpload).not.toHaveBeenCalled();
  });

  it('should NOT queue upload when TransferManager is not ready', async () => {
    mockIsReady.mockReturnValue(false);

    const mockFile = new File(['test content'], 'test.epub');
    const books: Book[] = [];

    await appService.importBook(mockFile, books, true, true, false);

    // Advance timers
    vi.advanceTimersByTime(5000);

    expect(mockQueueUpload).not.toHaveBeenCalled();
  });

  it('should not throw if auto-upload encounters an error', async () => {
    mockGetState.mockImplementation(() => {
      throw new Error('Store not initialized');
    });

    const mockFile = new File(['test content'], 'test.epub');
    const books: Book[] = [];

    // Should not throw
    const result = await appService.importBook(mockFile, books, true, true, false);
    expect(result).not.toBeNull();

    // Advance timers - the error should be caught silently
    vi.advanceTimersByTime(5000);

    expect(mockQueueUpload).not.toHaveBeenCalled();
  });
});
