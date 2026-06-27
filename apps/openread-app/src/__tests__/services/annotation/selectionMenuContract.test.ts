import { describe, expect, it } from 'vitest';
import {
  isHighlightActionDisabledForFormat,
  shouldSuppressWebAnnotationPopupForSelection,
  usesNativeAnnotationSelectionMenu,
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
  it('does not suppress the web annotation popup for mobile web browsers', () => {
    const mobileWeb = appService({ isMobile: true, appPlatform: 'web' });

    expect(usesNativeAnnotationSelectionMenu(mobileWeb)).toBe(false);
    expect(
      shouldSuppressWebAnnotationPopupForSelection({
        appService: mobileWeb,
        selection: { annotated: false },
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

  it('keeps existing native annotations editable through the web popup path', () => {
    const nativeIOS = appService({ isMobile: true, isIOSApp: true, appPlatform: 'tauri' });

    expect(
      shouldSuppressWebAnnotationPopupForSelection({
        appService: nativeIOS,
        selection: { annotated: true },
      }),
    ).toBe(false);
  });

  it('preserves the existing PDF highlight disable guard', () => {
    expect(isHighlightActionDisabledForFormat('pdf')).toBe(true);
    expect(isHighlightActionDisabledForFormat('epub')).toBe(false);
    expect(isHighlightActionDisabledForFormat('txt')).toBe(false);
  });
});
