import { describe, expect, it } from 'vitest';
import {
  getPdfContextMenuSelectionAction,
  isHighlightActionDisabledForFormat,
  shouldSuppressBrowserSelectionMenuForSelection,
  shouldSuppressWebAnnotationPopupForSelection,
  usesNativeAnnotationSelectionMenu,
  usesWebAnnotationSelectionMenu,
} from '@/services/annotation/selectionMenuContract';
import type { AppService } from '@/types/system';

const appService = (
  overrides: Partial<Pick<AppService, 'isMobile' | 'isIOSApp' | 'isAndroidApp' | 'appPlatform'>>,
) =>
  ({
    isMobile: false,
    isIOSApp: false,
    isAndroidApp: false,
    appPlatform: 'web',
    ...overrides,
  }) as AppService;

describe('annotation selection menu contract', () => {
  it('keeps web annotation ownership for mobile web browsers', () => {
    const mobileWeb = appService({ isMobile: true, appPlatform: 'web' });

    expect(usesNativeAnnotationSelectionMenu(mobileWeb)).toBe(false);
    expect(usesWebAnnotationSelectionMenu(mobileWeb)).toBe(true);
    expect(
      shouldSuppressWebAnnotationPopupForSelection({
        appService: mobileWeb,
        selection: { annotated: false },
      }),
    ).toBe(false);
    expect(
      shouldSuppressBrowserSelectionMenuForSelection({
        appService: mobileWeb,
        pointerType: 'touch',
      }),
    ).toBe(true);
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

  it('keeps existing native annotations editable through the web popup path', () => {
    const nativeIOS = appService({ isMobile: true, isIOSApp: true, appPlatform: 'tauri' });

    expect(
      shouldSuppressWebAnnotationPopupForSelection({
        appService: nativeIOS,
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
    const mobileWeb = appService({ isMobile: true, appPlatform: 'web' });
    const nativeIOS = appService({ isMobile: true, isIOSApp: true, appPlatform: 'tauri' });
    const desktopWeb = appService({ isMobile: false, appPlatform: 'web' });
    const desktopTauri = appService({ isMobile: false, appPlatform: 'tauri' });

    expect(getPdfContextMenuSelectionAction({ appService: mobileWeb, pointerType: 'touch' })).toBe(
      'suppress-browser',
    );
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
