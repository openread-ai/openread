import type { EnvConfigType } from '@/services/environment';
import type { SystemSettings } from '@/types/settings';
import type { BookConfig, ViewSettings } from '@/types/book';
import type { FoliateView } from '@/types/view';
import type { BookDoc } from '@/libs/document';
import { getBookDirFromLanguage, getBookDirFromWritingMode } from '@/utils/book';
import { getMaxInlineSize } from '@/utils/config';
import {
  applyReaderLayoutToRenderer,
  normalizeLegacyReaderLayoutSettings,
  normalizeReaderLayout,
  type ReaderLayoutBookInput,
  type ReaderLayoutPlatformInput,
} from './readerLayoutContract';

export const CURRENT_BOOK_APPEARANCE_DEFAULT_KEYS = [
  'defaultFont',
  'defaultFontSize',
  'minimumFontSize',
  'overrideFont',
  'defaultCJKFont',
  'serifFont',
  'sansSerifFont',
  'monospaceFont',
  'fontWeight',
  'paragraphMargin',
  'lineHeight',
  'wordSpacing',
  'letterSpacing',
  'textIndent',
  'fullJustification',
  'hyphenation',
  'marginTopPx',
  'marginBottomPx',
  'marginLeftPx',
  'marginRightPx',
  'compactMarginTopPx',
  'compactMarginBottomPx',
  'compactMarginLeftPx',
  'compactMarginRightPx',
  'gapPercent',
  'layoutMode',
  'textContinuousSections',
  'maxColumnCount',
  'maxInlineSize',
  'maxBlockSize',
  'writingMode',
  'vertical',
  'rtl',
  'scrollingOverlap',
  'overrideLayout',
  'doubleBorder',
  'borderColor',
  'showHeader',
  'showFooter',
  'showRemainingTime',
  'showRemainingPages',
  'showProgressInfo',
  'tapToToggleFooter',
  'showBarsOnScroll',
  'showMarginsOnScroll',
  'progressStyle',
  'progressInfoMode',
  'screenOrientation',
  'pageZoomMode',
  'pageZoomLevel',
  'pageSpreadMode',
  'keepCoverSpread',
  'paragraphMode',
  'theme',
  'overrideColor',
  'invertImgColorInDark',
  'codeHighlighting',
  'codeLanguage',
  'backgroundTextureId',
  'backgroundOpacity',
  'backgroundSize',
  'readingRulerEnabled',
  'readingRulerLines',
  'readingRulerPosition',
  'readingRulerOpacity',
  'readingRulerColor',
  'ttsHighlightOptions',
] as const satisfies readonly (keyof ViewSettings)[];

type SaveCurrentBookConfig = (
  envConfig: EnvConfigType,
  bookKey: string,
  config: BookConfig,
  settings: SystemSettings,
) => void | Promise<void>;

type RestoreCurrentBookViewSettingsOptions = {
  envConfig: EnvConfigType;
  bookKey: string;
  config: BookConfig;
  settings: SystemSettings;
  currentViewSettings: ViewSettings;
  defaultViewSettings: ViewSettings;
  book: ReaderLayoutBookInput;
  platform: ReaderLayoutPlatformInput;
  bookDoc?: BookDoc | null;
  renderer?: FoliateView['renderer'] | null;
  setViewSettings: (bookKey: string, viewSettings: ViewSettings) => void;
  saveConfig: SaveCurrentBookConfig;
};

const applyDefaultValue = <Key extends keyof ViewSettings>(
  target: ViewSettings,
  defaults: ViewSettings,
  key: Key,
) => {
  const value = defaults[key];
  if (value !== undefined) {
    target[key] = value;
  }
};

export function buildCurrentBookDefaultViewSettings(
  currentViewSettings: ViewSettings,
  defaultViewSettings: ViewSettings,
): ViewSettings {
  const nextViewSettings = normalizeLegacyReaderLayoutSettings(currentViewSettings);

  for (const key of CURRENT_BOOK_APPEARANCE_DEFAULT_KEYS) {
    applyDefaultValue(nextViewSettings, defaultViewSettings, key);
  }

  return normalizeLegacyReaderLayoutSettings(nextViewSettings);
}

function applyWritingDirection(bookDoc: BookDoc | null | undefined, viewSettings: ViewSettings) {
  if (!bookDoc) return;

  const settingsDir = getBookDirFromWritingMode(viewSettings.writingMode);
  const languageDir = getBookDirFromLanguage(bookDoc.metadata.language);
  if (settingsDir !== 'auto') {
    bookDoc.dir = settingsDir;
  } else if (languageDir !== 'auto') {
    bookDoc.dir = languageDir;
  }
}

function applyCoverSpread(
  bookDoc: BookDoc | null | undefined,
  viewSettings: ViewSettings,
  layoutMode: 'paged' | 'continuous',
) {
  if (!bookDoc?.sections?.length || bookDoc.rendition?.layout !== 'pre-paginated') return;

  bookDoc.rendition.spread = layoutMode === 'paged' ? viewSettings.pageSpreadMode : 'none';
  const coverSide = bookDoc.dir === 'rtl' ? 'right' : 'left';
  bookDoc.sections[0]!.pageSpread = viewSettings.keepCoverSpread ? '' : coverSide;
}

export function applyCurrentBookDefaultViewSettingsToRenderer({
  renderer,
  viewSettings,
  book,
  platform,
  bookDoc,
}: {
  renderer?: FoliateView['renderer'] | null;
  viewSettings: ViewSettings;
  book: ReaderLayoutBookInput;
  platform: ReaderLayoutPlatformInput;
  bookDoc?: BookDoc | null;
}) {
  const layout = normalizeReaderLayout({ settings: viewSettings, book, platform });

  applyWritingDirection(bookDoc, viewSettings);
  applyCoverSpread(bookDoc, viewSettings, layout.layoutMode);
  applyReaderLayoutToRenderer(renderer, viewSettings, book, platform);

  if (!renderer) return;

  if (layout.bookCapability === 'page') {
    renderer.setAttribute('zoom', viewSettings.pageZoomMode);
    renderer.setAttribute(
      'spread',
      layout.layoutMode === 'paged' ? viewSettings.pageSpreadMode : 'none',
    );
    renderer.setAttribute('scale-factor', viewSettings.pageZoomLevel);
    return;
  }

  renderer.setAttribute('max-column-count', viewSettings.maxColumnCount);
  renderer.setAttribute('max-inline-size', `${getMaxInlineSize(viewSettings)}px`);
  renderer.setAttribute('max-block-size', `${viewSettings.maxBlockSize}px`);
}

export async function restoreCurrentBookViewSettings({
  envConfig,
  bookKey,
  config,
  settings,
  currentViewSettings,
  defaultViewSettings,
  book,
  platform,
  bookDoc,
  renderer,
  setViewSettings,
  saveConfig,
}: RestoreCurrentBookViewSettingsOptions): Promise<ViewSettings> {
  const nextViewSettings = buildCurrentBookDefaultViewSettings(
    currentViewSettings,
    defaultViewSettings,
  );
  const nextConfig: BookConfig = {
    ...config,
    viewSettings: nextViewSettings,
  };

  setViewSettings(bookKey, nextViewSettings);
  applyCurrentBookDefaultViewSettingsToRenderer({
    renderer,
    viewSettings: nextViewSettings,
    book,
    platform,
    bookDoc,
  });

  await saveConfig(envConfig, bookKey, nextConfig, settings);
  return nextViewSettings;
}
