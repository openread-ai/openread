'use client';

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { MenuIcon } from 'lucide-react';

import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/utils/tailwind';
import ViewMenu from '../ViewMenu';

export const MOBILE_READER_MENU_BUTTON_SIZE_PX = 56;
export const MOBILE_READER_MENU_OVERLAY_GAP_PX = 8;
export const MOBILE_READER_MENU_MAX_HEIGHT_CAP_RATIO = 0.8;
export const MOBILE_READER_MENU_MAX_HEIGHT_CSS_VAR = '--mobile-reader-menu-max-height';

interface MobileReaderMenuLauncherProps {
  bookKey: string;
  className?: string;
  buttonClassName?: string;
  popoverClassName?: string;
  dockBottomOffsetPx?: number;
}

export function MobileReaderMenuLauncher({
  bookKey,
  className,
  buttonClassName,
  popoverClassName,
  dockBottomOffsetPx = 8,
}: MobileReaderMenuLauncherProps) {
  const _ = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const overlayBottomOffsetPx =
    dockBottomOffsetPx + MOBILE_READER_MENU_BUTTON_SIZE_PX + MOBILE_READER_MENU_OVERLAY_GAP_PX;

  const updateMenuMaxHeight = useCallback(() => {
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const headerBottom =
      document.querySelector<HTMLElement>('.header-bar')?.getBoundingClientRect().bottom ?? 0;
    const overlayBottomY = viewportHeight - overlayBottomOffsetPx;
    const availableHeight = overlayBottomY - headerBottom;
    const viewportCap = viewportHeight * MOBILE_READER_MENU_MAX_HEIGHT_CAP_RATIO;

    overlayRef.current?.style.setProperty(
      MOBILE_READER_MENU_MAX_HEIGHT_CSS_VAR,
      `${Math.max(0, Math.floor(Math.min(availableHeight, viewportCap)))}px`,
    );
  }, [overlayBottomOffsetPx]);

  useLayoutEffect(() => {
    if (!open) return;

    updateMenuMaxHeight();

    const visualViewport = window.visualViewport;
    window.addEventListener('resize', updateMenuMaxHeight);
    visualViewport?.addEventListener('resize', updateMenuMaxHeight);
    visualViewport?.addEventListener('scroll', updateMenuMaxHeight);

    return () => {
      window.removeEventListener('resize', updateMenuMaxHeight);
      visualViewport?.removeEventListener('resize', updateMenuMaxHeight);
      visualViewport?.removeEventListener('scroll', updateMenuMaxHeight);
    };
  }, [open, updateMenuMaxHeight]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={cn('relative flex shrink-0 items-end', className)}
      data-openread-mobile-reader-menu-launcher
    >
      {open && (
        <>
          <div
            aria-hidden='true'
            className='fixed inset-0 z-20 bg-transparent'
            data-testid='mobile-reader-menu-dismiss-layer'
            onPointerDown={() => setOpen(false)}
          />
          <div
            ref={overlayRef}
            className={cn(
              'fixed left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2',
              popoverClassName,
            )}
            style={
              {
                bottom: overlayBottomOffsetPx,
                [MOBILE_READER_MENU_MAX_HEIGHT_CSS_VAR]: '80dvh',
              } as CSSProperties
            }
            data-openread-mobile-reader-menu-content
            data-testid='mobile-reader-menu-content'
          >
            <ViewMenu bookKey={bookKey} setIsDropdownOpen={setOpen} />
          </div>
        </>
      )}
      <button
        type='button'
        aria-label={_('Reader menu')}
        aria-expanded={open}
        data-testid='mobile-reader-menu-button'
        className={cn(
          'bg-base-100/95 text-base-content/80 ring-base-content/10 hover:bg-base-100 flex size-14 shrink-0 items-center justify-center rounded-full shadow-lg ring-1 ring-inset backdrop-blur-xl transition-transform active:scale-95 motion-reduce:transition-none',
          open && 'relative z-30',
          buttonClassName,
        )}
        onClick={() => setOpen((current) => !current)}
      >
        <MenuIcon className='size-6' />
      </button>
    </div>
  );
}
