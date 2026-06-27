import type { AppService } from '@/types/system';
import type { BookFormat } from '@/types/book';

type AnnotationSelectionMenuPlatform = Pick<AppService, 'isIOSApp' | 'isAndroidApp'>;

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

export const shouldSuppressWebAnnotationPopupForSelection = ({
  appService,
  selection,
}: {
  appService?: AnnotationSelectionMenuPlatform | null;
  selection?: AnnotationPopupSelection;
}) => usesNativeAnnotationSelectionMenu(appService) && !selection?.annotated;

export const isHighlightActionDisabledForFormat = (_format?: BookFormat | null) => false;
