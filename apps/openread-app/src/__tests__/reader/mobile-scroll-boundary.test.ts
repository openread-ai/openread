import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTouchEvent } from '@/app/reader/hooks/useIframeEvents';
import { handleTouchEnd } from '@/app/reader/utils/iframeEventHandlers';
import {
  shouldUseMobileWebTouchScroll,
  shouldUseNativeChapterPull,
} from '@/app/reader/utils/mobileScroll';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';

const envMock = vi.hoisted(() => ({
  appService: null as {
    isMobile: boolean;
    isMobileApp: boolean;
    isIOSApp: boolean;
    isAndroidApp: boolean;
  } | null,
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: envMock.appService }),
}));

describe('mobile reader scroll boundaries', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    envMock.appService = null;
  });

  it('relays changedTouches on touchend so mobile web boundary swipes keep their final delta', () => {
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => {});

    handleTouchEnd('book-key', {
      targetTouches: [],
      changedTouches: [
        {
          clientX: 12,
          clientY: 34,
          screenX: 56,
          screenY: 78,
        },
      ],
    } as unknown as TouchEvent);

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'iframe-touchend',
        bookKey: 'book-key',
        targetTouches: [],
        changedTouches: [
          expect.objectContaining({
            clientX: 12,
            clientY: 34,
            screenX: 56,
            screenY: 78,
          }),
        ],
      }),
      '*',
    );
  });

  it('does not treat a no-move tap as a swipe or continuous-scroll boundary event', () => {
    const handlePageFlip = vi.fn();
    const handleContinuousScroll = vi.fn();
    const { result } = renderHook(() =>
      useTouchEvent('book-key', handlePageFlip, handleContinuousScroll),
    );
    const touch = { clientX: 12, clientY: 34, screenX: 56, screenY: 78 };

    result.current.onTouchStart({ targetTouches: [touch], timeStamp: 1 } as never);
    result.current.onTouchEnd({
      targetTouches: [],
      changedTouches: [touch],
      timeStamp: 2,
    } as never);

    expect(handlePageFlip).not.toHaveBeenCalled();
    expect(handleContinuousScroll).not.toHaveBeenCalled();
  });

  it('manually advances the parent scrolled renderer for mobile web iframe touch moves', () => {
    envMock.appService = {
      isMobile: true,
      isMobileApp: false,
      isIOSApp: false,
      isAndroidApp: false,
    };
    const scrollContainer = document.createElement('div');
    scrollContainer.id = 'container';
    const renderer = document.createElement('div');
    renderer.attachShadow({ mode: 'open' }).append(scrollContainer);

    vi.spyOn(useReaderStore.getState(), 'getView').mockReturnValue({ renderer } as never);
    vi.spyOn(useReaderStore.getState(), 'getViewSettings').mockReturnValue({
      layoutMode: 'continuous',
      textContinuousSections: true,
      vertical: false,
    } as never);
    vi.spyOn(useBookDataStore.getState(), 'getBookData').mockReturnValue({
      isFixedLayout: false,
    } as never);

    const handlePageFlip = vi.fn();
    const handleContinuousScroll = vi.fn();
    const { result } = renderHook(() =>
      useTouchEvent('book-key', handlePageFlip, handleContinuousScroll),
    );

    result.current.onTouchStart({
      targetTouches: [{ clientX: 100, clientY: 200, screenX: 100, screenY: 200 }],
      timeStamp: 1,
    } as never);
    result.current.onTouchMove({
      targetTouches: [{ clientX: 100, clientY: 150, screenX: 100, screenY: 150 }],
      timeStamp: 2,
    } as never);
    result.current.onTouchEnd({
      targetTouches: [],
      changedTouches: [{ clientX: 100, clientY: 150, screenX: 100, screenY: 150 }],
      timeStamp: 3,
    } as never);

    expect(scrollContainer.scrollTop).toBe(50);
    expect(handleContinuousScroll).toHaveBeenCalledWith('touch', -50, 30);
  });

  it('keeps fixed-layout mobile swipes on the page-flip path', () => {
    envMock.appService = {
      isMobile: true,
      isMobileApp: false,
      isIOSApp: false,
      isAndroidApp: false,
    };
    vi.spyOn(useReaderStore.getState(), 'getViewSettings').mockReturnValue({
      layoutMode: 'paged',
      textContinuousSections: false,
      vertical: false,
      pageZoomLevel: 100,
    } as never);
    vi.spyOn(useBookDataStore.getState(), 'getBookData').mockReturnValue({
      isFixedLayout: true,
    } as never);

    const handlePageFlip = vi.fn();
    const handleContinuousScroll = vi.fn();
    const { result } = renderHook(() =>
      useTouchEvent('book-key', handlePageFlip, handleContinuousScroll),
    );

    result.current.onTouchStart({
      targetTouches: [{ clientX: 220, clientY: 200, screenX: 220, screenY: 200 }],
      timeStamp: 1,
    } as never);
    result.current.onTouchMove({
      targetTouches: [{ clientX: 120, clientY: 205, screenX: 120, screenY: 205 }],
      timeStamp: 2,
    } as never);
    result.current.onTouchEnd({
      targetTouches: [],
      changedTouches: [{ clientX: 120, clientY: 205, screenX: 120, screenY: 205 }],
      timeStamp: 103,
    } as never);

    expect(handlePageFlip).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'touch-swipe',
        detail: expect.objectContaining({ deltaX: -100, deltaY: 5 }),
      }),
    );
    expect(handleContinuousScroll).toHaveBeenCalledWith('touch', 5, 30);
  });

  it('keeps native pull-to-load disabled for mobile web scroll mode', () => {
    expect(shouldUseNativeChapterPull({ isMobileApp: false })).toBe(false);
    expect(shouldUseNativeChapterPull({ isMobileApp: true })).toBe(true);
    expect(shouldUseNativeChapterPull(null)).toBe(false);
    expect(
      shouldUseMobileWebTouchScroll({
        isMobile: true,
        isMobileApp: false,
        isIOSApp: false,
        isAndroidApp: false,
      }),
    ).toBe(true);
    expect(
      shouldUseMobileWebTouchScroll({
        isMobile: true,
        isMobileApp: true,
        isIOSApp: true,
        isAndroidApp: false,
      }),
    ).toBe(false);
  });
});
