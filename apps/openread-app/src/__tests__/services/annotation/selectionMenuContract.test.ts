import { describe, expect, it } from 'vitest';
import {
  getPdfContextMenuSelectionAction,
  isHighlightActionDisabledForFormat,
  shouldSuppressBrowserSelectionMenuForSelection,
  shouldSuppressWebAnnotationPopupForSelection,
  usesBrowserNativeAnnotationSelectionMenu,
  usesNativeAnnotationSelectionMenu,
  usesWebAnnotationSelectionMenu,
} from '@/services/annotation/selectionMenuContract';
import type { AppService } from '@/types/system';

const appService = (
  overrides: Partial<
    Pick<AppService, 'isMobile' | 'isIOSApp' | 'isAndroidApp' | 'appPlatform' | 'osPlatform'>
  >,
) =>
  ({
    isMobile: false,
    isIOSApp: false,
    isAndroidApp: false,
    appPlatform: 'web',
    osPlatform: 'macos',
    ...overrides,
  }) as AppService;

describe('annotation selection menu contract', () => {
  it('keeps OpenRead annotation ownership for Android mobile web browsers', () => {
    const androidMobileWeb = appService({
      isMobile: true,
      appPlatform: 'web',
      osPlatform: 'android',
    });

    expect(usesNativeAnnotationSelectionMenu(androidMobileWeb)).toBe(false);
    expect(usesBrowserNativeAnnotationSelectionMenu(androidMobileWeb)).toBe(false);
    expect(usesWebAnnotationSelectionMenu(androidMobileWeb)).toBe(true);
    expect(
      shouldSuppressWebAnnotationPopupForSelection({
        appService: androidMobileWeb,
        selection: { annotated: false },
      }),
    ).toBe(false);
    expect(
      shouldSuppressBrowserSelectionMenuForSelection({
        appService: androidMobileWeb,
        pointerType: 'touch',
      }),
    ).toBe(true);
  });

  it('uses browser-native ownership for new selections in iOS mobile web browsers', () => {
    const iosMobileWeb = appService({ isMobile: true, appPlatform: 'web', osPlatform: 'ios' });

    expect(usesNativeAnnotationSelectionMenu(iosMobileWeb)).toBe(false);
    expect(usesBrowserNativeAnnotationSelectionMenu(iosMobileWeb)).toBe(true);
    expect(usesWebAnnotationSelectionMenu(iosMobileWeb)).toBe(false);
    expect(
      shouldSuppressWebAnnotationPopupForSelection({
        appService: iosMobileWeb,
        selection: { annotated: false },
      }),
    ).toBe(true);
    expect(
      shouldSuppressBrowserSelectionMenuForSelection({
        appService: iosMobileWeb,
        pointerType: 'touch',
      }),
    ).toBe(false);
  });

  it('suppresses the web annotation popup for new selections in native iOS and Android apps', () => {
    const nativeIOS = appService({ isMobile: true, isIOSApp: true, appPlatform: 'tauri' });
    const nativeAndroid = appService({ isMobile: true, isAndroidApp: true, appPlatform: 'tauri' });

    expect(usesNativeAnnotationSelectionMenu(nativeIOS)).toBe(true);
    expect(usesNativeAnnotationSelectionMenu(nativeAndroid)).toBe(true);
    expect(
      shouldSuppressWebAnnotationPopupForSelection({
        appService: nativeIOS,
        selection: { annotated: false },
      }),
    ).toBe(true);
    expect(
      shouldSuppressWebAnnotationPopupForSelection({
        appService: nativeAndroid,
        selection: { annotated: false },
      }),
    ).toBe(true);
  });

  it('does not suppress native app selection menus through browser context handling', () => {
    const nativeIOS = appService({ isMobile: true, isIOSApp: true, appPlatform: 'tauri' });
    const nativeAndroid = appService({ isMobile: true, isAndroidApp: true, appPlatform: 'tauri' });

    expect(
      shouldSuppressBrowserSelectionMenuForSelection({
        appService: nativeIOS,
        pointerType: 'touch',
      }),
    ).toBe(false);
    expect(
      shouldSuppressBrowserSelectionMenuForSelection({
        appService: nativeAndroid,
        pointerType: 'touch',
      }),
    ).toBe(false);
  });

  it('keeps existing native-owned annotations editable through the web popup path', () => {
    const nativeIOS = appService({
      isMobile: true,
      isIOSApp: true,
      appPlatform: 'tauri',
      osPlatform: 'ios',
    });
    const iosMobileWeb = appService({ isMobile: true, appPlatform: 'web', osPlatform: 'ios' });

    expect(
      shouldSuppressWebAnnotationPopupForSelection({
        appService: nativeIOS,
        selection: { annotated: true },
      }),
    ).toBe(false);
    expect(
      shouldSuppressWebAnnotationPopupForSelection({
        appService: iosMobileWeb,
        selection: { annotated: true },
      }),
    ).toBe(false);
  });

  it('keeps desktop touch and pen context menus suppressed without taking desktop mouse ownership', () => {
    const desktopWeb = appService({ isMobile: false, appPlatform: 'web' });

    expect(
      shouldSuppressBrowserSelectionMenuForSelection({
        appService: desktopWeb,
        pointerType: 'touch',
      }),
    ).toBe(true);
    expect(
      shouldSuppressBrowserSelectionMenuForSelection({
        appService: desktopWeb,
        pointerType: 'pen',
      }),
    ).toBe(true);
    expect(
      shouldSuppressBrowserSelectionMenuForSelection({
        appService: desktopWeb,
        pointerType: 'mouse',
      }),
    ).toBe(false);
  });

  it('routes PDF contextmenu ownership through the shared platform contract', () => {
    const androidMobileWeb = appService({
      isMobile: true,
      appPlatform: 'web',
      osPlatform: 'android',
    });
    const iosMobileWeb = appService({ isMobile: true, appPlatform: 'web', osPlatform: 'ios' });
    const nativeIOS = appService({
      isMobile: true,
      isIOSApp: true,
      appPlatform: 'tauri',
      osPlatform: 'ios',
    });
    const desktopWeb = appService({ isMobile: false, appPlatform: 'web' });
    const desktopTauri = appService({ isMobile: false, appPlatform: 'tauri' });

    expect(
      getPdfContextMenuSelectionAction({ appService: androidMobileWeb, pointerType: 'touch' }),
    ).toBe('suppress-browser');
    expect(
      getPdfContextMenuSelectionAction({ appService: iosMobileWeb, pointerType: 'touch' }),
    ).toBe('allow-native');
    expect(getPdfContextMenuSelectionAction({ appService: nativeIOS, pointerType: 'touch' })).toBe(
      'allow-native',
    );
    expect(getPdfContextMenuSelectionAction({ appService: desktopWeb, pointerType: 'mouse' })).toBe(
      'open-translation',
    );
    expect(
      getPdfContextMenuSelectionAction({
        appService: desktopTauri,
        pointerType: 'mouse',
        hasDesktopNativeMenu: true,
      }),
    ).toBe('allow-native');
  });

  it('allows Highlight across canonical target-backed formats', () => {
    expect(isHighlightActionDisabledForFormat('pdf')).toBe(false);
    expect(isHighlightActionDisabledForFormat('epub')).toBe(false);
    expect(isHighlightActionDisabledForFormat('txt')).toBe(false);
    expect(isHighlightActionDisabledForFormat('cbz')).toBe(false);
  });
});
