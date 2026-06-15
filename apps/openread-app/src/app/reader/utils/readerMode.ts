import type { ViewSettings } from '@/types/book';
import type { FoliateView } from '@/types/view';
import type { EnvConfigType } from '@/services/environment';
import { getMaxInlineSize } from '@/utils/config';
import { getStyles } from '@/utils/style';

export type ReaderModeKind = 'fixed-layout' | 'paged' | 'scrolled';

export interface ReaderModePlatform {
  isMobile?: boolean;
}

export interface ReaderModeBook {
  isFixedLayout?: boolean;
  renditionLayout?: string;
}

export interface ReaderModeContext {
  platform?: ReaderModePlatform | null;
  book?: ReaderModeBook | null;
}

export interface ReaderModeState {
  mode: ReaderModeKind;
  scrolled: boolean;
  continuousScroll: boolean;
  paragraphMode: boolean;
}

type SaveViewSettings = <K extends keyof ViewSettings>(
  envConfig: EnvConfigType,
  bookKey: string,
  key: K,
  value: ViewSettings[K],
  skipGlobal?: boolean,
  applyStyles?: boolean,
) => Promise<void>;

export interface PersistReaderModeOptions {
  envConfig: EnvConfigType;
  bookKey: string;
  current: ViewSettings;
  next: ViewSettings;
  context: ReaderModeContext;
  renderer?: FoliateView['renderer'] | null;
  setViewSettings: (bookKey: string, viewSettings: ViewSettings) => void;
  saveViewSettings: SaveViewSettings;
  skipGlobal?: boolean;
}

export interface InitialReaderViewSettingsOptions {
  globalViewSettings: ViewSettings;
  configViewSettings: Partial<ViewSettings>;
  context: ReaderModeContext;
}

const isFixedLayoutBook = (context: ReaderModeContext) =>
  !!context.book?.isFixedLayout || context.book?.renditionLayout === 'pre-paginated';

const isMobilePlatform = (context: ReaderModeContext) => !!context.platform?.isMobile;

const withParagraphEnabled = (viewSettings: ViewSettings, enabled: boolean): ViewSettings => ({
  ...viewSettings,
  paragraphMode: {
    ...(viewSettings.paragraphMode ?? { enabled: false }),
    enabled,
  },
});

export const canUsePagedMode = (context: ReaderModeContext) =>
  !isFixedLayoutBook(context) && !isMobilePlatform(context);

export const canUseScrolledMode = (context: ReaderModeContext) =>
  !isFixedLayoutBook(context) && !isMobilePlatform(context);

export const canUseContinuousScroll = (viewSettings: ViewSettings, context: ReaderModeContext) =>
  !isFixedLayoutBook(context) && (isMobilePlatform(context) || !!viewSettings.scrolled);

export const canUseParagraphMode = (viewSettings: ViewSettings, context: ReaderModeContext) =>
  !isFixedLayoutBook(context) && !isMobilePlatform(context) && !viewSettings.scrolled;

export const normalizeReaderMode = (
  viewSettings: ViewSettings,
  context: ReaderModeContext,
): ViewSettings => {
  let next: ViewSettings = {
    ...viewSettings,
    paragraphMode: { ...(viewSettings.paragraphMode ?? { enabled: false }) },
  };

  if (isFixedLayoutBook(context)) {
    return withParagraphEnabled({ ...next, scrolled: false, continuousScroll: false }, false);
  }

  if (isMobilePlatform(context)) {
    return withParagraphEnabled({ ...next, scrolled: true, continuousScroll: true }, false);
  }

  if (next.paragraphMode?.enabled) {
    next = { ...next, scrolled: false, continuousScroll: false };
  }

  if (next.continuousScroll) {
    next = withParagraphEnabled({ ...next, scrolled: true }, false);
  }

  if (next.scrolled) {
    next = withParagraphEnabled(next, false);
  } else {
    next = { ...next, continuousScroll: false };
  }

  return next;
};

export const getInitialReaderViewSettings = ({
  globalViewSettings,
  configViewSettings,
  context,
}: InitialReaderViewSettingsOptions): ViewSettings =>
  normalizeReaderMode({ ...globalViewSettings, ...configViewSettings }, context);

export const getReaderMode = (
  viewSettings: ViewSettings,
  context: ReaderModeContext,
): ReaderModeState => {
  const normalized = normalizeReaderMode(viewSettings, context);
  return {
    mode: isFixedLayoutBook(context) ? 'fixed-layout' : normalized.scrolled ? 'scrolled' : 'paged',
    scrolled: !!normalized.scrolled,
    continuousScroll: !!normalized.continuousScroll,
    paragraphMode: !!normalized.paragraphMode?.enabled,
  };
};

export const setPagedMode = (viewSettings: ViewSettings, context: ReaderModeContext) =>
  normalizeReaderMode(
    withParagraphEnabled({ ...viewSettings, scrolled: false, continuousScroll: false }, false),
    context,
  );

export const setScrolledMode = (
  viewSettings: ViewSettings,
  context: ReaderModeContext,
  enabled: boolean,
) =>
  normalizeReaderMode(
    withParagraphEnabled(
      {
        ...viewSettings,
        scrolled: enabled,
        continuousScroll: enabled ? viewSettings.continuousScroll : false,
      },
      false,
    ),
    context,
  );

export const setContinuousScroll = (
  viewSettings: ViewSettings,
  context: ReaderModeContext,
  enabled: boolean,
) =>
  normalizeReaderMode(
    withParagraphEnabled(
      {
        ...viewSettings,
        scrolled: enabled ? true : viewSettings.scrolled,
        continuousScroll: enabled,
      },
      false,
    ),
    context,
  );

export const setParagraphMode = (
  viewSettings: ViewSettings,
  context: ReaderModeContext,
  enabled: boolean,
) =>
  normalizeReaderMode(
    withParagraphEnabled(
      {
        ...viewSettings,
        scrolled: enabled ? false : viewSettings.scrolled,
        continuousScroll: enabled ? false : viewSettings.continuousScroll,
      },
      enabled,
    ),
    context,
  );

export const applyReaderModeToRenderer = (
  renderer: FoliateView['renderer'] | null | undefined,
  viewSettings: ViewSettings,
  context: ReaderModeContext,
) => {
  if (!renderer) return;
  const normalized = normalizeReaderMode(viewSettings, context);
  renderer.setAttribute('flow', normalized.scrolled ? 'scrolled' : 'paginated');
  renderer.setAttribute('max-inline-size', `${getMaxInlineSize(normalized)}px`);
  renderer.setStyles?.(getStyles(normalized));
};

export const persistReaderMode = async ({
  envConfig,
  bookKey,
  current,
  next,
  context,
  renderer,
  setViewSettings,
  saveViewSettings,
  skipGlobal = false,
}: PersistReaderModeOptions) => {
  const normalized = normalizeReaderMode(next, context);
  const currentParagraphEnabled = !!current.paragraphMode?.enabled;
  const nextParagraphMode = normalized.paragraphMode ?? { enabled: false };

  if (current.scrolled !== normalized.scrolled) {
    await saveViewSettings(envConfig, bookKey, 'scrolled', normalized.scrolled, skipGlobal, false);
  }
  if (current.continuousScroll !== normalized.continuousScroll) {
    await saveViewSettings(
      envConfig,
      bookKey,
      'continuousScroll',
      normalized.continuousScroll,
      skipGlobal,
      false,
    );
  }
  if (currentParagraphEnabled !== !!nextParagraphMode.enabled) {
    await saveViewSettings(
      envConfig,
      bookKey,
      'paragraphMode',
      nextParagraphMode,
      skipGlobal,
      false,
    );
  }

  setViewSettings(bookKey, normalized);
  applyReaderModeToRenderer(renderer, normalized, context);

  return normalized;
};
