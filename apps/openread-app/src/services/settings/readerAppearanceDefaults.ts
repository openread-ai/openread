import type { ViewSettings } from '@/types/book';
import {
  normalizeLegacyReaderLayoutSettings,
  stripLegacyReaderLayoutFields,
} from '@/app/reader/utils/readerLayoutContract';

export const READER_FONT_APPEARANCE_DEFAULT_KEYS = [
  'defaultFont',
  'defaultFontSize',
  'minimumFontSize',
  'overrideFont',
  'defaultCJKFont',
  'serifFont',
  'sansSerifFont',
  'monospaceFont',
  'fontWeight',
] as const satisfies readonly (keyof ViewSettings)[];

export const READER_LAYOUT_APPEARANCE_DEFAULT_KEYS = [
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
  'maxColumnCount',
  'maxInlineSize',
  'maxBlockSize',
  'overrideLayout',
  'doubleBorder',
  'borderColor',
  'showHeader',
  'showFooter',
  'showBarsOnScroll',
  'showMarginsOnScroll',
  'showRemainingTime',
  'showRemainingPages',
  'showProgressInfo',
  'tapToToggleFooter',
  'pageZoomLevel',
  'pageZoomMode',
  'pageSpreadMode',
  'keepCoverSpread',
] as const satisfies readonly (keyof ViewSettings)[];

export const READER_COLOR_APPEARANCE_DEFAULT_KEYS = [
  'overrideColor',
  'invertImgColorInDark',
  'codeHighlighting',
  'codeLanguage',
  'backgroundTextureId',
  'backgroundOpacity',
  'backgroundSize',
  'readingRulerEnabled',
  'readingRulerLines',
  'readingRulerOpacity',
] as const satisfies readonly (keyof ViewSettings)[];

export const READER_APPEARANCE_DEFAULT_KEYS = [
  ...READER_FONT_APPEARANCE_DEFAULT_KEYS,
  ...READER_LAYOUT_APPEARANCE_DEFAULT_KEYS,
  ...READER_COLOR_APPEARANCE_DEFAULT_KEYS,
] as const satisfies readonly (keyof ViewSettings)[];

type ViewSettingsRecord = Partial<Record<keyof ViewSettings, unknown>>;

export function restoreReaderAppearanceDefaults(
  current: ViewSettings,
  defaults: ViewSettings,
): ViewSettings {
  const next: ViewSettingsRecord = { ...current };

  for (const key of READER_APPEARANCE_DEFAULT_KEYS) {
    const defaultValue = defaults[key];
    if (defaultValue !== undefined) {
      next[key] = defaultValue;
    }
  }

  return normalizeLegacyReaderLayoutSettings(
    stripLegacyReaderLayoutFields(next as Partial<ViewSettings>),
  ) as ViewSettings;
}
