import { v4 as uuidv4 } from 'uuid';
import { SystemSettings } from '@/types/settings';
import {
  AppPlatform,
  AppService,
  DistChannel,
  FileItem,
  ImportBookContext,
  OsPlatform,
  ResolvedPath,
  SelectDirectoryMode,
} from '@/types/system';
import { FileSystem, BaseDir, DeleteAction } from '@/types/system';
import {
  Book,
  BookConfig,
  BookContent,
  BookFormat,
  FIXED_LAYOUT_FORMATS,
  ViewSettings,
} from '@/types/book';
import {
  getDir,
  getLocalBookFilename,
  getRemoteBookFilename,
  getCoverFilename,
  getConfigFilename,
  getLibraryFilename,
  INIT_BOOK_CONFIG,
  formatTitle,
  formatAuthors,
  getPrimaryLanguage,
  getLibraryBackupFilename,
} from '@/utils/book';
import { md5, partialMD5 } from '@/utils/md5';
import { computeFileHash } from '@/services/platform/storage';
import { parseLocalBookHash, parsePlatformBookHash } from '@openread/types';
import { getBaseFilename, getFilename } from '@/utils/path';
import { BookDoc, DocumentLoader, EXTS } from '@/libs/document';
import {
  DEFAULT_BOOK_LAYOUT,
  DEFAULT_BOOK_STYLE,
  DEFAULT_BOOK_FONT,
  DEFAULT_BOOK_LANGUAGE,
  DEFAULT_VIEW_CONFIG,
  DEFAULT_READSETTINGS,
  SYSTEM_SETTINGS_VERSION,
  DEFAULT_BOOK_SEARCH_CONFIG,
  DEFAULT_TTS_CONFIG,
  DEFAULT_MOBILE_VIEW_SETTINGS,
  DEFAULT_SYSTEM_SETTINGS,
  DEFAULT_CJK_VIEW_SETTINGS,
  DEFAULT_MOBILE_READSETTINGS,
  DEFAULT_SCREEN_CONFIG,
  DEFAULT_TRANSLATOR_CONFIG,
  DEFAULT_FIXED_LAYOUT_VIEW_SETTINGS,
  SETTINGS_FILENAME,
  DEFAULT_MOBILE_SYSTEM_SETTINGS,
  DEFAULT_ANNOTATOR_CONFIG,
  DEFAULT_EINK_VIEW_SETTINGS,
  CLOUD_BOOKS_SUBDIR,
} from './constants';
import { DEFAULT_AI_SETTINGS } from './ai/constants';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import {
  getOSPlatform,
  getTargetLang,
  isCJKEnv,
  isContentURI,
  isValidURL,
  makeSafeFilename,
} from '@/utils/misc';
import { migrateSystemSettingsTombstones } from '@/services/compatibility/tombstones';
import {
  hasLegacyReaderLayoutFields,
  mergeViewSettingsWithLegacyLayout,
} from '@/app/reader/utils/readerLayoutContract';
import { deserializeConfig, serializeConfig } from '@/utils/serializer';
import { downloadFile } from '@/libs/storage';
import { ClosableFile } from '@/utils/file';
import { ProgressHandler } from '@/utils/transfer';
import { TxtToEpubConverter } from '@/utils/txt';
import { BOOK_FILE_NOT_FOUND_ERROR } from './errors';
import { CustomTextureInfo } from '@/styles/textures';
import { CustomFont, CustomFontInfo } from '@/styles/fonts';
import { parseFontInfo } from '@/utils/font';
import { svg2png } from '@/utils/svg';
import { transferManager } from '@/services/transferManager';
import { useSettingsStore } from '@/store/settingsStore';
import { createLogger } from '@/utils/logger';
import { CloudSyncService } from './cloudSync';
import { LibraryPersistence } from './libraryPersistence';
import { platform } from '@/services/platform/client';
import {
  ImportFailureError,
  classifyBookParseFailure,
  classifyFileReadFailure,
  toImportFailureError,
} from '@/services/importFailure';
import type { ImportFailureReason } from '@/services/importFailure';

const logger = createLogger('appService');

type LocalImportArtifact =
  | {
      path: string;
      base: BaseDir;
      action: 'remove-created-file';
    }
  | {
      path: string;
      base: BaseDir;
      action: 'restore-overwritten-file';
      content: string | ArrayBuffer;
    };

export function createImportBookContext(books: Book[]): ImportBookContext {
  const booksByHash = new Map<Book['hash'], Book>();
  for (const book of books) {
    if (!booksByHash.has(book.hash)) {
      booksByHash.set(book.hash, book);
    }
  }
  return { booksByHash };
}

export abstract class BaseAppService implements AppService {
  osPlatform: OsPlatform = getOSPlatform();
  appPlatform: AppPlatform = 'tauri';
  localBooksDir = '';
  isMobile = false;

  /** P13.15: Extracted cloud sync service (initialized in prepareBooksDir) */
  private _cloudSync: CloudSyncService | null = null;
  /** P13.15: Extracted library persistence service (initialized in prepareBooksDir) */
  private _persistence: LibraryPersistence | null = null;
  isMacOSApp = false;
  isLinuxApp = false;
  isAppDataSandbox = false;
  isAndroidApp = false;
  isIOSApp = false;
  isMobileApp = false;
  isPortableApp = false;
  isDesktopApp = false;
  isAppImage = false;
  isEink = false;
  hasTrafficLight = false;
  hasWindow = false;
  hasWindowBar = false;
  hasContextMenu = false;
  hasRoundedWindow = false;
  hasSafeAreaInset = false;
  hasHaptics = false;
  hasUpdater = false;
  hasOrientationLock = false;
  hasScreenBrightness = false;
  hasIAP = false;
  canCustomizeRootDir = false;
  canReadExternalDir = false;
  distChannel = 'openread' as DistChannel;
  storefrontRegionCode: string | null = null;
  isOnlineCatalogsAccessible = true;

  protected get cloudSync(): CloudSyncService {
    if (!this._cloudSync)
      throw new Error('CloudSyncService not initialized — call prepareBooksDir() first');
    return this._cloudSync;
  }

  protected get persistence(): LibraryPersistence {
    if (!this._persistence)
      throw new Error('LibraryPersistence not initialized — call prepareBooksDir() first');
    return this._persistence;
  }

  protected CURRENT_MIGRATION_VERSION = 20251124;

  protected abstract fs: FileSystem;
  protected abstract resolvePath(fp: string, base: BaseDir): ResolvedPath;

  abstract init(): Promise<void>;
  abstract setCustomRootDir(customRootDir: string): Promise<void>;
  abstract selectDirectory(mode: SelectDirectoryMode): Promise<string>;
  abstract selectFiles(name: string, extensions: string[]): Promise<string[]>;
  abstract saveFile(
    filename: string,
    content: string | ArrayBuffer,
    filepath: string,
    mimeType?: string,
  ): Promise<boolean>;
  abstract ask(message: string): Promise<boolean>;

  protected async runMigrations(lastMigrationVersion: number): Promise<void> {
    if (lastMigrationVersion < 20251124) {
      try {
        await this.migrate20251124();
      } catch (error) {
        logger.error('Error migrating to version 20251124:', error);
      }
    }
  }

  async prepareBooksDir() {
    this.localBooksDir = await this.fs.getPrefix('Books');
    // P13.15: Initialize extracted services after fs is available
    this._persistence = new LibraryPersistence(this.fs);
    this._cloudSync = new CloudSyncService(this.fs, this.localBooksDir, (path, base) =>
      this.resolveFilePath(path, base),
    );
  }

  async openFile(path: string, base: BaseDir): Promise<File> {
    return await this.fs.openFile(path, base);
  }

  async copyFile(srcPath: string, dstPath: string, base: BaseDir): Promise<void> {
    return await this.fs.copyFile(srcPath, dstPath, base);
  }

  async moveFile(srcPath: string, dstPath: string, base: BaseDir): Promise<void> {
    if (this.fs.moveFile) {
      return await this.fs.moveFile(srcPath, dstPath, base);
    }

    await this.fs.copyFile(srcPath, dstPath, base);
    await this.fs.removeFile(srcPath, base);
  }

  async readFile(path: string, base: BaseDir, mode: 'text' | 'binary') {
    return await this.fs.readFile(path, base, mode);
  }

  async writeFile(path: string, base: BaseDir, content: string | ArrayBuffer | Blob) {
    return await this.fs.writeFile(path, base, content);
  }

  async createDir(path: string, base: BaseDir, recursive: boolean = true): Promise<void> {
    return await this.fs.createDir(path, base, recursive);
  }

  async deleteFile(path: string, base: BaseDir): Promise<void> {
    return await this.fs.removeFile(path, base);
  }

  async deleteDir(path: string, base: BaseDir, recursive: boolean = true): Promise<void> {
    return await this.fs.removeDir(path, base, recursive);
  }

  async resolveFilePath(path: string, base: BaseDir): Promise<string> {
    const prefix = await this.fs.getPrefix(base);
    return path ? `${prefix}/${path}` : prefix;
  }

  async readDirectory(path: string, base: BaseDir): Promise<FileItem[]> {
    return await this.fs.readDir(path, base);
  }

  async exists(path: string, base: BaseDir): Promise<boolean> {
    return await this.fs.exists(path, base);
  }

  async getImageURL(path: string): Promise<string> {
    return await this.fs.getImageURL(path);
  }

  getCoverImageUrl = (book: Book): string => {
    return this.fs.getURL(`${this.localBooksDir}/${getCoverFilename(book)}`);
  };

  getCoverImageBlobUrl = async (book: Book): Promise<string> => {
    return this.fs.getBlobURL(`${this.localBooksDir}/${getCoverFilename(book)}`, 'None');
  };

  async getCachedImageUrl(pathOrUrl: string): Promise<string> {
    const cachedKey = `img_${md5(pathOrUrl)}`;
    const cachePrefix = await this.fs.getPrefix('Cache');
    const cachedPath = `${cachePrefix}/${cachedKey}`;
    if (await this.fs.exists(cachedPath, 'None')) {
      return await this.fs.getImageURL(cachedPath);
    } else {
      const file = await this.fs.openFile(pathOrUrl, 'None');
      await this.fs.writeFile(cachedKey, 'Cache', await file.arrayBuffer());
      return await this.fs.getImageURL(cachedPath);
    }
  }

  getDefaultViewSettings(): ViewSettings {
    return {
      ...DEFAULT_BOOK_LAYOUT,
      ...DEFAULT_BOOK_STYLE,
      ...DEFAULT_BOOK_FONT,
      ...DEFAULT_BOOK_LANGUAGE,
      ...(this.isMobile ? DEFAULT_MOBILE_VIEW_SETTINGS : {}),
      ...(this.isEink ? DEFAULT_EINK_VIEW_SETTINGS : {}),
      ...(isCJKEnv() ? DEFAULT_CJK_VIEW_SETTINGS : {}),
      ...DEFAULT_VIEW_CONFIG,
      ...DEFAULT_TTS_CONFIG,
      ...DEFAULT_SCREEN_CONFIG,
      ...DEFAULT_ANNOTATOR_CONFIG,
      ...{ ...DEFAULT_TRANSLATOR_CONFIG, translateTargetLang: getTargetLang() },
    };
  }

  async loadSettings(): Promise<SystemSettings> {
    const defaultSettings: SystemSettings = {
      ...DEFAULT_SYSTEM_SETTINGS,
      ...(this.isMobile ? DEFAULT_MOBILE_SYSTEM_SETTINGS : {}),
      version: SYSTEM_SETTINGS_VERSION,
      localBooksDir: await this.fs.getPrefix('Books'),
      koreaderSyncDeviceId: uuidv4(),
      globalReadSettings: {
        ...DEFAULT_READSETTINGS,
        ...(this.isMobile ? DEFAULT_MOBILE_READSETTINGS : {}),
      },
      globalViewSettings: this.getDefaultViewSettings(),
    } as SystemSettings;

    let settings = await this.persistence.safeLoadJSON<SystemSettings>(
      SETTINGS_FILENAME,
      'Settings',
      defaultSettings,
    );

    const version = settings.version ?? 0;
    if (this.isAppDataSandbox || version < SYSTEM_SETTINGS_VERSION) {
      settings.version = SYSTEM_SETTINGS_VERSION;
    }
    settings = {
      ...DEFAULT_SYSTEM_SETTINGS,
      ...(this.isMobile ? DEFAULT_MOBILE_SYSTEM_SETTINGS : {}),
      ...settings,
    };
    settings.globalReadSettings = {
      ...DEFAULT_READSETTINGS,
      ...(this.isMobile ? DEFAULT_MOBILE_READSETTINGS : {}),
      ...settings.globalReadSettings,
    };
    const hadLegacyGlobalViewSettings = hasLegacyReaderLayoutFields(settings.globalViewSettings);
    settings.globalViewSettings = mergeViewSettingsWithLegacyLayout(
      this.getDefaultViewSettings(),
      settings.globalViewSettings,
    );
    settings.aiSettings = {
      ...DEFAULT_AI_SETTINGS,
      ...settings.aiSettings,
    };

    settings.localBooksDir = await this.fs.getPrefix('Books');

    const migrationResult = migrateSystemSettingsTombstones(settings);
    settings = migrationResult.value;

    if (!settings.kosync.deviceId) {
      settings.kosync.deviceId = uuidv4();
      await this.saveSettings(settings);
    } else if (migrationResult.changed || hadLegacyGlobalViewSettings) {
      await this.saveSettings(settings);
    }

    this.localBooksDir = settings.localBooksDir;
    this._cloudSync?.setLocalBooksDir(this.localBooksDir);
    return settings;
  }

  async saveSettings(settings: SystemSettings): Promise<void> {
    await this.persistence.safeSaveJSON(SETTINGS_FILENAME, 'Settings', settings);
  }

  async importFont(file?: string | File): Promise<CustomFontInfo | null> {
    let fontPath: string;
    let fontFile: File;
    if (typeof file === 'string') {
      const filePath = file;
      const fileobj = await this.fs.openFile(filePath, 'None');
      fontPath = fileobj.name || getFilename(filePath);
      await this.fs.copyFile(filePath, fontPath, 'Fonts');
      fontFile = await this.fs.openFile(fontPath, 'Fonts');
    } else if (file) {
      fontPath = getFilename(file.name);
      await this.fs.writeFile(fontPath, 'Fonts', file);
      fontFile = file;
    } else {
      return null;
    }

    return {
      path: fontPath,
      ...parseFontInfo(await fontFile.arrayBuffer(), fontPath),
    };
  }

  async deleteFont(font: CustomFont): Promise<void> {
    await this.fs.removeFile(font.path, 'Fonts');
  }

  async importImage(file?: string | File): Promise<CustomTextureInfo | null> {
    let imagePath: string;
    if (typeof file === 'string') {
      const filePath = file;
      const fileobj = await this.fs.openFile(filePath, 'None');
      imagePath = fileobj.name || getFilename(filePath);
      await this.fs.copyFile(filePath, imagePath, 'Images');
    } else if (file) {
      imagePath = getFilename(file.name);
      await this.fs.writeFile(imagePath, 'Images', file);
    } else {
      return null;
    }

    return {
      name: imagePath.replace(/\.[^/.]+$/, ''),
      path: imagePath,
    };
  }

  async deleteImage(texture: CustomTextureInfo): Promise<void> {
    await this.fs.removeFile(texture.path, 'Images');
  }

  private async cleanupLocalImportArtifacts(artifacts: LocalImportArtifact[]): Promise<void> {
    const cleanedArtifacts = new Set<string>();

    for (const artifact of [...artifacts].reverse()) {
      const artifactKey = `${artifact.action}:${artifact.base}:${artifact.path}`;
      if (cleanedArtifacts.has(artifactKey)) continue;
      cleanedArtifacts.add(artifactKey);

      try {
        if (artifact.action === 'restore-overwritten-file') {
          await this.fs.writeFile(artifact.path, artifact.base, artifact.content);
          continue;
        }

        if (await this.fs.exists(artifact.path, artifact.base)) {
          await this.fs.removeFile(artifact.path, artifact.base);
        }
      } catch (cleanupError) {
        logger.warn('Failed to clean up import artifact:', { artifact, cleanupError });
      }
    }
  }

  async importBook(
    // file might be:
    // 1.1 absolute path for local file on Desktop
    // 1.2 /private/var inbox file path on iOS
    // 2. remote url
    // 3. content provider uri
    // 4. File object from browsers
    file: string | File,
    books: Book[],
    saveBook: boolean = true,
    saveCover: boolean = true,
    overwrite: boolean = false,
    importContext?: ImportBookContext,
  ): Promise<Book | null> {
    const createdArtifacts: LocalImportArtifact[] = [];
    let localImportCommitted = false;
    let currentFailureReason: ImportFailureReason = 'book-parse-failed';

    try {
      let loadedBook: BookDoc;
      let format: BookFormat;
      let filename: string;
      let fileobj: File;

      try {
        currentFailureReason = 'file-read-failed';
        if (typeof file === 'string') {
          fileobj = await this.fs.openFile(file, 'None');
          filename = fileobj.name || getFilename(file);
        } else {
          fileobj = file;
          filename = file.name;
        }
      } catch (error) {
        throw classifyFileReadFailure(error);
      }

      if (!fileobj || fileobj.size === 0) {
        throw new ImportFailureError('file-empty');
      }
      if (/\.txt$/i.test(filename)) {
        try {
          currentFailureReason = 'txt-conversion-failed';
          const txt2epub = new TxtToEpubConverter();
          ({ file: fileobj } = await txt2epub.convert({ file: fileobj }));
        } catch (error) {
          throw toImportFailureError(error, 'txt-conversion-failed');
        }
      }
      if (!fileobj || fileobj.size === 0) {
        throw new ImportFailureError('file-empty');
      }
      try {
        currentFailureReason = 'book-parse-failed';
        ({ book: loadedBook, format } = await new DocumentLoader(fileobj).open());
        if (!loadedBook) {
          throw new ImportFailureError('book-parse-failed');
        }
        const metadataTitle = formatTitle(loadedBook.metadata.title);
        if (!metadataTitle || !metadataTitle.trim() || metadataTitle === filename) {
          loadedBook.metadata.title = getBaseFilename(filename);
        }
      } catch (error) {
        throw classifyBookParseFailure(error);
      }

      currentFailureReason = 'local-hash-failed';
      const hash = parseLocalBookHash(await partialMD5(fileobj));
      if (!hash) throw new ImportFailureError('local-hash-failed');

      // Compute full-file SHA-256 for book identification
      currentFailureReason = 'platform-hash-failed';
      const platformHash = parsePlatformBookHash(await computeFileHash(fileobj));
      if (!platformHash) throw new ImportFailureError('platform-hash-failed');

      const existingBook = importContext
        ? importContext.booksByHash.get(hash)
        : books.find((b) => b.hash === hash);

      const primaryLanguage = getPrimaryLanguage(loadedBook.metadata.language);
      const book: Book = {
        hash,
        format,
        platformHash,
        title: formatTitle(loadedBook.metadata.title),
        sourceTitle: formatTitle(loadedBook.metadata.title),
        primaryLanguage,
        author: formatAuthors(loadedBook.metadata.author, primaryLanguage),
        createdAt: existingBook ? existingBook.createdAt : Date.now(),
        uploadedAt: existingBook ? existingBook.uploadedAt : null,
        deletedAt: null,
        downloadedAt: Date.now(),
        updatedAt: Date.now(),
      };
      currentFailureReason = 'book-file-write-failed';
      const bookDir = getDir(book);
      const bookDirExists = await this.fs.exists(bookDir, 'Books');
      if (!bookDirExists) {
        await this.fs.createDir(bookDir, 'Books');
      }
      const bookFilename = getLocalBookFilename(book);
      const bookFileExists = await this.fs.exists(bookFilename, 'Books');
      if (saveBook && (!bookFileExists || overwrite)) {
        if (bookFileExists) {
          createdArtifacts.push({
            path: bookFilename,
            base: 'Books',
            action: 'restore-overwritten-file',
            content: await this.fs.readFile(bookFilename, 'Books', 'binary'),
          });
        } else {
          createdArtifacts.push({
            path: bookFilename,
            base: 'Books',
            action: 'remove-created-file',
          });
        }
        if (/\.txt$/i.test(filename)) {
          await this.fs.writeFile(bookFilename, 'Books', fileobj);
        } else if (typeof file === 'string' && isContentURI(file)) {
          await this.fs.copyFile(file, bookFilename, 'Books');
        } else if (typeof file === 'string' && !isValidURL(file)) {
          try {
            // try to copy the file directly first in case of large files to avoid memory issues
            // on desktop when reading recursively from selected directory the direct copy will fail
            // due to permission issues, then fallback to read and write files
            await this.fs.copyFile(file, bookFilename, 'Books');
          } catch (err) {
            logger.debug('Direct copy failed, falling back to read+write:', err);
            await this.fs.writeFile(bookFilename, 'Books', await fileobj.arrayBuffer());
          }
        } else {
          await this.fs.writeFile(bookFilename, 'Books', fileobj);
        }
      }
      const coverFilename = getCoverFilename(book);
      const coverFileExists = await this.fs.exists(coverFilename, 'Books');
      if (saveCover && (!coverFileExists || overwrite)) {
        currentFailureReason = 'cover-extraction-failed';
        let cover = await loadedBook.getCover();
        if (cover?.type === 'image/svg+xml') {
          try {
            logger.info('Converting SVG cover to PNG...');
            cover = await svg2png(cover);
          } catch (err) {
            logger.warn('SVG to PNG conversion failed, using original SVG:', err);
          }
        }
        if (cover) {
          if (coverFileExists) {
            createdArtifacts.push({
              path: coverFilename,
              base: 'Books',
              action: 'restore-overwritten-file',
              content: await this.fs.readFile(coverFilename, 'Books', 'binary'),
            });
          } else {
            createdArtifacts.push({
              path: coverFilename,
              base: 'Books',
              action: 'remove-created-file',
            });
          }
          currentFailureReason = 'cover-file-write-failed';
          await this.fs.writeFile(coverFilename, 'Books', await cover.arrayBuffer());
        }
      }
      if (!existingBook) {
        const configFilename = getConfigFilename(book);
        if (await this.fs.exists(configFilename, 'Books')) {
          createdArtifacts.push({
            path: configFilename,
            base: 'Books',
            action: 'restore-overwritten-file',
            content: await this.fs.readFile(configFilename, 'Books', 'binary'),
          });
        } else {
          createdArtifacts.push({
            path: configFilename,
            base: 'Books',
            action: 'remove-created-file',
          });
        }
        currentFailureReason = 'book-config-save-failed';
        await this.saveBookConfig(book, INIT_BOOK_CONFIG);
      }

      // update file links with url or content uri
      if (typeof file === 'string') {
        if (isValidURL(file)) {
          book.url = file;
        }
      }
      currentFailureReason = 'cover-extraction-failed';
      book.coverImageUrl = await this.generateCoverImageUrl(book);

      if (existingBook) {
        importContext?.booksByHash.set(hash, existingBook);
        existingBook.deletedAt = null;
        existingBook.createdAt = Date.now();
        existingBook.updatedAt = Date.now();
        existingBook.format = book.format;
        existingBook.title = existingBook.title.trim() ? existingBook.title.trim() : book.title;
        existingBook.sourceTitle = existingBook.sourceTitle ?? book.sourceTitle;
        existingBook.author = existingBook.author ?? book.author;
        existingBook.primaryLanguage = existingBook.primaryLanguage ?? book.primaryLanguage;
        existingBook.platformHash = platformHash;
        existingBook.downloadedAt = Date.now();
        if (book.url) existingBook.url = book.url;
      } else {
        books.splice(0, 0, book);
        importContext?.booksByHash.set(hash, book);
      }
      localImportCommitted = true;

      const f = file as ClosableFile;
      if (f && f.close) {
        try {
          await f.close();
        } catch (closeError) {
          logger.warn('Failed to close imported file after commit:', closeError);
        }
      }

      // Auto-upload to cloud immediately (no delay)
      const resultBook = existingBook || book;
      if (!resultBook.uploadedAt) {
        try {
          const settings = useSettingsStore.getState().settings;
          if (settings.autoUpload !== false && transferManager.isReady()) {
            logger.info('Queueing background auto-upload for:', resultBook.title);
            transferManager.queueUpload(resultBook, 1, true); // high priority, invisible durability lane
          }
        } catch (e) {
          logger.warn('Auto-upload failed:', e);
        }
      }

      return existingBook || book;
    } catch (error) {
      const importError = toImportFailureError(error, currentFailureReason);
      if (!localImportCommitted) {
        await this.cleanupLocalImportArtifacts(createdArtifacts);
      }
      logger.error('Error importing book:', importError);
      throw importError;
    }
  }

  async deleteBook(book: Book, deleteAction: DeleteAction): Promise<void> {
    logger.info('Deleting book with action:', { deleteAction, title: book.title });
    if (deleteAction === 'local' || deleteAction === 'both') {
      const localDeleteFps =
        deleteAction === 'local'
          ? [getLocalBookFilename(book)]
          : [getLocalBookFilename(book), getCoverFilename(book)];
      for (const fp of localDeleteFps) {
        if (await this.fs.exists(fp, 'Books')) {
          await this.fs.removeFile(fp, 'Books');
        }
      }
      if (deleteAction === 'local') {
        book.downloadedAt = null;
      } else {
        book.deletedAt = Date.now();
        book.downloadedAt = null;
        book.coverDownloadedAt = null;
      }
    }
    if (deleteAction === 'cloud' || deleteAction === 'both') {
      await this.cloudSync.deleteBookFromCloud(book);
    }
  }

  /** P13.15: Delegates to CloudSyncService */
  async uploadFileToCloud(
    lfp: string,
    cfp: string,
    base: BaseDir,
    handleProgress: ProgressHandler,
    hash: string,
    temp: boolean = false,
  ) {
    return this.cloudSync.uploadFileToCloud(lfp, cfp, base, handleProgress, hash, temp);
  }

  async uploadBook(book: Book, onProgress?: ProgressHandler): Promise<void> {
    return this.cloudSync.uploadBook(book, onProgress);
  }

  async downloadCloudFile(lfp: string, cfp: string, onProgress: ProgressHandler) {
    return this.cloudSync.downloadCloudFile(lfp, cfp, onProgress, this);
  }

  async downloadBookCovers(books: Book[]): Promise<void> {
    return this.cloudSync.downloadBookCovers(books, this);
  }

  async downloadBook(
    book: Book,
    onlyCover = false,
    redownload = false,
    onProgress?: ProgressHandler,
  ): Promise<void> {
    return this.cloudSync.downloadBook(book, this, onlyCover, redownload, onProgress);
  }

  private async downloadStorageBackedBook(book: Book, onProgress?: ProgressHandler): Promise<void> {
    if (!book.storagePath) throw new Error(BOOK_FILE_NOT_FOUND_ERROR);

    const data = await platform.catalog.getDownloadUrl(book.hash);
    if (!data.downloadUrl) throw new Error('No download URL available');

    const localPath = getLocalBookFilename(book);
    if (!(await this.fs.exists(getDir(book), 'Books'))) {
      await this.fs.createDir(getDir(book), 'Books');
    }

    await downloadFile({
      appService: this,
      dst: `${this.localBooksDir}/${localPath}`,
      cfp: book.storagePath,
      url: data.downloadUrl,
      expectedSizeBytes: data.sizeBytes,
      expectedSha256: book.platformHash,
      onProgress,
    });
    book.downloadedAt = Date.now();
  }

  private async downloadFileMetadataBackedBook(
    book: Book,
    onProgress?: ProgressHandler,
  ): Promise<void> {
    const localPath = getLocalBookFilename(book);
    if (!(await this.fs.exists(getDir(book), 'Books'))) {
      await this.fs.createDir(getDir(book), 'Books');
    }

    await downloadFile({
      appService: this,
      dst: `${this.localBooksDir}/${localPath}`,
      cfp: `${CLOUD_BOOKS_SUBDIR}/${getRemoteBookFilename(book)}`,
      bookHash: book.hash,
      kind: 'user_book_file',
      expectedSha256: book.platformHash,
      onProgress,
    });
    book.downloadedAt = Date.now();
  }

  private async downloadUploadedBookFile(book: Book, onProgress?: ProgressHandler): Promise<void> {
    const localPath = getLocalBookFilename(book);
    if (!(await this.fs.exists(getDir(book), 'Books'))) {
      await this.fs.createDir(getDir(book), 'Books');
    }

    await downloadFile({
      appService: this,
      dst: `${this.localBooksDir}/${localPath}`,
      cfp: `${CLOUD_BOOKS_SUBDIR}/${getRemoteBookFilename(book)}`,
      expectedSha256: book.platformHash,
      onProgress,
    });
    book.downloadedAt = Date.now();
  }

  async exportBook(book: Book): Promise<boolean> {
    const { file } = await this.loadBookContent(book);
    const content = await file.arrayBuffer();
    const filename = `${makeSafeFilename(book.title)}.${book.format.toLowerCase()}`;
    const filepath = await this.resolveFilePath(getLocalBookFilename(book), 'Books');
    const fileType = file.type || 'application/octet-stream';
    return await this.saveFile(filename, content, filepath, fileType);
  }

  async isBookAvailable(book: Book): Promise<boolean> {
    const fp = getLocalBookFilename(book);
    if (await this.fs.exists(fp, 'Books')) {
      return true;
    }
    if (book.url) {
      return isValidURL(book.url);
    }
    return false;
  }

  async getBookFileSize(book: Book): Promise<number | null> {
    const fp = getLocalBookFilename(book);
    if (await this.fs.exists(fp, 'Books')) {
      const file = await this.fs.openFile(fp, 'Books');
      const size = file.size;
      const f = file as ClosableFile;
      if (f && f.close) {
        await f.close();
      }
      return size;
    }
    return null;
  }

  async loadBookContent(book: Book, onProgress?: ProgressHandler): Promise<BookContent> {
    let file: File;
    const fp = getLocalBookFilename(book);
    if (await this.fs.exists(fp, 'Books')) {
      file = await this.fs.openFile(fp, 'Books');
    } else if (book.storagePath) {
      await this.downloadStorageBackedBook(book, onProgress);
      file = await this.fs.openFile(fp, 'Books');
    } else {
      try {
        await this.downloadFileMetadataBackedBook(book, onProgress);
        file = await this.fs.openFile(fp, 'Books');
      } catch (metadataError) {
        logger.info('Book active file metadata download unavailable', {
          hash: book.hash,
          error: metadataError,
        });
        if (book.url) {
          file = await this.fs.openFile(book.url, 'None');
        } else {
          // 0.9.64 has a bug that book.title might be modified but the filename is not updated
          const bookDir = getDir(book);
          const files = await this.fs.readDir(getDir(book), 'Books');
          if (files.length > 0) {
            const bookFile = files.find((f) => f.path.endsWith(`.${EXTS[book.format]}`));
            if (bookFile) {
              file = await this.fs.openFile(`${bookDir}/${bookFile.path}`, 'Books');
            } else if (book.uploadedAt) {
              logger.info('Book file not found locally, downloading from cloud', book.hash);
              await this.downloadBook(book, false, false, onProgress);
              file = await this.fs.openFile(fp, 'Books');
            } else {
              throw new Error(BOOK_FILE_NOT_FOUND_ERROR);
            }
          } else if (book.uploadedAt) {
            logger.info('Book directory empty, downloading from cloud', book.hash);
            await this.downloadBook(book, false, false, onProgress);
            file = await this.fs.openFile(fp, 'Books');
          } else {
            throw new Error(BOOK_FILE_NOT_FOUND_ERROR);
          }
        }
      }
    }
    return { book, file };
  }

  async redownloadBookContent(book: Book, onProgress?: ProgressHandler): Promise<BookContent> {
    if (book.storagePath) {
      await this.downloadStorageBackedBook(book, onProgress);
      return this.loadBookContent(book, onProgress);
    }

    if (book.url && !book.uploadedAt) {
      throw new Error(BOOK_FILE_NOT_FOUND_ERROR);
    }

    try {
      await this.downloadFileMetadataBackedBook(book, onProgress);
    } catch (metadataError) {
      logger.info('Book active file metadata redownload unavailable', {
        hash: book.hash,
        error: metadataError,
      });
      if (!book.uploadedAt) {
        throw metadataError;
      }
      await this.downloadUploadedBookFile(book, onProgress);
    }

    return this.loadBookContent(book, onProgress);
  }

  async loadBookConfig(book: Book, settings: SystemSettings): Promise<BookConfig> {
    const globalViewSettings = {
      ...settings.globalViewSettings,
      ...(FIXED_LAYOUT_FORMATS.has(book.format) ? DEFAULT_FIXED_LAYOUT_VIEW_SETTINGS : {}),
    };
    try {
      let str = '{}';
      if (await this.fs.exists(getConfigFilename(book), 'Books')) {
        str = (await this.fs.readFile(getConfigFilename(book), 'Books', 'text')) as string;
      }
      return deserializeConfig(str, globalViewSettings, DEFAULT_BOOK_SEARCH_CONFIG);
    } catch (err) {
      logger.warn(`Failed to load config for "${book.title}", using defaults:`, err);
      return deserializeConfig('{}', globalViewSettings, DEFAULT_BOOK_SEARCH_CONFIG);
    }
  }

  async fetchBookDetails(book: Book) {
    const fp = getLocalBookFilename(book);
    if (!(await this.fs.exists(fp, 'Books')) && book.uploadedAt) {
      await this.downloadBook(book);
    }
    const { file } = await this.loadBookContent(book);
    const bookDoc = (await new DocumentLoader(file).open()).book;
    const f = file as ClosableFile;
    if (f && f.close) {
      await f.close();
    }
    return bookDoc.metadata;
  }

  async saveBookConfig(book: Book, config: BookConfig, settings?: SystemSettings) {
    let serializedConfig: string;
    if (settings) {
      const globalViewSettings = {
        ...settings.globalViewSettings,
        ...(FIXED_LAYOUT_FORMATS.has(book.format) ? DEFAULT_FIXED_LAYOUT_VIEW_SETTINGS : {}),
      };
      serializedConfig = serializeConfig(config, globalViewSettings, DEFAULT_BOOK_SEARCH_CONFIG);
    } else {
      serializedConfig = JSON.stringify(config);
    }
    await this.fs.writeFile(getConfigFilename(book), 'Books', serializedConfig);
  }

  async generateCoverImageUrl(book: Book): Promise<string | null> {
    if (!(await this.fs.exists(getCoverFilename(book), 'Books'))) return null;
    // Web and mobile use blob: URLs (WKWebView on iOS blocks tauri:// in <img src>).
    // Desktop uses convertFileSrc → tauri:// protocol which works on macOS/Windows/Linux.
    return this.appPlatform === 'web' || this.isMobile
      ? await this.getCoverImageBlobUrl(book)
      : this.getCoverImageUrl(book);
  }

  /** P13.15: Delegates to LibraryPersistence */
  async loadLibraryBooks(): Promise<Book[]> {
    return this.persistence.loadLibraryBooks((book) => this.generateCoverImageUrl(book));
  }

  async saveLibraryBooks(books: Book[]): Promise<void> {
    return this.persistence.saveLibraryBooks(books);
  }

  private imageToArrayBuffer(imageUrl?: string, imageFile?: string): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      if (!imageUrl && !imageFile) {
        reject(new Error('No image URL or file provided'));
        return;
      }
      if (this.appPlatform === 'web' && imageUrl && imageUrl.startsWith('blob:')) {
        fetch(imageUrl)
          .then((response) => response.arrayBuffer())
          .then((buffer) => resolve(buffer))
          .catch((error) => reject(error));
      } else if (this.appPlatform === 'tauri' && imageFile) {
        this.fs
          .openFile(imageFile, 'None')
          .then((file) => file.arrayBuffer())
          .then((buffer) => resolve(buffer))
          .catch((error) => reject(error));
      } else if (this.appPlatform === 'tauri' && imageUrl) {
        tauriFetch(imageUrl, { method: 'GET' })
          .then((response) => response.arrayBuffer())
          .then((buffer) => resolve(buffer))
          .catch((error) => reject(error));
      } else {
        reject(new Error('Unsupported platform or missing image data'));
      }
    });
  }

  async updateCoverImage(book: Book, imageUrl?: string, imageFile?: string): Promise<void> {
    if (imageUrl === '_blank') {
      await this.fs.removeFile(getCoverFilename(book), 'Books');
    } else if (imageUrl || imageFile) {
      const arrayBuffer = await this.imageToArrayBuffer(imageUrl, imageFile);
      await this.fs.writeFile(getCoverFilename(book), 'Books', arrayBuffer);
    }
  }

  private async migrate20251124(): Promise<void> {
    logger.info('Running migration for version 20251124 to rename the backup library file...');
    const oldBackupFilename = getLibraryBackupFilename();
    const newBackupFilename = `${getLibraryFilename()}.bak`;
    if (await this.fs.exists(oldBackupFilename, 'Books')) {
      try {
        const content = await this.fs.readFile(oldBackupFilename, 'Books', 'text');
        await this.fs.writeFile(newBackupFilename, 'Books', content);
        await this.fs.removeFile(oldBackupFilename, 'Books');
        logger.info('Migration to rename backup library file completed successfully.');
      } catch (error) {
        logger.error('Error during migration to rename backup library file:', error);
      }
    }
  }
}
