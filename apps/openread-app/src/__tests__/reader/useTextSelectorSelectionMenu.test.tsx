import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useTextSelector } from '@/app/reader/hooks/useTextSelector';
import type { AppService, OsPlatform } from '@/types/system';

const mocks = vi.hoisted(() => ({
  appService: null as AppService | null,
  osPlatform: 'web' as OsPlatform | 'web',
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: mocks.appService }),
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({
    getView: () => undefined,
    getViewSettings: () => undefined,
  }),
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({
    getBookDataByReaderKey: () => undefined,
  }),
}));

vi.mock('@/utils/misc', async () => ({
  ...(await vi.importActual<typeof import('@/utils/misc')>('@/utils/misc')),
  getOSPlatform: () => mocks.osPlatform,
}));

vi.mock('@/app/reader/hooks/useInstantAnnotation', () => ({
  useInstantAnnotation: () => ({
    isInstantAnnotationEnabled: () => false,
    handleInstantAnnotationPointerDown: vi.fn(),
    handleInstantAnnotationPointerMove: vi.fn(),
    handleInstantAnnotationPointerCancel: vi.fn(),
    handleInstantAnnotationPointerUp: vi.fn(),
  }),
}));

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

const renderTextSelector = (showDesktopNativeMenu?: (x: number, y: number) => void) =>
  renderHook(() =>
    useTextSelector(
      'book-key',
      vi.fn(),
      async () => 'selected text',
      vi.fn(),
      showDesktopNativeMenu,
    ),
  );

const contextMenuEvent = () => ({
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
});

describe('useTextSelector selection menu ownership', () => {
  it('allows browser-native context menus on iOS mobile web', () => {
    mocks.osPlatform = 'ios';
    mocks.appService = appService({ isMobile: true, appPlatform: 'web', osPlatform: 'ios' });
    const { result } = renderTextSelector();
    result.current.handlePointerDown(document, 0, { pointerType: 'touch' } as PointerEvent);
    const event = contextMenuEvent();

    expect(result.current.handleContextmenu(event as unknown as Event)).toBeUndefined();

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });

  it('keeps OpenRead-owned browser suppression on Android mobile web', () => {
    mocks.osPlatform = 'android';
    mocks.appService = appService({ isMobile: true, appPlatform: 'web', osPlatform: 'android' });
    const { result } = renderTextSelector();
    result.current.handlePointerDown(document, 0, { pointerType: 'touch' } as PointerEvent);
    const event = contextMenuEvent();

    expect(result.current.handleContextmenu(event as unknown as Event)).toBe(false);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
  });

  it('does not suppress native app context menus from the browser handler', () => {
    for (const nativeApp of [
      appService({ isMobile: true, isIOSApp: true, appPlatform: 'tauri', osPlatform: 'ios' }),
      appService({
        isMobile: true,
        isAndroidApp: true,
        appPlatform: 'tauri',
        osPlatform: 'android',
      }),
    ]) {
      mocks.osPlatform = nativeApp.osPlatform;
      mocks.appService = nativeApp;
      const { result } = renderTextSelector();
      result.current.handlePointerDown(document, 0, { pointerType: 'touch' } as PointerEvent);
      const event = contextMenuEvent();

      expect(result.current.handleContextmenu(event as unknown as Event)).toBeUndefined();
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(event.stopPropagation).not.toHaveBeenCalled();
    }
  });

  it('keeps desktop web and Tauri mouse context menu ownership unchanged without native menu callback', () => {
    for (const desktopApp of [
      appService({ isMobile: false, appPlatform: 'web', osPlatform: 'macos' }),
      appService({ isMobile: false, appPlatform: 'tauri', osPlatform: 'macos' }),
    ]) {
      mocks.osPlatform = desktopApp.osPlatform;
      mocks.appService = desktopApp;
      const { result } = renderTextSelector();
      result.current.handlePointerDown(document, 0, { pointerType: 'mouse' } as PointerEvent);
      const event = contextMenuEvent();

      expect(result.current.handleContextmenu(event as unknown as Event)).toBeUndefined();
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(event.stopPropagation).not.toHaveBeenCalled();
    }
  });

  it('keeps desktop Tauri mouse context menus on the native callback path', () => {
    mocks.osPlatform = 'macos';
    mocks.appService = appService({ isMobile: false, appPlatform: 'tauri', osPlatform: 'macos' });
    const showDesktopNativeMenu = vi.fn();
    const { result } = renderTextSelector(showDesktopNativeMenu);
    result.current.handlePointerDown(document, 0, { pointerType: 'mouse' } as PointerEvent);
    const event = {
      ...contextMenuEvent(),
      clientX: 5,
      clientY: 7,
      target: {
        ownerDocument: {
          defaultView: {
            frameElement: {
              getBoundingClientRect: () => ({ left: 10, top: 20 }),
            },
          },
        },
      },
    };

    expect(result.current.handleContextmenu(event as unknown as Event)).toBe(false);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(showDesktopNativeMenu).toHaveBeenCalledWith(15, 27);
  });
});
