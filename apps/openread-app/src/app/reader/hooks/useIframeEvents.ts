import { useEffect, useRef } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useReaderStore } from '@/store/readerStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { useNotebookStore } from '@/store/notebookStore';
import { useSidebarStore } from '@/store/sidebarStore';
import { debounce } from '@/utils/debounce';
import { ScrollSource } from './usePagination';
import { eventDispatcher } from '@/utils/event';
import { shouldUseMobileWebTouchScroll } from '../utils/mobileScroll';

export const useMouseEvent = (
  bookKey: string,
  handlePageFlip: (msg: MessageEvent | React.MouseEvent<HTMLDivElement, MouseEvent>) => void,
  handleContinuousScroll: (source: ScrollSource, delta: number, threshold: number) => void,
) => {
  const { hoveredBookKey } = useReaderStore();
  const debounceScroll = debounce(handleContinuousScroll, 500);
  const debounceFlip = debounce(handlePageFlip, 100);
  const handleMouseEvent = (msg: MessageEvent | React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if (msg instanceof MessageEvent) {
      if (msg.data && msg.data.bookKey === bookKey) {
        if (msg.data.type === 'iframe-wheel') {
          debounceScroll('mouse', -msg.data.deltaY, 0);
        }
        if (msg.data.type === 'iframe-wheel') {
          if (msg.data.ctrlKey) {
            if (msg.data.deltaY > 0) {
              eventDispatcher.dispatch('zoom-out', { factor: Math.abs(msg.data.deltaY) / 100 });
            } else if (msg.data.deltaY < 0) {
              eventDispatcher.dispatch('zoom-in', { factor: Math.abs(msg.data.deltaY) / 100 });
            }
          } else {
            debounceFlip(msg);
          }
        } else {
          handlePageFlip(msg);
        }
      }
    } else if (msg.type === 'wheel') {
      const event = msg as React.WheelEvent<HTMLDivElement>;
      debounceScroll('mouse', -event.deltaY, 0);
    } else {
      handlePageFlip(msg);
    }
  };

  useEffect(() => {
    window.addEventListener('message', handleMouseEvent);
    return () => {
      window.removeEventListener('message', handleMouseEvent);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookKey, hoveredBookKey]);

  return {
    onClick: handlePageFlip,
    onWheel: handleMouseEvent,
  };
};

interface IframeTouch {
  clientX: number;
  clientY: number;
  screenX: number;
  screenY: number;
}

interface IframeTouchEvent {
  timeStamp: number;
  targetTouches: IframeTouch[];
  changedTouches?: IframeTouch[];
}

export const useTouchEvent = (
  bookKey: string,
  handlePageFlip: (msg: CustomEvent) => void,
  handleContinuousScroll: (source: ScrollSource, delta: number, threshold: number) => void,
) => {
  const { appService } = useEnv();
  const { getBookData } = useBookDataStore();
  const { hoveredBookKey, setHoveredBookKey, getView, getViewSettings } = useReaderStore();

  const touchStartRef = useRef<IframeTouch | null>(null);
  const touchEndRef = useRef<IframeTouch | null>(null);
  const lastTouchRef = useRef<IframeTouch | null>(null);
  const touchStartTimeRef = useRef<number | null>(null);
  const touchEndTimeRef = useRef<number | null>(null);
  const touchMovedRef = useRef(false);

  const applyMobileWebTouchScroll = (touch: IframeTouch) => {
    if (!shouldUseMobileWebTouchScroll(appService)) return;

    const viewSettings = getViewSettings(bookKey);
    const bookData = getBookData(bookKey);
    if (!viewSettings?.scrolled || !viewSettings.continuousScroll || bookData?.isFixedLayout) {
      return;
    }

    const previousTouch = lastTouchRef.current ?? touchStartRef.current;
    if (!previousTouch) return;

    const renderer = getView(bookKey)?.renderer as
      | (HTMLElement & { scrollProp?: 'scrollTop' | 'scrollLeft' })
      | undefined;
    const scrollContainer = renderer?.shadowRoot?.getElementById('container');
    if (!scrollContainer) return;

    const scrollProp = renderer?.scrollProp ?? (viewSettings.vertical ? 'scrollLeft' : 'scrollTop');
    const deltaX = previousTouch.screenX - touch.screenX;
    const deltaY = previousTouch.screenY - touch.screenY;
    const primaryDelta = scrollProp === 'scrollLeft' ? deltaX : deltaY;
    const crossDelta = scrollProp === 'scrollLeft' ? deltaY : deltaX;
    if (Math.abs(primaryDelta) < 1 || Math.abs(primaryDelta) < Math.abs(crossDelta)) return;

    const previousPosition = scrollContainer[scrollProp];
    scrollContainer[scrollProp] = previousPosition + primaryDelta;
    if (scrollContainer[scrollProp] !== previousPosition) {
      scrollContainer.dispatchEvent(new Event('scroll'));
    }
  };

  const resetTouchState = () => {
    touchStartRef.current = null;
    touchEndRef.current = null;
    lastTouchRef.current = null;
    touchStartTimeRef.current = null;
    touchEndTimeRef.current = null;
    touchMovedRef.current = false;
  };

  const onTouchStart = (e: IframeTouchEvent | React.TouchEvent<HTMLDivElement>) => {
    const touch = e.targetTouches[0];
    if (!touch) return;
    touchStartRef.current = touch;
    lastTouchRef.current = touch;
    touchStartTimeRef.current = 'timeStamp' in e ? e.timeStamp : Date.now();
    touchMovedRef.current = false;
  };

  const onTouchMove = (e: IframeTouchEvent | React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current) return;
    const touch = e.targetTouches[0];
    if (touch) {
      touchMovedRef.current = true;
      applyMobileWebTouchScroll(touch);
      touchEndRef.current = touch;
      lastTouchRef.current = touch;
      touchEndTimeRef.current = 'timeStamp' in e ? e.timeStamp : Date.now();
    }
    const { current: touchStart } = touchStartRef;
    const { current: touchEnd } = touchEndRef;
    if (hoveredBookKey && touchEnd) {
      // Don't dismiss toolbar when notebook or sidebar is open —
      // the touch is on the iframe underneath, not on the panel.
      // Read directly from store to avoid stale closure (useEffect deps don't track these).
      if (
        useNotebookStore.getState().isNotebookVisible ||
        useSidebarStore.getState().isSideBarVisible
      )
        return;
      const viewSettings = getViewSettings(bookKey)!;
      const deltaY = touchEnd.screenY - touchStart.screenY;
      const deltaX = touchEnd.screenX - touchStart.screenX;
      if (!(window as unknown as Record<string, unknown>).__sheetOpen) {
        if (!viewSettings!.scrolled && !viewSettings!.vertical) {
          if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
            setHoveredBookKey(null);
          }
        } else {
          setHoveredBookKey(null);
        }
      }
    }
  };

  const onTouchEnd = (e: IframeTouchEvent | React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current) return;

    const touch = e.targetTouches[0] ?? ('changedTouches' in e ? e.changedTouches?.[0] : undefined);
    if (touch) {
      touchEndRef.current = touch;
      touchEndTimeRef.current = 'timeStamp' in e ? e.timeStamp : Date.now();
    }

    const windowWidth = window.innerWidth;
    const { current: touchStart } = touchStartRef;
    const { current: touchEnd } = touchEndRef;
    const { current: touchStartTime } = touchStartTimeRef;
    const { current: touchEndTime } = touchEndTimeRef;
    if (touchEnd) {
      const deltaY = touchEnd.screenY - touchStart.screenY;
      const deltaX = touchEnd.screenX - touchStart.screenX;
      const hasMoved = touchMovedRef.current || Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2;
      if (!hasMoved) {
        resetTouchState();
        return;
      }

      const viewSettings = getViewSettings(bookKey)!;
      const bookData = getBookData(bookKey)!;
      const deltaT = touchEndTime && touchStartTime ? touchEndTime - touchStartTime : 0;
      // also check for deltaX to prevent swipe page turn from triggering the toggle
      if (
        deltaY < -10 &&
        Math.abs(deltaY) > Math.abs(deltaX) * 2 &&
        Math.abs(deltaX) < windowWidth * 0.3
      ) {
        // swipe up to toggle the header bar and the footer bar, only for horizontal page mode
        if (
          !viewSettings!.scrolled && // not scrolled
          !viewSettings!.vertical && // not vertical
          (!bookData.isFixedLayout || viewSettings.zoomLevel <= 100) // for fixed layout, not when zoomed in
        ) {
          setHoveredBookKey(hoveredBookKey ? null : bookKey);
        }
      } else {
        if (
          hoveredBookKey &&
          !useNotebookStore.getState().isNotebookVisible &&
          !useSidebarStore.getState().isSideBarVisible &&
          !(window as unknown as Record<string, unknown>).__sheetOpen
        ) {
          setHoveredBookKey(null);
        }
      }
      handlePageFlip(
        new CustomEvent('touch-swipe', {
          detail: {
            deltaX,
            deltaY,
            deltaT,
            startX: touchStart.screenX,
            startY: touchStart.screenY,
            endX: touchEnd.screenX,
            endY: touchEnd.screenY,
          },
        }),
      );
      handleContinuousScroll('touch', deltaY, 30);
    }

    resetTouchState();
  };

  const handleTouch = (msg: MessageEvent) => {
    if (msg.data && msg.data.bookKey === bookKey) {
      if (msg.data.type === 'iframe-touchstart') {
        onTouchStart(msg.data);
      } else if (msg.data.type === 'iframe-touchmove') {
        onTouchMove(msg.data);
      } else if (msg.data.type === 'iframe-touchend' || msg.data.type === 'iframe-touchcancel') {
        onTouchEnd(msg.data);
      }
    }
  };

  useEffect(() => {
    window.addEventListener('message', handleTouch);
    return () => {
      window.removeEventListener('message', handleTouch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredBookKey]);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  };
};
