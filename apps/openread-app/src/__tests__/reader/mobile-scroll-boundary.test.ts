import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTouchEvent } from '@/app/reader/hooks/useIframeEvents';
import { handleTouchEnd } from '@/app/reader/utils/iframeEventHandlers';
import { shouldUseNativeChapterPull } from '@/app/reader/utils/mobileScroll';
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

  it('does not treat a no-move tap as a swipe', () => {
    const handlePageFlip = vi.fn();
    const { result } = renderHook(() => useTouchEvent('book-key', handlePageFlip));
    const touch = { clientX: 12, clientY: 34, screenX: 56, screenY: 78 };

    result.current.onTouchStart({ targetTouches: [touch], timeStamp: 1 } as never);
    result.current.onTouchEnd({
      targetTouches: [],
      changedTouches: [touch],
      timeStamp: 2,
    } as never);

    expect(handlePageFlip).not.toHaveBeenCalled();
  });

  it('does not manually mutate or synthesize scroll for mobile web continuous touch moves', () => {
    envMock.appService = {
      isMobile: true,
      isMobileApp: false,
      isIOSApp: false,
      isAndroidApp: false,
    };
    const scrollContainer = document.createElement('div');
    scrollContainer.scrollTop = 10;
    const syntheticScroll = vi.fn();
    scrollContainer.addEventListener('scroll', syntheticScroll);

    vi.spyOn(useReaderStore.getState(), 'getViewSettings').mockReturnValue({
      layoutMode: 'continuous',
      textContinuousSections: true,
      vertical: false,
    } as never);
    vi.spyOn(useBookDataStore.getState(), 'getBookData').mockReturnValue({
      isFixedLayout: false,
    } as never);

    const handlePageFlip = vi.fn();
    const { result } = renderHook(() => useTouchEvent('book-key', handlePageFlip));

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

    expect(scrollContainer.scrollTop).toBe(10);
    expect(syntheticScroll).not.toHaveBeenCalled();
    expect(handlePageFlip).not.toHaveBeenCalled();
  });

  it('keeps fixed-layout mobile paged swipes on the page-flip path', () => {
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
    const { result } = renderHook(() => useTouchEvent('book-key', handlePageFlip));

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
  });

  it('keeps native pull-to-load enabled only for native mobile apps', () => {
    expect(shouldUseNativeChapterPull({ isMobileApp: false })).toBe(false);
    expect(shouldUseNativeChapterPull({ isMobileApp: true })).toBe(true);
    expect(shouldUseNativeChapterPull(null)).toBe(false);
  });

  it('keeps the removed mobile web scroll bridge out of reader runtime source', () => {
    const repoRoot = join(process.cwd(), '..', '..');
    const source = [
      'apps/openread-app/src/app/reader/hooks/useIframeEvents.ts',
      'apps/openread-app/src/app/reader/utils/mobileScroll.ts',
      'apps/openread-app/src/app/reader/hooks/usePagination.ts',
    ]
      .map((file) => readFileSync(join(repoRoot, file), 'utf8'))
      .join('\n');

    const removedManualScrollHelper = ['apply', 'MobileWeb', 'TouchScroll'].join('');
    const removedMobileWebGate = ['shouldUse', 'MobileWeb', 'TouchScroll'].join('');
    const removedScrollMutation = ['scrollContainer', '[', 'scrollProp', ']'].join('');
    const removedSyntheticScroll = ['dispatchEvent', '(new Event', "('scroll'))"].join('');

    expect(source).not.toContain(removedManualScrollHelper);
    expect(source).not.toContain(removedMobileWebGate);
    expect(source).not.toContain(removedScrollMutation);
    expect(source).not.toContain(removedSyntheticScroll);
    expect(source).not.toContain('setTimeout(() =>');
  });

  it('documents Foliate continuous startup fill for cover or short first sections', () => {
    const repoRoot = join(process.cwd(), '..', '..');
    const paginator = readFileSync(join(repoRoot, 'packages/foliate-js/paginator.js'), 'utf8');

    expect(paginator).toContain('async #ensureScrolledStartupFill');
    expect(paginator).toContain('this.scrolled');
    expect(paginator).toContain('await this.#ensureScrolledStartupFill()');
    expect(paginator).not.toContain('setTimeout(() => this.next');
    expect(paginator).not.toContain('setTimeout(() => this.prev');
  });
});
