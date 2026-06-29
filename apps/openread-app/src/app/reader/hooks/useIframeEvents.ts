import { useEffect, useRef } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useReaderStore } from '@/store/readerStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { useNotebookStore } from '@/store/notebookStore';
import { useSidebarStore } from '@/store/sidebarStore';
import {
  selectIsAnyMobileReaderPanelOpen,
  useMobileReaderPanelStore,
} from '@/store/mobileReaderPanelStore';
import { debounce } from '@/utils/debounce';
import { ScrollSource } from './usePagination';
import { eventDispatcher } from '@/utils/event';
import { normalizeReaderLayout } from '../utils/readerLayoutContract';

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

export const useTouchEvent = (bookKey: string, handlePageFlip: (msg: CustomEvent) => void) => {
  const { appService } = useEnv();
  const { getBookDataByReaderKey } = useBookDataStore();
  const { hoveredBookKey, setHoveredBookKey, getViewSettings } = useReaderStore();

  const touchStartRef = useRef<IframeTouch | null>(null);
  const touchEndRef = useRef<IframeTouch | null>(null);
  const touchStartTimeRef = useRef<number | null>(null);
  const touchEndTimeRef = useRef<number | null>(null);
  const touchMovedRef = useRef(false);

  const isAnyMobileReaderPanelOpen = () =>
    selectIsAnyMobileReaderPanelOpen(useMobileReaderPanelStore.getState());

  const resetTouchState = () => {
    touchStartRef.current = null;
    touchEndRef.current = null;
    touchStartTimeRef.current = null;
    touchEndTimeRef.current = null;
    touchMovedRef.current = false;
  };

  const onTouchStart = (e: IframeTouchEvent | React.TouchEvent<HTMLDivElement>) => {
    const touch = e.targetTouches[0];
    if (!touch) return;
    touchStartRef.current = touch;
    touchStartTimeRef.current = 'timeStamp' in e ? e.timeStamp : Date.now();
    touchMovedRef.current = false;
  };

  const onTouchMove = (e: IframeTouchEvent | React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current) return;
    const touch = e.targetTouches[0];
    if (touch) {
      touchMovedRef.current = true;
      touchEndRef.current = touch;
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
      const deltaY = touchEnd.screenY - touchStart.screenY;
      const deltaX = touchEnd.screenX - touchStart.screenX;
      if (!isAnyMobileReaderPanelOpen()) {
        const viewSettings = getViewSettings(bookKey);
        if (!viewSettings) return;
        const layoutState = normalizeReaderLayout({
          settings: viewSettings,
          book: {
            isFixedLayout: getBookDataByReaderKey(bookKey)?.isFixedLayout,
            renditionLayout: getBookDataByReaderKey(bookKey)?.bookDoc?.rendition?.layout,
            format: getBookDataByReaderKey(bookKey)?.book?.format,
          },
          platform: { isMobile: !!appService?.isMobile },
        });
        if (layoutState.layoutMode === 'paged' && !viewSettings.vertical) {
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

      const viewSettings = getViewSettings(bookKey);
      const bookData = getBookDataByReaderKey(bookKey);
      if (!viewSettings || !bookData) {
        resetTouchState();
        return;
      }
      const deltaT = touchEndTime && touchStartTime ? touchEndTime - touchStartTime : 0;
      const layoutState = normalizeReaderLayout({
        settings: viewSettings,
        book: {
          isFixedLayout: bookData.isFixedLayout,
          renditionLayout: bookData.bookDoc?.rendition?.layout,
          format: bookData.book?.format,
        },
        platform: { isMobile: !!appService?.isMobile },
      });
      const isPagedMode = layoutState.layoutMode === 'paged';
      // also check for deltaX to prevent swipe page turn from triggering the toggle
      if (
        isPagedMode &&
        deltaY < -10 &&
        Math.abs(deltaY) > Math.abs(deltaX) * 2 &&
        Math.abs(deltaX) < windowWidth * 0.3
      ) {
        // swipe up to toggle the header bar and the footer bar, only for horizontal page mode
        if (
          !viewSettings.vertical && // not vertical
          (!bookData.isFixedLayout || viewSettings.pageZoomLevel <= 100) // for fixed layout, not when zoomed in
        ) {
          setHoveredBookKey(hoveredBookKey ? null : bookKey);
        }
      } else if (
        hoveredBookKey &&
        !useNotebookStore.getState().isNotebookVisible &&
        !useSidebarStore.getState().isSideBarVisible &&
        !isAnyMobileReaderPanelOpen()
      ) {
        setHoveredBookKey(null);
      }

      if (isPagedMode) {
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
      }
    }

    resetTouchState();
  };

  const handleTouch = (msg: MessageEvent) => {
    if (msg.data && msg.data.bookKey === bookKey) {
      if (msg.data.type === 'iframe-touchstart') {
        onTouchStart(msg.data);
      } else if (msg.data.type === 'iframe-touchmove') {
        onTouchMove(msg.data);
      } else if (msg.data.type === 'iframe-touchend') {
        onTouchEnd(msg.data);
      } else if (msg.data.type === 'iframe-touchcancel') {
        resetTouchState();
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
