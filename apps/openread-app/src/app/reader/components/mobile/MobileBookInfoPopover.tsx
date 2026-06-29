import clsx from 'clsx';
import Image from 'next/image';
import React, { useEffect, useRef } from 'react';
import { PiXBold } from 'react-icons/pi';

import { useTranslation } from '@/hooks/useTranslation';

export interface MobileBookInfoPopoverData {
  title: string;
  author?: string | null;
  coverImageUrl?: string | null;
  progressLabel?: string | null;
  locationLabel?: string | null;
  formatLabel?: string | null;
  sourceLabel?: string | null;
}

interface MobileBookInfoPopoverProps {
  data: MobileBookInfoPopoverData;
  onClose: () => void;
  className?: string;
}

const hasValue = (value: string | null | undefined): value is string => !!value?.trim();

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
        'bg-base-100 text-base-content border-base-300 absolute left-0 top-[calc(100%+0.5rem)] z-50 w-[min(calc(100vw-3rem),22rem)] rounded-2xl border p-3 shadow-2xl',
        className,
      )}
      data-testid='mobile-reader-book-info-popover'
    >
      <div className='flex items-start gap-3'>
        <div className='bg-base-200 relative h-20 w-14 flex-shrink-0 overflow-hidden rounded-lg shadow-sm'>
          {data.coverImageUrl ? (
            <Image
              src={data.coverImageUrl}
              alt=''
              fill
              sizes='56px'
              className='object-cover'
              onError={(event) => {
                (event.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div
              aria-hidden='true'
              className='flex h-full w-full items-center justify-center text-xs font-semibold opacity-60'
            >
              {data.title.slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
        <div className='min-w-0 flex-1'>
          <div className='flex items-start gap-2'>
            <div className='min-w-0 flex-1'>
              <h2 className='line-clamp-2 text-sm font-semibold leading-snug'>{data.title}</h2>
              <p className='mt-0.5 line-clamp-1 text-xs opacity-70'>
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
          <dl className='mt-3 grid grid-cols-[auto,minmax(0,1fr)] gap-x-2 gap-y-1 text-xs'>
            {hasValue(data.progressLabel) && (
              <>
                <dt className='opacity-60'>{_('Progress')}</dt>
                <dd className='truncate font-medium'>{data.progressLabel}</dd>
              </>
            )}
            {hasValue(data.locationLabel) && (
              <>
                <dt className='opacity-60'>{_('Location')}</dt>
                <dd className='truncate font-medium'>{data.locationLabel}</dd>
              </>
            )}
            {hasValue(data.formatLabel) && (
              <>
                <dt className='opacity-60'>{_('Format')}</dt>
                <dd className='truncate font-medium'>{data.formatLabel}</dd>
              </>
            )}
            {hasValue(data.sourceLabel) && (
              <>
                <dt className='opacity-60'>{_('Source')}</dt>
                <dd className='truncate font-medium'>{data.sourceLabel}</dd>
              </>
            )}
          </dl>
        </div>
      </div>
    </div>
  );
};

export default MobileBookInfoPopover;
