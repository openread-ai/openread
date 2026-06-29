import clsx from 'clsx';
import React, { useEffect, useRef } from 'react';
import { PiXBold } from 'react-icons/pi';

import BookCover from '@/components/BookCover';
import { useTranslation } from '@/hooks/useTranslation';
import type { Book } from '@/types/book';

export interface MobileBookInfoPopoverData {
  title: string;
  author?: string | null;
  book?: Book | null;
}

interface MobileBookInfoPopoverProps {
  data: MobileBookInfoPopoverData;
  onClose: () => void;
  className?: string;
}

const hasValue = (value: string | null | undefined): value is string => !!value?.trim();

export const MOBILE_BOOK_INFO_POPOVER_TOP_OFFSET_CLASS =
  'top-[calc(env(safe-area-inset-top)+3.0625rem)]';

const MobileBookInfoPopover: React.FC<MobileBookInfoPopoverProps> = ({
  data,
  onClose,
  className,
}) => {
  const _ = useTranslation();
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (popoverRef.current?.contains(target)) return;
      onClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={popoverRef}
      role='dialog'
      aria-modal='false'
      aria-label={_('{{title}} book information', { title: data.title })}
      className={clsx(
        'bg-base-100 text-base-content border-base-300 fixed left-1/2 z-50 w-[min(calc(100vw-2rem),20rem)] -translate-x-1/2 rounded-2xl border p-4 shadow-2xl',
        MOBILE_BOOK_INFO_POPOVER_TOP_OFFSET_CLASS,
        className,
      )}
      data-testid='mobile-reader-book-info-popover'
    >
      <div className='flex items-start gap-4'>
        <div className='bg-base-200 relative h-24 w-16 flex-shrink-0 overflow-hidden rounded-xl shadow-sm'>
          {data.book ? (
            <BookCover book={data.book} className='h-full w-full' imageClassName='rounded-xl' />
          ) : (
            <div
              aria-hidden='true'
              className='flex h-full w-full items-center justify-center text-lg font-semibold opacity-60'
            >
              {data.title.slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
        <div className='min-w-0 flex-1'>
          <div className='flex items-start gap-2'>
            <div className='min-w-0 flex-1'>
              <h2 className='line-clamp-3 text-base font-semibold leading-snug'>{data.title}</h2>
              <p className='mt-1 line-clamp-2 text-sm opacity-70'>
                {hasValue(data.author) ? data.author : _('Unknown author')}
              </p>
            </div>
            <button
              type='button'
              className='btn btn-ghost h-7 min-h-7 w-7 flex-shrink-0 p-0'
              onClick={onClose}
              aria-label={_('Close book information')}
            >
              <PiXBold size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MobileBookInfoPopover;
