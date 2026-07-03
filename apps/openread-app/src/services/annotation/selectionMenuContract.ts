import type { AppService } from '@/types/system';
import type { BookFormat } from '@/types/book';

type AnnotationSelectionMenuPlatform = Pick<
  AppService,
  'appPlatform' | 'osPlatform' | 'isMobile' | 'isIOSApp' | 'isAndroidApp'
>;

type AnnotationPopupSelection =
  | {
      annotated?: boolean;
    }
  | null
  | undefined;

export type AnnotationSelectionActionSurface = 'native-menu' | 'web-popup' | 'web-actions-sheet';

/**
 * Native app builds have a platform-owned text-selection action menu/bridge.
 * iOS/iPadOS mobile web keeps browser-native selection ownership because Safari
 * callout suppression is not reliable while preserving selectable reader text.
 * Android mobile web remains OpenRead-owned, and desktop web/Tauri keep the
 * existing web/desktop context-menu paths.
 */
export const usesNativeAnnotationSelectionMenu = (
  appService?: AnnotationSelectionMenuPlatform | null,
) => Boolean(appService?.isIOSApp || appService?.isAndroidApp);

export const usesBrowserNativeAnnotationSelectionMenu = (
  appService?: AnnotationSelectionMenuPlatform | null,
) =>
  Boolean(
    appService?.appPlatform === 'web' && appService.isMobile && appService.osPlatform === 'ios',
  );

export const usesWebAnnotationSelectionMenu = (
  appService?: AnnotationSelectionMenuPlatform | null,
) =>
  !usesNativeAnnotationSelectionMenu(appService) &&
  !usesBrowserNativeAnnotationSelectionMenu(appService);

export const getAnnotationSelectionActionSurface = ({
  appService,
  selection,
}: {
  appService?: AnnotationSelectionMenuPlatform | null;
  selection?: AnnotationPopupSelection;
}): AnnotationSelectionActionSurface => {
  if (selection?.annotated) return 'web-popup';
  if (usesNativeAnnotationSelectionMenu(appService)) return 'native-menu';
  if (usesBrowserNativeAnnotationSelectionMenu(appService)) return 'web-actions-sheet';
  return 'web-popup';
};

export const shouldSuppressWebAnnotationPopupForSelection = ({
  appService,
  selection,
}: {
  appService?: AnnotationSelectionMenuPlatform | null;
  selection?: AnnotationPopupSelection;
}) => getAnnotationSelectionActionSurface({ appService, selection }) !== 'web-popup';

export const shouldShowWebAnnotationActionsSheetForSelection = ({
  appService,
  selection,
}: {
  appService?: AnnotationSelectionMenuPlatform | null;
  selection?: AnnotationPopupSelection;
}) => getAnnotationSelectionActionSurface({ appService, selection }) === 'web-actions-sheet';

export const shouldSuppressBrowserSelectionMenuForSelection = ({
  appService,
  pointerType,
}: {
  appService?: AnnotationSelectionMenuPlatform | null;
  pointerType?: string | null;
}) => {
  if (
    usesNativeAnnotationSelectionMenu(appService) ||
    usesBrowserNativeAnnotationSelectionMenu(appService)
  ) {
    return false;
  }
  if (appService?.appPlatform === 'web' && appService.isMobile) return true;
  return pointerType === 'touch' || pointerType === 'pen';
};

export type PdfContextMenuSelectionAction =
  | 'allow-native'
  | 'suppress-browser'
  | 'open-translation';

export const getPdfContextMenuSelectionAction = ({
  appService,
  pointerType,
  hasDesktopNativeMenu,
}: {
  appService?: AnnotationSelectionMenuPlatform | null;
  pointerType?: string | null;
  hasDesktopNativeMenu?: boolean;
}): PdfContextMenuSelectionAction => {
  if (
    usesNativeAnnotationSelectionMenu(appService) ||
    usesBrowserNativeAnnotationSelectionMenu(appService)
  ) {
    return 'allow-native';
  }
  if (hasDesktopNativeMenu && (pointerType == null || pointerType === 'mouse'))
    return 'allow-native';
  if (shouldSuppressBrowserSelectionMenuForSelection({ appService, pointerType })) {
    return 'suppress-browser';
  }
  return 'open-translation';
};

export const isHighlightActionDisabledForFormat = (_format?: BookFormat | null) => false;
