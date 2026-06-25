import type { AppService } from '@/types/system';

export function shouldUseNativeChapterPull(
  appService: Pick<AppService, 'isMobileApp'> | null | undefined,
): boolean {
  return Boolean(appService?.isMobileApp);
}
