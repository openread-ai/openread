'use client';

import { useEffect, useRef, useState } from 'react';
import { MenuIcon } from 'lucide-react';

import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/utils/tailwind';
import ViewMenu from '../ViewMenu';

interface MobileReaderMenuLauncherProps {
  bookKey: string;
  className?: string;
  buttonClassName?: string;
  popoverClassName?: string;
}

export function MobileReaderMenuLauncher({
  bookKey,
  className,
  buttonClassName,
  popoverClassName,
}: MobileReaderMenuLauncherProps) {
  const _ = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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
        <div
          className={cn('absolute bottom-full left-0 z-50 mb-3', popoverClassName)}
          data-openread-mobile-reader-menu-content
          data-testid='mobile-reader-menu-content'
        >
          <ViewMenu bookKey={bookKey} setIsDropdownOpen={setOpen} />
        </div>
      )}
      <button
        type='button'
        aria-label={_('Reader menu')}
        aria-expanded={open}
        data-testid='mobile-reader-menu-button'
        className={cn(
          'bg-base-100/95 text-base-content/80 ring-base-content/10 hover:bg-base-100 flex size-14 shrink-0 items-center justify-center rounded-full shadow-lg ring-1 ring-inset backdrop-blur-xl transition-transform active:scale-95 motion-reduce:transition-none',
          buttonClassName,
        )}
        onClick={() => setOpen((current) => !current)}
      >
        <MenuIcon className='size-6' />
      </button>
    </div>
  );
}
