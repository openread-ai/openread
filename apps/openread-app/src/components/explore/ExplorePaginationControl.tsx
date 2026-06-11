'use client';

import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

interface ExplorePaginationControlProps {
  shown: number;
  total: number;
  isLoading?: boolean;
  disabled?: boolean;
  onLoadMore: () => void;
  className?: string;
}

export const ExplorePaginationControl = forwardRef<HTMLDivElement, ExplorePaginationControlProps>(
  function ExplorePaginationControl(
    { shown, total, isLoading = false, disabled = false, onLoadMore, className },
    ref,
  ) {
    const _ = useTranslation();
    const isDisabled = disabled || isLoading;

    return (
      <div ref={ref} className={className ?? 'flex flex-col items-center gap-3 py-8'}>
        <p className='text-base-content/50 text-sm'>
          {_('Showing {{shown}} of {{total}} books', {
            shown,
            total,
          })}
        </p>
        <button
          type='button'
          onClick={onLoadMore}
          disabled={isDisabled}
          className='border-base-300 text-base-content hover:bg-base-200 disabled:text-base-content/40 flex h-10 items-center gap-2 rounded-full border px-5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:hover:bg-transparent'
        >
          {isLoading && <Loader2 className='h-4 w-4 animate-spin' aria-hidden='true' />}
          {isLoading ? _('Loading more...') : _('Load more')}
        </button>
      </div>
    );
  },
);
