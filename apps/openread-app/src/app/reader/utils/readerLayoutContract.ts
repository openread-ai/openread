import type { EnvConfigType } from '@/services/environment';
import type { ViewSettings } from '@/types/book';
import type { Insets } from '@/types/misc';
import type { FoliateView } from '@/types/view';
import { getMaxInlineSize } from '@/utils/config';
import { getViewInsets } from '@/utils/insets';
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
  isIOSApp?: boolean;
  isAndroidApp?: boolean;
  isEink?: boolean;
};

export type ReaderChromeVisibility = {
  showHeader: boolean;
  showFooter: boolean;
};

export type ReaderViewportStyles = {
  backgroundColor?: string;
};

export const MOBILE_WEB_PAGE_VIEWPORT_BACKGROUND = '#ffffff';

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

export function hasLegacyReaderLayoutFields(settings: unknown): boolean {
  return isRecord(settings) && LEGACY_READER_LAYOUT_KEYS.some((key) => hasOwn(settings, key));
}

export function stripLegacyReaderLayoutFields(
  settings: Partial<ViewSettings> | LegacyReaderLayoutSettings,
): Partial<ViewSettings> {
  const next = { ...(settings as Record<string, unknown>) };
  for (const key of LEGACY_READER_LAYOUT_KEYS) delete next[key];
  return next as Partial<ViewSettings>;
}

export function migrateLegacyReaderLayoutSettings(
  settings: Partial<ViewSettings> | LegacyReaderLayoutSettings,
): Partial<ViewSettings> {
  const source = (isRecord(settings) ? settings : {}) as LegacyReaderLayoutSettings;
  const canonical = stripLegacyReaderLayoutFields(settings) as Partial<ViewSettings>;
  const migrated: Partial<ViewSettings> = { ...canonical };

  if (migrated.layoutMode === undefined && typeof source.scrolled === 'boolean') {
    migrated.layoutMode = source.scrolled ? 'continuous' : 'paged';
  }
  if (
    migrated.textContinuousSections === undefined &&
    typeof source.continuousScroll === 'boolean'
  ) {
    migrated.textContinuousSections = source.continuousScroll;
  }
  if (migrated.pageZoomMode === undefined && source.zoomMode) {
    migrated.pageZoomMode = source.zoomMode;
  }
  if (migrated.pageZoomLevel === undefined && typeof source.zoomLevel === 'number') {
    migrated.pageZoomLevel = source.zoomLevel;
  }
  if (migrated.pageSpreadMode === undefined && source.spreadMode) {
    migrated.pageSpreadMode = source.spreadMode;
  }

  return migrated;
}

export function mergeViewSettingsWithLegacyLayout(
  ...sources: Array<Partial<ViewSettings> | LegacyReaderLayoutSettings | null | undefined>
): ViewSettings {
  const merged = sources.reduce<Partial<ViewSettings>>(
    (acc, source) => ({
      ...acc,
      ...migrateLegacyReaderLayoutSettings(source ?? {}),
    }),
    {} as Partial<ViewSettings>,
  );
  return normalizeLegacyReaderLayoutSettings(merged);
}

export function normalizeLegacyReaderLayoutSettings(
  settings: Partial<ViewSettings> | LegacyReaderLayoutSettings,
): ViewSettings {
  const migrated = migrateLegacyReaderLayoutSettings(settings);

  return {
    ...migrated,
    layoutMode: migrated.layoutMode ?? 'paged',
    textContinuousSections: migrated.textContinuousSections ?? false,
    pageZoomMode: migrated.pageZoomMode ?? 'fit-page',
    pageZoomLevel: migrated.pageZoomLevel ?? 100,
    pageSpreadMode: migrated.pageSpreadMode ?? 'auto',
    keepCoverSpread: migrated.keepCoverSpread ?? true,
    scrollingOverlap: migrated.scrollingOverlap ?? 0,
    paragraphMode: migrated.paragraphMode ?? { enabled: false },
  } as ViewSettings;
}

const isMobileWebReaderPlatform = (platform: ReaderLayoutPlatformInput) =>
  !!platform.isMobile && !platform.isIOSApp && !platform.isAndroidApp;

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

export function getEffectiveReaderChromeVisibility(input: {
  settings: ViewSettings | Partial<ViewSettings> | LegacyReaderLayoutSettings;
  book: ReaderLayoutBookInput;
  platform: ReaderLayoutPlatformInput;
}): ReaderChromeVisibility {
  const settings = normalizeLegacyReaderLayoutSettings(input.settings);
  const state = normalizeReaderLayout(input);
  const suppressLegacyChrome =
    state.bookCapability === 'page' && isMobileWebReaderPlatform(input.platform);

  return {
    showHeader: suppressLegacyChrome ? false : !!settings.showHeader,
    showFooter: suppressLegacyChrome ? false : !!settings.showFooter,
  };
}

export function getEffectiveReaderViewInsets(input: {
  settings: ViewSettings | Partial<ViewSettings> | LegacyReaderLayoutSettings;
  book: ReaderLayoutBookInput;
  platform: ReaderLayoutPlatformInput;
}): Insets {
  const settings = normalizeLegacyReaderLayoutSettings(input.settings);
  const state = normalizeReaderLayout(input);
  const effectiveChrome = getEffectiveReaderChromeVisibility(input);
  const insets = getViewInsets({ ...settings, ...effectiveChrome } as ViewSettings);

  if (state.bookCapability === 'page' && isMobileWebReaderPlatform(input.platform)) {
    return { ...insets, top: 0, bottom: 0 };
  }

  return insets;
}

export function getEffectiveReaderViewportStyles(input: {
  settings: ViewSettings | Partial<ViewSettings> | LegacyReaderLayoutSettings;
  book: ReaderLayoutBookInput;
  platform: ReaderLayoutPlatformInput;
}): ReaderViewportStyles {
  const state = normalizeReaderLayout(input);

  if (state.bookCapability === 'page' && isMobileWebReaderPlatform(input.platform)) {
    return { backgroundColor: MOBILE_WEB_PAGE_VIEWPORT_BACKGROUND };
  }

  return {};
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
  const merged = mergeViewSettingsWithLegacyLayout(globalViewSettings, configViewSettings);
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
