import type { AppService } from '@/types/system';
import type { BookFormat } from '@/types/book';

type AnnotationSelectionMenuPlatform = Pick<
  AppService,
  'appPlatform' | 'isMobile' | 'isIOSApp' | 'isAndroidApp'
>;

type AnnotationPopupSelection =
  | {
      annotated?: boolean;
    }
  | null
  | undefined;

/**
 * Native app builds have a platform-owned text-selection action menu/bridge.
 * Mobile web browsers share the mobile form factor but must keep using the web
 * annotation popup, so this contract intentionally keys off native app
 * capability rather than broad mobile user-agent detection.
 */
export const usesNativeAnnotationSelectionMenu = (
  appService?: AnnotationSelectionMenuPlatform | null,
) => Boolean(appService?.isIOSApp || appService?.isAndroidApp);

export const usesWebAnnotationSelectionMenu = (
  appService?: AnnotationSelectionMenuPlatform | null,
) => !usesNativeAnnotationSelectionMenu(appService);

export const shouldSuppressWebAnnotationPopupForSelection = ({
  appService,
  selection,
}: {
  appService?: AnnotationSelectionMenuPlatform | null;
  selection?: AnnotationPopupSelection;
}) => usesNativeAnnotationSelectionMenu(appService) && !selection?.annotated;

export const shouldSuppressBrowserSelectionMenuForSelection = ({
  appService,
  pointerType,
}: {
  appService?: AnnotationSelectionMenuPlatform | null;
  pointerType?: string | null;
}) => {
  if (usesNativeAnnotationSelectionMenu(appService)) return false;
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
  if (usesNativeAnnotationSelectionMenu(appService)) return 'allow-native';
  if (hasDesktopNativeMenu && (pointerType == null || pointerType === 'mouse'))
    return 'allow-native';
  if (shouldSuppressBrowserSelectionMenuForSelection({ appService, pointerType })) {
    return 'suppress-browser';
  }
  return 'open-translation';
};

export const isHighlightActionDisabledForFormat = (_format?: BookFormat | null) => false;
