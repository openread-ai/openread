import { testOpenReadBookRef, testPlatformBookHash } from '../utils/bookIdentityFixtures';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted so these are available inside hoisted vi.mock factories
const {
  mockQueueUpload,
  mockIsReady,
  mockGetState,
  mockGetDownloadUrl,
  mockGetCover,
  MockDocumentLoader,
} = vi.hoisted(() => {
  const getCover = vi.fn(async () => null as Blob | null);

  // Must use a regular function (not arrow) so it can be called with `new`
  class FakeDocumentLoader {
    async open() {
      return {
        book: {
          metadata: { title: 'Test Book', author: 'Author', language: 'en' },
          getCover,
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
    mockGetDownloadUrl: vi.fn(async () => ({ downloadUrl: 'https://signed.example/book.epub' })),
    mockGetCover: getCover,
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

vi.mock('@/services/platform/client', () => ({
  platform: {
    catalog: {
      getDownloadUrl: mockGetDownloadUrl,
    },
  },
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
import { deleteFile, downloadFile } from '@/libs/storage';
import { getConfigFilename, getCoverFilename, getDir, getLocalBookFilename } from '@/utils/book';
import { partialMD5 } from '@/utils/md5';
import { ImportFailureError } from '@/services/importFailure';
import type { ImportFailureReason } from '@/services/importFailure';
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

function installTrackedBooksFs(appService: TestAppService, initialPaths: string[] = []) {
  const files = new Map<string, string | ArrayBuffer | File>(
    initialPaths.map((path) => [path, `old:${path}`]),
  );
  const dirs = new Set<string>();
  const fs = (appService as unknown as { fs: FileSystem }).fs;

  vi.mocked(fs.exists).mockImplementation(
    async (path: string) => files.has(path) || dirs.has(path),
  );
  vi.mocked(fs.createDir).mockImplementation(async (path: string) => {
    dirs.add(path);
  });
  vi.mocked(fs.readFile).mockImplementation(async (path: string) => {
    const content = files.get(path);
    if (content === undefined) throw new Error(`File not found: ${path}`);
    return content instanceof File ? await content.arrayBuffer() : content;
  });
  vi.mocked(fs.writeFile).mockImplementation(async (path: string, _base: BaseDir, content) => {
    files.set(path, content);
  });
  vi.mocked(fs.copyFile).mockImplementation(async (_src: string, dst: string) => {
    files.set(dst, `copied:${dst}`);
  });
  vi.mocked(fs.removeFile).mockImplementation(async (path: string) => {
    files.delete(path);
  });
  vi.mocked(fs.removeDir).mockImplementation(async (path: string) => {
    dirs.delete(path);
    for (const filePath of [...files.keys()]) {
      if (filePath.startsWith(path)) files.delete(filePath);
    }
  });
  vi.mocked(fs.getBlobURL).mockResolvedValue('mock-blob-url');

  return { files, dirs, fs };
}

function resetImportBookMocks() {
  vi.mocked(partialMD5).mockResolvedValue('d41d8cd98f00b204e9800998ecf8427e');
  vi.mocked(getDir).mockReturnValue('mock-dir');
  vi.mocked(getLocalBookFilename).mockReturnValue('mock-local-filename');
  vi.mocked(getCoverFilename).mockReturnValue('mock-cover-filename');
  vi.mocked(getConfigFilename).mockReturnValue('mock-config-filename');
  mockGetCover.mockResolvedValue(null);
  mockIsReady.mockReturnValue(true);
  mockGetState.mockReturnValue({
    settings: { autoUpload: true },
  });
}

function createCoverBlob(): Blob {
  return {
    type: 'image/png',
    arrayBuffer: vi.fn(async () => new ArrayBuffer(5)),
  } as unknown as Blob;
}

async function expectImportFailureReason(
  promise: Promise<unknown>,
  reason: ImportFailureReason,
): Promise<ImportFailureError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ImportFailureError);
    expect((error as ImportFailureError).reason).toBe(reason);
    return error as ImportFailureError;
  }
  throw new Error(`Expected import to fail with ${reason}`);
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

describe('appService book content loading', () => {
  let appService: TestAppService;

  beforeEach(() => {
    vi.clearAllMocks();
    appService = new TestAppService();
  });

  it('keeps storagePath-backed books on the catalog signing path', async () => {
    const fs = (appService as unknown as { fs: FileSystem }).fs;
    vi.mocked(fs.exists).mockResolvedValue(false);
    vi.mocked(downloadFile).mockResolvedValue({});

    const book = createMockBook({
      hash: testOpenReadBookRef('d41d8cd98f00b204e9800998ecf8427e'),
      storagePath: 'catalog/books/test.epub',
      downloadedAt: null,
    });

    const content = await appService.loadBookContent(book);

    expect(mockGetDownloadUrl).toHaveBeenCalledWith(book.hash);
    expect(downloadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        appService,
        dst: '/mock-local-filename',
        cfp: 'catalog/books/test.epub',
        url: 'https://signed.example/book.epub',
      }),
    );
    expect(downloadFile).toHaveBeenCalledWith(
      expect.not.objectContaining({
        bookHash: book.hash,
        kind: 'user_book_file',
      }),
    );
    expect(content.file).toBeInstanceOf(File);
    expect(book.downloadedAt).toEqual(expect.any(Number));
  });

  it('downloads a remote book from active file metadata when book storagePath is missing', async () => {
    const fs = (appService as unknown as { fs: FileSystem }).fs;
    vi.mocked(fs.exists).mockResolvedValue(false);
    vi.mocked(downloadFile).mockResolvedValue({});

    const book = createMockBook({
      hash: testOpenReadBookRef('d41d8cd98f00b204e9800998ecf8427e'),
      storagePath: null,
      uploadedAt: null,
      downloadedAt: null,
    });

    const content = await appService.loadBookContent(book);

    expect(downloadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        appService,
        dst: '/mock-local-filename',
        cfp: 'books/mock-remote-filename',
        bookHash: book.hash,
        kind: 'user_book_file',
      }),
    );
    expect(content.file).toBeInstanceOf(File);
    expect(book.downloadedAt).toEqual(expect.any(Number));
  });
});

describe('appService importBook transaction-like rollback', () => {
  let appService: TestAppService;

  beforeEach(() => {
    vi.clearAllMocks();
    resetImportBookMocks();
    mockIsReady.mockReturnValue(false);
    appService = new TestAppService();
  });

  it('classifies empty non-TXT files as file-empty before parsing', async () => {
    const { files } = installTrackedBooksFs(appService);
    const books: Book[] = [];

    await expectImportFailureReason(
      appService.importBook(new File([], 'empty.epub'), books),
      'file-empty',
    );

    expect(files.has('mock-local-filename')).toBe(false);
    expect(books).toHaveLength(0);
  });

  it('classifies empty TXT files as file-empty before conversion', async () => {
    const { files } = installTrackedBooksFs(appService);
    const books: Book[] = [];

    await expectImportFailureReason(
      appService.importBook(new File([], 'empty.txt'), books),
      'file-empty',
    );

    expect(files.has('mock-local-filename')).toBe(false);
    expect(books).toHaveLength(0);
  });

  it('cleans a newly written book file when cover extraction fails', async () => {
    const { files } = installTrackedBooksFs(appService);
    const books: Book[] = [];
    mockGetCover.mockRejectedValue(new Error('cover failed'));

    await expectImportFailureReason(
      appService.importBook(new File(['test content'], 'test.epub'), books),
      'cover-extraction-failed',
    );

    expect(files.has('mock-local-filename')).toBe(false);
    expect(files.has('mock-cover-filename')).toBe(false);
    expect(files.has('mock-config-filename')).toBe(false);
    expect(books).toHaveLength(0);
    expect(mockQueueUpload).not.toHaveBeenCalled();
  });

  it('cleans newly created book and cover files when config save fails', async () => {
    const { files, fs } = installTrackedBooksFs(appService);
    const books: Book[] = [];
    mockGetCover.mockResolvedValue(createCoverBlob());
    vi.mocked(fs.writeFile).mockImplementation(async (path: string, _base: BaseDir, content) => {
      if (path === 'mock-config-filename') throw new Error('config failed');
      files.set(path, content);
    });

    await expectImportFailureReason(
      appService.importBook(new File(['test content'], 'test.epub'), books),
      'book-config-save-failed',
    );

    expect(files.has('mock-local-filename')).toBe(false);
    expect(files.has('mock-cover-filename')).toBe(false);
    expect(files.has('mock-config-filename')).toBe(false);
    expect(books).toHaveLength(0);
  });

  it('cleans staged artifacts when cover URL generation fails before library commit', async () => {
    const { files, fs } = installTrackedBooksFs(appService);
    const books: Book[] = [];
    mockGetCover.mockResolvedValue(createCoverBlob());
    vi.mocked(fs.getURL).mockImplementation(() => {
      throw new Error('cover url failed');
    });

    await expectImportFailureReason(
      appService.importBook(new File(['test content'], 'test.epub'), books),
      'cover-extraction-failed',
    );

    expect(files.has('mock-local-filename')).toBe(false);
    expect(files.has('mock-cover-filename')).toBe(false);
    expect(files.has('mock-config-filename')).toBe(false);
    expect(books).toHaveLength(0);
  });

  it('restores a pre-existing config for a new library entry when import fails before commit', async () => {
    const { files, fs } = installTrackedBooksFs(appService, ['mock-config-filename']);
    const books: Book[] = [];
    mockGetCover.mockResolvedValue(createCoverBlob());
    vi.mocked(fs.getURL).mockImplementation(() => {
      throw new Error('cover url failed');
    });

    await expectImportFailureReason(
      appService.importBook(new File(['test content'], 'test.epub'), books),
      'cover-extraction-failed',
    );

    expect(files.has('mock-local-filename')).toBe(false);
    expect(files.get('mock-config-filename')).toBe('old:mock-config-filename');
    expect(books).toHaveLength(0);
    expect(fs.removeDir).not.toHaveBeenCalled();
  });

  it('preserves existing-book metadata and pre-existing files on reimport failure', async () => {
    const existingBook = createMockBook({
      hash: testOpenReadBookRef('d41d8cd98f00b204e9800998ecf8427e'),
      title: 'Old Title',
      sourceTitle: 'Old Source',
      author: 'Old Author',
      primaryLanguage: 'fr',
      platformHash: testPlatformBookHash('old-platform-hash'),
      downloadedAt: 111,
      updatedAt: 222,
      createdAt: 333,
      deletedAt: 444,
    });
    const books: Book[] = [
      createMockBook({ hash: testOpenReadBookRef('other-book') }),
      existingBook,
    ];
    const originalSnapshot = { ...existingBook };
    const { files, fs } = installTrackedBooksFs(appService, [
      'mock-local-filename',
      'mock-cover-filename',
      'mock-config-filename',
    ]);
    vi.mocked(fs.getURL).mockImplementation(() => {
      throw new Error('cover url failed');
    });

    await expectImportFailureReason(
      appService.importBook(new File(['test content'], 'test.epub'), books),
      'cover-extraction-failed',
    );

    expect(existingBook).toEqual(originalSnapshot);
    expect(books[1]).toBe(existingBook);
    expect(files.has('mock-local-filename')).toBe(true);
    expect(files.has('mock-cover-filename')).toBe(true);
    expect(files.has('mock-config-filename')).toBe(true);
    expect(fs.removeFile).not.toHaveBeenCalled();
    expect(fs.removeDir).not.toHaveBeenCalled();
  });

  it('restores overwritten book and cover files when overwrite reimport fails', async () => {
    const existingBook = createMockBook({
      hash: testOpenReadBookRef('d41d8cd98f00b204e9800998ecf8427e'),
      title: 'Old Title',
      platformHash: testPlatformBookHash('old-platform-hash'),
      downloadedAt: 111,
      updatedAt: 222,
      createdAt: 333,
      deletedAt: 444,
    });
    const books: Book[] = [existingBook];
    const originalSnapshot = { ...existingBook };
    const { files, fs } = installTrackedBooksFs(appService, [
      'mock-local-filename',
      'mock-cover-filename',
      'mock-config-filename',
    ]);
    mockGetCover.mockResolvedValue(createCoverBlob());
    vi.mocked(fs.getURL).mockImplementation(() => {
      throw new Error('cover url failed');
    });

    await expectImportFailureReason(
      appService.importBook(new File(['new content'], 'test.epub'), books, true, true, true),
      'cover-extraction-failed',
    );

    expect(existingBook).toEqual(originalSnapshot);
    expect(files.get('mock-local-filename')).toBe('old:mock-local-filename');
    expect(files.get('mock-cover-filename')).toBe('old:mock-cover-filename');
    expect(files.get('mock-config-filename')).toBe('old:mock-config-filename');
    expect(fs.removeDir).not.toHaveBeenCalled();
  });

  it('does not fail a committed import when closing the source file fails', async () => {
    const { files } = installTrackedBooksFs(appService);
    const books: Book[] = [];
    const importFile = new File(['test content'], 'test.epub') as File & {
      close: () => Promise<void>;
    };
    importFile.close = vi.fn(async () => {
      throw new Error('close failed');
    });

    const result = await appService.importBook(importFile, books);

    expect(result).toEqual(books[0]);
    expect(books).toHaveLength(1);
    expect(files.has('mock-local-filename')).toBe(true);
    expect(importFile.close).toHaveBeenCalledTimes(1);
  });

  it('keeps successful new import behavior unchanged', async () => {
    const { files } = installTrackedBooksFs(appService);
    const books: Book[] = [];
    mockGetCover.mockResolvedValue(createCoverBlob());

    const result = await appService.importBook(new File(['test content'], 'test.epub'), books);

    expect(result).toEqual(books[0]);
    expect(books).toHaveLength(1);
    expect(files.has('mock-local-filename')).toBe(true);
    expect(files.has('mock-cover-filename')).toBe(true);
    expect(files.has('mock-config-filename')).toBe(true);
  });

  it('keeps batch-style imports at N-1 successes with no failed-attempt artifacts', async () => {
    const hashes: Record<string, string> = {
      'ok-1.epub': '11111111111111111111111111111111',
      'fail.epub': '22222222222222222222222222222222',
      'ok-2.epub': '33333333333333333333333333333333',
    };
    vi.mocked(partialMD5).mockImplementation(async (file) => hashes[(file as File).name]);
    vi.mocked(getDir).mockImplementation((book) => `dir-${book.hash}`);
    vi.mocked(getLocalBookFilename).mockImplementation((book) => `book-${book.hash}.epub`);
    vi.mocked(getCoverFilename).mockImplementation((book) => `cover-${book.hash}.png`);
    vi.mocked(getConfigFilename).mockImplementation((book) => `config-${book.hash}.json`);
    mockGetCover.mockResolvedValue(createCoverBlob());

    const { files, fs } = installTrackedBooksFs(appService);
    vi.mocked(fs.writeFile).mockImplementation(async (path: string, _base: BaseDir, content) => {
      if (path === `config-${hashes['fail.epub']}.json`) throw new Error('config failed');
      files.set(path, content);
    });

    const books: Book[] = [];
    let successCount = 0;
    let failCount = 0;
    for (const name of ['ok-1.epub', 'fail.epub', 'ok-2.epub']) {
      try {
        await appService.importBook(new File(['test content'], name), books);
        successCount++;
      } catch {
        failCount++;
      }
    }

    expect(successCount).toBe(2);
    expect(failCount).toBe(1);
    expect(books).toHaveLength(2);
    expect(files.has(`book-${hashes['fail.epub']}.epub`)).toBe(false);
    expect(files.has(`cover-${hashes['fail.epub']}.png`)).toBe(false);
    expect(files.has(`config-${hashes['fail.epub']}.json`)).toBe(false);
    expect(files.has(`book-${hashes['ok-1.epub']}.epub`)).toBe(true);
    expect(files.has(`book-${hashes['ok-2.epub']}.epub`)).toBe(true);
  });
});

describe('appService importBook auto-upload', () => {
  let appService: TestAppService;

  beforeEach(() => {
    vi.clearAllMocks();
    resetImportBookMocks();
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
