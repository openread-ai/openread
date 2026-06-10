import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTouchEvent } from '@/app/reader/hooks/useIframeEvents';
import { handleTouchEnd } from '@/app/reader/utils/iframeEventHandlers';
import { shouldUseNativeChapterPull } from '@/app/reader/utils/mobileScroll';

describe('mobile reader scroll boundaries', () => {
  afterEach(() => {
    vi.restoreAllMocks();
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

  it('keeps native pull-to-load disabled for mobile web scroll mode', () => {
    expect(shouldUseNativeChapterPull({ isMobileApp: false })).toBe(false);
    expect(shouldUseNativeChapterPull({ isMobileApp: true })).toBe(true);
    expect(shouldUseNativeChapterPull(null)).toBe(false);
  });
});
