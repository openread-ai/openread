import type { EnvConfigType } from '@/services/environment';
import type { ViewSettings } from '@/types/book';
import type { FoliateView } from '@/types/view';
import { getMaxInlineSize } from '@/utils/config';
import { getStyles } from '@/utils/style';

export type ReaderBookCapability = 'text' | 'page';
export type ReaderLayoutMode = 'paged' | 'continuous';

export type PageZoomMode = 'fit-page' | 'fit-width' | 'original-size' | 'custom';
export type PageSpreadMode = 'auto' | 'none';

export type ReaderLayoutState = {
  bookCapability: ReaderBookCapability;
  layoutMode: ReaderLayoutMode;

  textContinuousSections: boolean;
  scrollingOverlap: number;

  pageZoomMode: PageZoomMode;
  pageZoomLevel: number;
  pageSpreadMode: PageSpreadMode;
  keepCoverSpread: boolean;

  paragraphModeEnabled: boolean;
};

export type ReaderLayoutBookInput = {
  isFixedLayout?: boolean;
  renditionLayout?: string;
  format?: string;
};

export type ReaderLayoutPlatformInput = {
  isMobile?: boolean;
  isEink?: boolean;
};

export type LegacyReaderLayoutSettings = Partial<ViewSettings> & {
  scrolled?: boolean;
  continuousScroll?: boolean;
  zoomMode?: PageZoomMode;
  zoomLevel?: number;
  spreadMode?: PageSpreadMode;
};

type SaveViewSettings = <K extends keyof ViewSettings>(
  envConfig: EnvConfigType,
  bookKey: string,
  key: K,
  value: ViewSettings[K],
  skipGlobal?: boolean,
  applyStyles?: boolean,
) => Promise<void>;

export type PersistReaderLayoutOptions = {
  envConfig: EnvConfigType;
  bookKey: string;
  current: ViewSettings;
  next: ViewSettings;
  book: ReaderLayoutBookInput;
  platform: ReaderLayoutPlatformInput;
  renderer?: FoliateView['renderer'] | null;
  setViewSettings: (bookKey: string, viewSettings: ViewSettings) => void;
  saveViewSettings: SaveViewSettings;
  skipGlobal?: boolean;
};

export const LEGACY_READER_LAYOUT_KEYS = [
  'scrolled',
  'continuousScroll',
  'zoomMode',
  'zoomLevel',
  'spreadMode',
] as const;

const PAGE_FORMATS = new Set(['pdf', 'cbz']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const hasOwn = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

const hasLayoutModeSetting = (value: unknown) =>
  isRecord(value) && (hasOwn(value, 'layoutMode') || hasOwn(value, 'scrolled'));

const hasTextContinuousSectionsSetting = (value: unknown) =>
  isRecord(value) && (hasOwn(value, 'textContinuousSections') || hasOwn(value, 'continuousScroll'));

export function getReaderBookCapability(input: ReaderLayoutBookInput): ReaderBookCapability {
  const format = input.format?.toLowerCase();
  if (input.isFixedLayout || input.renditionLayout === 'pre-paginated') return 'page';
  if (format && PAGE_FORMATS.has(format)) return 'page';
  return 'text';
}

export function stripLegacyReaderLayoutFields(
  settings: Partial<ViewSettings> | LegacyReaderLayoutSettings,
): Partial<ViewSettings> {
  const next = { ...(settings as Record<string, unknown>) };
  for (const key of LEGACY_READER_LAYOUT_KEYS) delete next[key];
  return next as Partial<ViewSettings>;
}

export function normalizeLegacyReaderLayoutSettings(
  settings: Partial<ViewSettings> | LegacyReaderLayoutSettings,
): ViewSettings {
  const source = (isRecord(settings) ? settings : {}) as LegacyReaderLayoutSettings;
  const canonical = stripLegacyReaderLayoutFields(settings) as Partial<ViewSettings>;

  const legacyScrolled = source.scrolled;
  const legacyContinuousScroll = source.continuousScroll;
  const legacyZoomMode = source.zoomMode;
  const legacyZoomLevel = source.zoomLevel;
  const legacySpreadMode = source.spreadMode;

  return {
    ...canonical,
    layoutMode:
      canonical.layoutMode ??
      (legacyScrolled === true ? 'continuous' : legacyScrolled === false ? 'paged' : 'paged'),
    textContinuousSections:
      canonical.textContinuousSections ??
      (typeof legacyContinuousScroll === 'boolean' ? legacyContinuousScroll : false),
    pageZoomMode:
      canonical.pageZoomMode ?? (legacyZoomMode as PageZoomMode | undefined) ?? 'fit-page',
    pageZoomLevel:
      canonical.pageZoomLevel ?? (typeof legacyZoomLevel === 'number' ? legacyZoomLevel : 100),
    pageSpreadMode:
      canonical.pageSpreadMode ?? (legacySpreadMode as PageSpreadMode | undefined) ?? 'auto',
    keepCoverSpread: canonical.keepCoverSpread ?? true,
    scrollingOverlap: canonical.scrollingOverlap ?? 0,
    paragraphMode: canonical.paragraphMode ?? { enabled: false },
  } as ViewSettings;
}

export function normalizeReaderLayout(input: {
  settings: ViewSettings | Partial<ViewSettings> | LegacyReaderLayoutSettings;
  book: ReaderLayoutBookInput;
  platform: ReaderLayoutPlatformInput;
}): ReaderLayoutState {
  const rawSettings = isRecord(input.settings) ? input.settings : {};
  const settings = normalizeLegacyReaderLayoutSettings(input.settings);
  const bookCapability = getReaderBookCapability(input.book);
  const useMobileTextDefault =
    bookCapability === 'text' && input.platform.isMobile && !hasLayoutModeSetting(input.settings);
  const layoutMode = useMobileTextDefault ? 'continuous' : (settings.layoutMode ?? 'paged');
  const pageZoomMode =
    bookCapability === 'page' &&
    layoutMode === 'continuous' &&
    !hasOwn(rawSettings, 'pageZoomMode') &&
    !hasOwn(rawSettings, 'zoomMode')
      ? 'fit-width'
      : settings.pageZoomMode;

  return {
    bookCapability,
    layoutMode,
    textContinuousSections:
      bookCapability === 'text'
        ? useMobileTextDefault && !hasTextContinuousSectionsSetting(input.settings)
          ? true
          : !!settings.textContinuousSections
        : false,
    scrollingOverlap: settings.scrollingOverlap ?? 0,
    pageZoomMode,
    pageZoomLevel: settings.pageZoomLevel ?? 100,
    pageSpreadMode: settings.pageSpreadMode ?? 'auto',
    keepCoverSpread: settings.keepCoverSpread ?? true,
    paragraphModeEnabled:
      bookCapability === 'text' && layoutMode === 'paged' && !!settings.paragraphMode?.enabled,
  };
}

export function setReaderLayoutMode(settings: ViewSettings, mode: ReaderLayoutMode): ViewSettings {
  return {
    ...normalizeLegacyReaderLayoutSettings(settings),
    layoutMode: mode,
    paragraphMode:
      mode === 'paged' ? (settings.paragraphMode ?? { enabled: false }) : { enabled: false },
  };
}

export function setParagraphMode(settings: ViewSettings, enabled: boolean): ViewSettings {
  return {
    ...normalizeLegacyReaderLayoutSettings(settings),
    layoutMode: enabled ? 'paged' : settings.layoutMode,
    textContinuousSections: enabled ? false : settings.textContinuousSections,
    paragraphMode: { ...(settings.paragraphMode ?? { enabled: false }), enabled },
  };
}

export function getRendererFlow(state: ReaderLayoutState): 'paginated' | 'scrolled' {
  return state.layoutMode === 'continuous' ? 'scrolled' : 'paginated';
}

export function canUseParagraphMode(state: ReaderLayoutState): boolean {
  return state.bookCapability === 'text' && state.layoutMode === 'paged';
}

export function canUsePageSpreadControls(state: ReaderLayoutState): boolean {
  return state.bookCapability === 'page' && state.layoutMode === 'paged';
}

export function canUseTextContinuousSectionControls(state: ReaderLayoutState): boolean {
  return state.bookCapability === 'text' && state.layoutMode === 'continuous';
}

export function canUsePageZoomControls(state: ReaderLayoutState): boolean {
  return state.bookCapability === 'page';
}

export function canUseTextLayoutControls(state: ReaderLayoutState): boolean {
  return state.bookCapability === 'text';
}

export function canUseReadingRuler(state: ReaderLayoutState): boolean {
  return state.bookCapability === 'text';
}

export function getInitialReaderViewSettings({
  globalViewSettings,
  configViewSettings,
  book,
  platform,
}: {
  globalViewSettings: ViewSettings;
  configViewSettings: Partial<ViewSettings> | LegacyReaderLayoutSettings;
  book: ReaderLayoutBookInput;
  platform: ReaderLayoutPlatformInput;
}): ViewSettings {
  const merged = normalizeLegacyReaderLayoutSettings({
    ...globalViewSettings,
    ...configViewSettings,
  });
  const rawState = normalizeReaderLayout({ settings: configViewSettings, book, platform });
  const useMobileTextDefault =
    rawState.bookCapability === 'text' &&
    platform.isMobile &&
    !hasLayoutModeSetting(configViewSettings);
  const effectiveSettings = useMobileTextDefault
    ? {
        ...merged,
        layoutMode: 'continuous' as const,
        textContinuousSections: hasTextContinuousSectionsSetting(configViewSettings)
          ? merged.textContinuousSections
          : true,
      }
    : merged;
  const fullState = normalizeReaderLayout({ settings: effectiveSettings, book, platform });
  return {
    ...effectiveSettings,
    pageZoomMode: rawState.pageZoomMode ?? fullState.pageZoomMode,
    paragraphMode: {
      ...(effectiveSettings.paragraphMode ?? { enabled: false }),
      enabled: fullState.paragraphModeEnabled,
    },
  };
}

export function applyReaderLayoutToRenderer(
  renderer: FoliateView['renderer'] | null | undefined,
  settings: ViewSettings,
  book: ReaderLayoutBookInput,
  platform: ReaderLayoutPlatformInput,
) {
  if (!renderer) return;
  const state = normalizeReaderLayout({ settings, book, platform });
  renderer.setAttribute('flow', getRendererFlow(state));
  renderer.setAttribute('max-inline-size', `${getMaxInlineSize(settings)}px`);
  renderer.setStyles?.(getStyles(settings));
}

export async function persistReaderLayout({
  envConfig,
  bookKey,
  current,
  next,
  book,
  platform,
  renderer,
  setViewSettings,
  saveViewSettings,
  skipGlobal = false,
}: PersistReaderLayoutOptions): Promise<ViewSettings> {
  const normalized = normalizeLegacyReaderLayoutSettings(next);
  const state = normalizeReaderLayout({ settings: normalized, book, platform });
  const persisted: ViewSettings = {
    ...normalized,
    paragraphMode: {
      ...(normalized.paragraphMode ?? { enabled: false }),
      enabled: state.paragraphModeEnabled,
    },
    textContinuousSections: state.textContinuousSections,
  };

  if (current.layoutMode !== persisted.layoutMode) {
    await saveViewSettings(
      envConfig,
      bookKey,
      'layoutMode',
      persisted.layoutMode,
      skipGlobal,
      false,
    );
  }
  if (current.textContinuousSections !== persisted.textContinuousSections) {
    await saveViewSettings(
      envConfig,
      bookKey,
      'textContinuousSections',
      persisted.textContinuousSections,
      skipGlobal,
      false,
    );
  }
  if (!!current.paragraphMode?.enabled !== !!persisted.paragraphMode?.enabled) {
    await saveViewSettings(
      envConfig,
      bookKey,
      'paragraphMode',
      persisted.paragraphMode,
      skipGlobal,
      false,
    );
  }

  setViewSettings(bookKey, persisted);
  applyReaderLayoutToRenderer(renderer, persisted, book, platform);
  return persisted;
}
