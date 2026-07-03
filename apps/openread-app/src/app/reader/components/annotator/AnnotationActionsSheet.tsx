import clsx from 'clsx';
import type { ElementType } from 'react';
import { createPortal } from 'react-dom';
import { IoClose } from 'react-icons/io5';

import { useThemeStore } from '@/store/themeStore';

interface AnnotationActionsSheetProps {
  buttons: Array<{
    tooltipText: string;
    Icon: ElementType;
    onClick: () => void;
    disabled?: boolean;
    visible?: boolean;
  }>;
  onDismiss: () => void;
}

function AnnotationActionsSheet({ buttons, onDismiss }: AnnotationActionsSheetProps) {
  const { safeAreaInsets } = useThemeStore();
  const safeAreaBottom = safeAreaInsets?.bottom ?? 0;

  return createPortal(
    <div
      className='pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3'
      style={{
        paddingBottom: `max(${safeAreaBottom + 12}px, calc(env(safe-area-inset-bottom, 0px) + 12px))`,
      }}
    >
      <div
        aria-label='Selection actions'
        className={clsx(
          'pointer-events-auto flex w-full max-w-md items-center gap-1',
          'border-base-content/10 bg-base-200/95 text-base-content rounded-2xl border p-2 shadow-2xl backdrop-blur-xl',
        )}
        role='toolbar'
      >
        <div className='relative min-w-0 flex-1'>
          <span className='sr-only'>
            Selection actions scroll horizontally when more actions are available.
          </span>
          <div className='flex min-w-0 scroll-px-2 items-center gap-1 overflow-x-auto overscroll-x-contain pr-6 [-webkit-overflow-scrolling:touch]'>
            {buttons.map((button, index) => {
              if (button.visible === false) return null;
              const Icon = button.Icon;
              return (
                <button
                  aria-label={button.tooltipText}
                  className={clsx(
                    'flex min-h-11 min-w-[4.75rem] shrink-0 touch-manipulation flex-col items-center justify-center gap-1 rounded-xl px-2 py-1.5 text-center text-xs font-medium',
                    'transition active:scale-95',
                    button.disabled
                      ? 'text-base-content/30 cursor-not-allowed'
                      : 'text-base-content hover:bg-base-content/10 active:bg-base-content/15',
                  )}
                  disabled={button.disabled}
                  key={index}
                  onClick={button.onClick}
                  type='button'
                >
                  <Icon aria-hidden='true' className='h-4 w-4 shrink-0' />
                  <span className='whitespace-nowrap text-[11px] leading-tight'>
                    {button.tooltipText}
                  </span>
                </button>
              );
            })}
          </div>
          <div
            aria-hidden='true'
            className='from-base-200/95 pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l to-transparent'
          />
        </div>
        <button
          aria-label='Dismiss selection actions'
          className='text-base-content/70 hover:bg-base-content/10 min-h-11 min-w-11 touch-manipulation rounded-full p-2 transition active:scale-95'
          onClick={onDismiss}
          type='button'
        >
          <IoClose aria-hidden='true' className='h-5 w-5' />
        </button>
      </div>
    </div>,
    document.body,
  );
}

export default AnnotationActionsSheet;
