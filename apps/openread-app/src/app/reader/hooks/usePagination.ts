import { useEffect } from 'react';
import { useEnv } from '@/context/EnvContext';
import { FoliateView } from '@/types/view';
import { ViewSettings } from '@/types/book';
import { useReaderStore } from '@/store/readerStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { useDeviceControlStore } from '@/store/deviceStore';
import { eventDispatcher } from '@/utils/event';
import { bridge } from '@/services/bridge/bridgeService';
import { isTauriAppPlatform } from '@/services/environment';
import { tauriGetWindowLogicalPosition } from '@/utils/window';
import { normalizeReaderLayout } from '../utils/readerLayoutContract';

export type ScrollSource = 'mouse';

type PaginationSide = 'left' | 'right' | 'up' | 'down';
type PaginationMode = 'pan' | 'page' | 'section';

const swapLeftRight = (side: PaginationSide) => {
  if (side === 'left') return 'right';
  if (side === 'right') return 'left';
  return side;
};

const getLayoutState = (view: FoliateView | null, viewSettings: ViewSettings | null | undefined) =>
  view && viewSettings
    ? normalizeReaderLayout({
        settings: viewSettings,
        book: {
          isFixedLayout: view.book.rendition?.layout === 'pre-paginated',
          renditionLayout: view.book.rendition?.layout,
        },
        platform: {},
      })
    : null;

const isPanningView = (view: FoliateView | null, viewSettings: ViewSettings | null | undefined) => {
  const layoutState = getLayoutState(view, viewSettings);
  if (!view || !viewSettings || layoutState?.bookCapability !== 'page') return false;
  return viewSettings.pageZoomLevel > 100 || viewSettings.pageZoomMode !== 'fit-page';
};

const hasHorizontalPanning = (
  view: FoliateView | null,
  viewSettings: ViewSettings | null | undefined,
) => {
  if (!view || !viewSettings) return false;
  return isPanningView(view, viewSettings) && view.isOverflowX();
};

const hasVerticalPanning = (
  view: FoliateView | null,
  viewSettings: ViewSettings | null | undefined,
) => {
  if (!view || !viewSettings) return false;
  return isPanningView(view, viewSettings) && view.isOverflowY();
};

export const viewPagination = (
  view: FoliateView | null,
  viewSettings: ViewSettings | null | undefined,
  side: PaginationSide,
  mode: PaginationMode = 'page',
  panDistance: number = 50,
) => {
  if (!view || !viewSettings) return;
  const renderer = view.renderer;
  if (view.book.dir === 'rtl') {
    side = swapLeftRight(side);
  }
  const layoutState = getLayoutState(view, viewSettings);
  if (layoutState?.layoutMode === 'continuous') {
    const { size } = renderer;
    const showHeader = viewSettings.showHeader && viewSettings.showBarsOnScroll;
    const showFooter = viewSettings.showFooter && viewSettings.showBarsOnScroll;
    const scrollingOverlap = viewSettings.scrollingOverlap;
    const distance = size - scrollingOverlap - (showHeader ? 44 : 0) - (showFooter ? 44 : 0);
    switch (mode) {
      case 'section':
        if (side === 'left' || side === 'up') {
          return view.renderer.prevSection?.();
        } else {
          return view.renderer.nextSection?.();
        }
      case 'pan':
      case 'page':
      default:
        return side === 'left' || side === 'up' ? view.prev(distance) : view.next(distance);
    }
  } else if (mode === 'pan' && isPanningView(view, viewSettings)) {
    if (hasHorizontalPanning(view, viewSettings) && (side === 'left' || side === 'right')) {
      return view.pan(side === 'left' ? -panDistance : panDistance, 0);
    } else if (hasVerticalPanning(view, viewSettings) && (side === 'up' || side === 'down')) {
      return view.pan(0, side === 'up' ? -panDistance : panDistance);
    } else {
      return side === 'left' || side === 'up' ? view.prev() : view.next();
    }
  } else {
    switch (mode) {
      case 'section':
        if (side === 'left' || side === 'up') {
          return view.renderer.prevSection?.();
        } else {
          return view.renderer.nextSection?.();
        }
      case 'pan':
      case 'page':
      default:
        return side === 'left' || side === 'up' ? view.prev() : view.next();
    }
  }
};

export const usePagination = (
  bookKey: string,
  viewRef: React.RefObject<FoliateView | null>,
  containerRef: React.RefObject<HTMLDivElement | null>,
) => {
  const { appService } = useEnv();
  const { getBookDataByReaderKey } = useBookDataStore();
  const { getViewSettings, getViewState } = useReaderStore();
  const { hoveredBookKey, setHoveredBookKey } = useReaderStore();
  const { acquireVolumeKeyInterception, releaseVolumeKeyInterception } = useDeviceControlStore();

  const handlePageFlip = async (
    msg: MessageEvent | CustomEvent | React.MouseEvent<HTMLDivElement, MouseEvent>,
  ) => {
    const viewState = getViewState(bookKey);
    const bookData = getBookDataByReaderKey(bookKey);
    if (!viewState?.inited || !bookData) return;

    if (msg instanceof MessageEvent) {
      if (msg.data && msg.data.bookKey === bookKey) {
        const viewSettings = getViewSettings(bookKey)!;
        if (msg.data.type === 'iframe-single-click') {
          const viewElement = containerRef.current;
          if (viewElement) {
            const { screenX } = msg.data;
            const viewRect = viewElement.getBoundingClientRect();
            let windowStartX;
            // Currently for tauri APP the window.screenX is always 0
            if (isTauriAppPlatform()) {
              if (appService?.isMobile) {
                windowStartX = 0;
              } else {
                const windowPosition = (await tauriGetWindowLogicalPosition()) as {
                  x: number;
                  y: number;
                };
                windowStartX = windowPosition.x;
              }
            } else {
              windowStartX = window.screenX;
            }
            const viewStartX = windowStartX + viewRect.left;
            const viewCenterX = viewStartX + viewRect.width / 2;
            const consumed = eventDispatcher.dispatchSync('iframe-single-click');
            if (!consumed) {
              // On mobile (iOS/Android), any tap toggles the toolbar.
              // This follows the Apple HIG pattern (Apple Books, Photos, Safari):
              // "let people restore hidden elements with a familiar gesture like tapping."
              // Page turning on mobile is handled by swipe gestures instead.
              // On desktop, keep the existing zone-based behavior:
              // center 25% = toggle toolbar, left/right sides = page flip.
              if (appService?.isMobile) {
                setHoveredBookKey(hoveredBookKey ? null : bookKey);
              } else {
                const centerStartX = viewStartX + viewRect.width * 0.375;
                const centerEndX = viewStartX + viewRect.width * 0.625;
                if (
                  viewSettings.disableClick! ||
                  (screenX >= centerStartX && screenX <= centerEndX)
                ) {
                  setHoveredBookKey(hoveredBookKey ? null : bookKey);
                } else {
                  if (hoveredBookKey) {
                    setHoveredBookKey(null);
                    return;
                  }
                  if (!viewSettings.disableClick! && screenX >= viewCenterX) {
                    if (viewSettings.fullscreenClickArea) {
                      viewPagination(viewRef.current, viewSettings, 'down');
                    } else if (viewSettings.swapClickArea) {
                      viewPagination(viewRef.current, viewSettings, 'left');
                    } else {
                      viewPagination(viewRef.current, viewSettings, 'right');
                    }
                  } else if (!viewSettings.disableClick! && screenX < viewCenterX) {
                    if (viewSettings.fullscreenClickArea) {
                      viewPagination(viewRef.current, viewSettings, 'down');
                    } else if (viewSettings.swapClickArea) {
                      viewPagination(viewRef.current, viewSettings, 'right');
                    } else {
                      viewPagination(viewRef.current, viewSettings, 'left');
                    }
                  }
                }
              }
            }
          }
        } else if (
          msg.data.type === 'iframe-wheel' &&
          getLayoutState(viewRef.current, viewSettings)?.layoutMode === 'paged' &&
          !isPanningView(viewRef.current, viewSettings)
        ) {
          // The wheel event is handled by the iframe itself in scrolled mode.
          const { deltaY } = msg.data;
          if (deltaY > 0) {
            viewRef.current?.next(1);
          } else if (deltaY < 0) {
            viewRef.current?.prev(1);
          }
        } else if (msg.data.type === 'iframe-mouseup') {
          if (msg.data.button === 3) {
            viewRef.current?.history.back();
          } else if (msg.data.button === 4) {
            viewRef.current?.history.forward();
          }
        }
      }
    } else if (msg instanceof CustomEvent) {
      const viewSettings = getViewSettings(bookKey);
      if (
        msg.type === 'touch-swipe' &&
        bookData.isFixedLayout &&
        !isPanningView(viewRef.current, viewSettings)
      ) {
        const { deltaX, deltaY, deltaT } = msg.detail;
        const vx = Math.abs(deltaX / deltaT);
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 30 && vx > 0.2) {
          if (deltaX > 0) {
            viewPagination(viewRef.current, viewSettings, 'left');
          } else {
            viewPagination(viewRef.current, viewSettings, 'right');
          }
        }
      }
    } else {
      if (msg.type === 'click') {
        const { clientX } = msg;
        const width = window.innerWidth;
        const leftThreshold = width * 0.5;
        const rightThreshold = width * 0.5;
        const viewSettings = getViewSettings(bookKey);
        if (clientX < leftThreshold) {
          viewPagination(viewRef.current, viewSettings, 'left');
        } else if (clientX > rightThreshold) {
          viewPagination(viewRef.current, viewSettings, 'right');
        }
      }
    }
  };

  const handleContinuousScroll = (mode: ScrollSource, scrollDelta: number, threshold: number) => {
    const renderer = viewRef.current?.renderer;
    const viewSettings = getViewSettings(bookKey)!;
    const layoutState = getLayoutState(viewRef.current, viewSettings);
    const shouldBridgeSectionScroll =
      layoutState?.layoutMode === 'continuous' &&
      (layoutState.bookCapability === 'page' || layoutState.textContinuousSections);

    if (renderer && shouldBridgeSectionScroll) {
      const doScroll = () => {
        // may have overscroll where the start is greater than 0
        if (renderer.start <= scrollDelta && scrollDelta > threshold) {
          viewRef.current?.prev(renderer.start + 1);
          // sometimes viewSize has subpixel value that the end never reaches
        } else if (
          Math.ceil(renderer.end) - scrollDelta >= renderer.viewSize &&
          scrollDelta < -threshold
        ) {
          viewRef.current?.next(renderer.viewSize - Math.floor(renderer.end) + 1);
        }
      };
      if (mode === 'mouse') {
        // we can always get mouse wheel events
        doScroll();
      }
    }
  };

  const handleNativePageFlip = ({ keyName }: { keyName: string }) => {
    const viewSettings = getViewSettings(bookKey);
    if (!viewSettings?.volumeKeysToFlip) return;
    setHoveredBookKey('');
    if (keyName === 'VolumeUp') {
      viewPagination(viewRef.current, viewSettings, 'up');
    } else if (keyName === 'VolumeDown') {
      viewPagination(viewRef.current, viewSettings, 'down');
    }
  };

  useEffect(() => {
    if (!appService?.isMobileApp) return;

    const viewSettings = getViewSettings(bookKey);
    if (viewSettings?.volumeKeysToFlip) {
      acquireVolumeKeyInterception();
    } else {
      releaseVolumeKeyInterception();
    }

    const offNativeKeyDown = bridge.on('nativeKeyDown', handleNativePageFlip);
    return () => {
      releaseVolumeKeyInterception();
      offNativeKeyDown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    handlePageFlip,
    handleContinuousScroll,
  };
};
