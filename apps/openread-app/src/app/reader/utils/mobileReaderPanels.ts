import type { AppService } from '@/types/system';

export type MobileReaderPanelDestination =
  | 'toc'
  | 'highlights'
  | 'bookmarks'
  | 'ai-chat-history'
  | 'settings';

export type MobileAIChatInitialView = 'active' | 'history';

export type MobileWebKebabDestination = Exclude<MobileReaderPanelDestination, 'settings'>;

export const isMobileWebReader = (
  appService: Pick<AppService, 'isMobile' | 'isIOSApp' | 'isAndroidApp'> | null | undefined,
) => !!appService?.isMobile && !appService.isIOSApp && !appService.isAndroidApp;

export const mobileReaderDestinationToFooterTab = (
  destination: MobileReaderPanelDestination | null,
) => {
  if (!destination) return null;
  if (destination === 'ai-chat-history') return 'chat';
  if (destination === 'highlights' || destination === 'bookmarks') return 'toc';
  return destination;
};
