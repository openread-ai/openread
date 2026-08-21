import { BookMetadata } from '@/libs/document';
import { TTSHighlightOptions } from '@/services/tts/types';
import { AnnotationToolType } from './annotator';

import type {
  BookFormat as _BookFormat,
  BookCore,
  MetaHash,
  PlatformBookHash,
  SyncableBookRef,
} from '@openread/types';
export type { BookFormat, BookCore } from '@openread/types';
export type BookNoteType = 'bookmark' | 'annotation' | 'excerpt';
export type ReadingStatus = 'unread' | 'reading' | 'finished';
export type HighlightStyle = 'highlight' | 'underline' | 'squiggly';

export type AnnotationPageRect = { x: number; y: number; width: number; height: number };
export type AnnotationPageQuad = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x3: number;
  y3: number;
  x4: number;
  y4: number;
};
export type CanonicalAnnotationTarget =
  | {
      kind: 'text-cfi';
      cfi: string;
      href?: string;
      index?: number;
      textQuote?: string;
      textPosition?: { start: number; end: number };
    }
  | {
      kind: 'pdf-text-quad';
      pageIndex: number;
      pageWidth: number;
      pageHeight: number;
      rotation: number;
      quads: AnnotationPageQuad[];
      textQuote?: string;
      textPosition?: { start: number; end: number };
    }
  | {
      kind: 'page-region';
      pageIndex: number;
      pageWidth: number;
      pageHeight: number;
      rotation: number;
      rects: AnnotationPageRect[];
      source: 'manual-region' | 'image-selection' | 'text-selection' | 'imported';
    };

export type AnnotationTarget = CanonicalAnnotationTarget;

// Predefined highlight colors, can be extended with custom hex colors
export type HighlightColor = 'red' | 'yellow' | 'green' | 'blue' | 'violet' | string;
export type ReadingRulerColor = 'transparent' | 'yellow' | 'green' | 'blue' | 'rose';

export interface ParagraphModeConfig {
  enabled: boolean;
}

export const FIXED_LAYOUT_FORMATS: Set<_BookFormat> = new Set<_BookFormat>(['pdf', 'cbz']);

export interface Book extends BookCore {
  id?: string;
  // if Book is a remote book we just lazy load the book content via url
  url?: string;
  // Metadata md5 hash, used to aggregate different versions of the same book
  metaHash?: MetaHash | null;
  // Full-file SHA-256 hash matching the platform API's computeHash(), used for book identification
  platformHash?: PlatformBookHash;
  sourceTitle?: string; // parsed when the book is imported and used to locate the file
  author: string;
  groupId?: string;
  groupName?: string;
  tags?: string[];
  coverImageUrl?: string | null;
  /** Canonical local/library file size in bytes when known. */
  sizeBytes?: number | null;

  deletedAt?: number | null;

  uploadedAt?: number | null;
  downloadedAt?: number | null;
  coverDownloadedAt?: number | null;
  syncedAt?: number | null;

  progress?: [number, number]; // Add progress field: [current, total], 1-based page number
  readingStatus?: ReadingStatus;
  primaryLanguage?: string;

  /** Catalog book ID if imported from the free catalog. Null/undefined for user uploads. */
  catalogBookId?: string | null;
  /** R2 object key for storage-backed catalog imports. */
  storagePath?: string | null;
  /** Server-owned, bounded remediation signal. Clients consume but never write this field. */
  contentReconcileRequired?: boolean;

  metadata?: BookMetadata;
}

export interface BookGroupType {
  id: string;
  name: string;
}

export interface PageInfo {
  current: number;
  next?: number;
  total: number;
}

// Remaining time of the book in minutes
export interface TimeInfo {
  section: number;
  total: number;
}

export interface BookNote {
  bookHash?: SyncableBookRef;
  metaHash?: MetaHash | null;
  id: string;
  type: BookNoteType;
  target?: AnnotationTarget;
  /**
   * @deprecated Use target.kind === 'text-cfi'.cfi for new code. This remains only for
   * bounded legacy read/write compatibility with existing Foliate/text annotations.
   */
  cfi?: string;
  text?: string;
  style?: HighlightStyle;
  color?: HighlightColor;
  note: string;

  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
}

export interface BooknoteGroup {
  id: number;
  href: string;
  label: string;
  booknotes: BookNote[];
}

export type WritingMode = 'auto' | 'horizontal-tb' | 'horizontal-rl' | 'vertical-rl';

export type ReaderBookCapability = 'text' | 'page';
export type ReaderLayoutMode = 'paged' | 'continuous';
export type PageZoomMode = 'fit-page' | 'fit-width' | 'original-size' | 'custom';
export type PageSpreadMode = 'auto' | 'none';

export interface BookLayout {
  marginTopPx: number;
  marginBottomPx: number;
  marginLeftPx: number;
  marginRightPx: number;
  compactMarginTopPx: number;
  compactMarginBottomPx: number;
  compactMarginLeftPx: number;
  compactMarginRightPx: number;
  gapPercent: number;
  layoutMode: ReaderLayoutMode;
  disableClick: boolean;
  fullscreenClickArea: boolean;
  swapClickArea: boolean;
  disableDoubleClick: boolean;
  volumeKeysToFlip: boolean;
  textContinuousSections: boolean;
  maxColumnCount: number;
  maxInlineSize: number;
  maxBlockSize: number;
  writingMode: WritingMode;
  vertical: boolean;
  rtl: boolean;
  scrollingOverlap: number;
  allowScript: boolean;
}

export interface BookStyle {
  paragraphMargin: number;
  lineHeight: number;
  wordSpacing: number;
  letterSpacing: number;
  textIndent: number;
  fullJustification: boolean;
  hyphenation: boolean;
  invertImgColorInDark: boolean;
  theme: string;
  overrideFont: boolean;
  overrideLayout: boolean;
  overrideColor: boolean;
  backgroundTextureId: string;
  backgroundOpacity: number;
  backgroundSize: string;
  codeHighlighting: boolean;
  codeLanguage: string;
  userStylesheet: string;
  userUIStylesheet: string;

  // page-book specific
  pageZoomMode: PageZoomMode;
  pageZoomLevel: number;
  pageSpreadMode: PageSpreadMode;
  keepCoverSpread: boolean;
}

export interface BookFont {
  serifFont: string;
  sansSerifFont: string;
  monospaceFont: string;
  defaultFont: string;
  defaultCJKFont: string;
  defaultFontSize: number;
  minimumFontSize: number;
  fontWeight: number;
}

export type ConvertChineseVariant =
  | 'none'
  | 's2t'
  | 't2s'
  | 's2tw'
  | 's2hk'
  | 's2twp'
  | 'tw2s'
  | 'hk2s'
  | 'tw2sp';

export interface BookLanguage {
  replaceQuotationMarks: boolean;
  convertChineseVariant: ConvertChineseVariant;
}

export interface ViewConfig {
  sideBarTab: string;
  uiLanguage: string;
  sortedTOC: boolean;

  doubleBorder: boolean;
  borderColor: string;

  showHeader: boolean;
  showFooter: boolean;
  showRemainingTime: boolean;
  showRemainingPages: boolean;
  showProgressInfo: boolean;
  tapToToggleFooter: boolean;
  showBarsOnScroll: boolean;
  showMarginsOnScroll: boolean;
  progressStyle: 'percentage' | 'fraction';
  progressInfoMode: 'remaining' | 'progress' | 'all' | 'none';

  animated: boolean;
  isEink: boolean;
  isColorEink: boolean;

  readingRulerEnabled: boolean;
  readingRulerLines: number;
  readingRulerPosition: number;
  readingRulerOpacity: number;
  readingRulerColor: ReadingRulerColor;
}

export interface TTSConfig {
  ttsRate: number;
  ttsVoice: string;
  ttsLocation: string;
  showTTSBar: boolean;
  ttsHighlightOptions: TTSHighlightOptions;
}

export interface TranslatorConfig {
  translationEnabled: boolean;
  translateTargetLang: string;
  showTranslateSource: boolean;
  ttsReadAloudText: string;
}

export interface NoteExportConfig {
  includeTitle: boolean;
  includeAuthor: boolean;
  includeDate: boolean;
  includeChapterTitles: boolean;
  includeQuotes: boolean;
  includeNotes: boolean;
  includeTimestamp: boolean;
  includeChapterSeparator: boolean;
  noteSeparator: string;
  useCustomTemplate: boolean;
  customTemplate: string;
}

export interface AnnotatorConfig {
  enableAnnotationQuickActions: boolean;
  annotationQuickAction: AnnotationToolType | null;
  copyToNotebook: boolean;
  noteExportConfig: NoteExportConfig;
}

export interface ScreenConfig {
  screenOrientation: 'auto' | 'portrait' | 'landscape';
}

export type ProofreadScope = 'selection' | 'book' | 'library';

export interface ProofreadRule {
  id: string;
  scope: ProofreadScope;
  pattern: string;
  replacement: string;
  cfi?: string;
  sectionHref?: string;
  enabled: boolean;
  isRegex: boolean;
  order: number; // Lower numbers apply first
  wholeWord?: boolean; // Match whole words only (uses \b word boundaries)
  caseSensitive?: boolean; // Case-sensitive matching (default true)
  onlyForTTS?: boolean; // Only replace text for TTS, not in the book display (only for book/library scope)
}

export interface ProofreadRulesConfig {
  proofreadRules?: ProofreadRule[];
}

export interface ViewSettings
  extends
    BookLayout,
    BookStyle,
    BookFont,
    BookLanguage,
    ViewConfig,
    TTSConfig,
    TranslatorConfig,
    ScreenConfig,
    ProofreadRulesConfig,
    AnnotatorConfig {
  paragraphMode?: ParagraphModeConfig;
}

export interface BookProgress {
  location: string;
  sectionId: number;
  sectionHref: string;
  sectionLabel: string;
  section: PageInfo;
  pageinfo: PageInfo;
  timeinfo: TimeInfo;
  range: Range;
}

export interface BookSearchConfig {
  scope: 'book' | 'section';
  matchCase: boolean;
  matchWholeWords: boolean;
  matchDiacritics: boolean;
  index?: number;
  query?: string;
  acceptNode?: (node: Node) => number;

  // pre-cached search results
  results?: BookSearchResult[] | BookSearchMatch[] | null;
}

export interface SearchExcerpt {
  pre: string;
  match: string;
  post: string;
}

export interface BookSearchMatch {
  cfi: string;
  excerpt: SearchExcerpt;
}

export interface BookSearchResult {
  index?: number;
  label: string;
  subitems: BookSearchMatch[];
  progress?: number;
}

export interface BookConfig {
  bookHash?: SyncableBookRef;
  metaHash?: MetaHash | null;
  progress?: [number, number]; // [current pagenum, total pagenum], 1-based page number
  location?: string; // CFI of the current location
  xpointer?: string; // XPointer of the current location
  booknotes?: BookNote[];
  searchConfig?: Partial<BookSearchConfig>;
  viewSettings?: Partial<ViewSettings>;
  /** Keys deliberately chosen for this book, including values that equal the global setting. */
  viewSettingsOverrideKeys?: (keyof ViewSettings)[];

  updatedAt: number;
}

export interface BookDataRecord {
  id: string;
  book_hash: string;
  meta_hash?: string;
  user_id: string;
  sync_version?: number;
  updated_at: number | null;
  deleted_at: number | null;
}

export interface BooksGroup {
  id: string;
  name: string;
  displayName: string;
  books: Book[];

  updatedAt: number;
}
export interface BookContent {
  book: Book;
  file: File;
}
