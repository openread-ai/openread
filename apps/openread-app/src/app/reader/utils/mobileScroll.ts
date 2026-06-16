import { isMobileWebPlatform } from '@/services/environment';
import type { AppService } from '@/types/system';

type MobilePlatformFlags = Pick<
  AppService,
  'isMobile' | 'isMobileApp' | 'isIOSApp' | 'isAndroidApp'
>;

export function shouldUseNativeChapterPull(
  appService: Pick<AppService, 'isMobileApp'> | null | undefined,
): boolean {
  return Boolean(appService?.isMobileApp);
}

export function shouldUseMobileWebTouchScroll(
  appService: MobilePlatformFlags | null | undefined,
): boolean {
  if (typeof navigator !== 'undefined' && isMobileWebPlatform()) return true;

  return Boolean(
    appService?.isMobile &&
    !appService.isMobileApp &&
    !appService.isIOSApp &&
    !appService.isAndroidApp,
  );
}
