import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/utils/tailwind';

export type BillingCycle = 'monthly' | 'annual';

interface BillingCycleToggleProps {
  value: BillingCycle;
  onChange: (value: BillingCycle) => void;
}

export default function BillingCycleToggle({ value, onChange }: BillingCycleToggleProps) {
  const _ = useTranslation();

  return (
    <div className='flex items-center justify-center gap-2'>
      <div className='bg-base-200 inline-flex rounded-lg p-1'>
        <button
          type='button'
          data-active={value === 'monthly'}
          className={cn(
            'rounded-md px-4 py-2 text-sm font-medium transition-colors',
            value === 'monthly'
              ? 'bg-base-100 text-base-content shadow-sm'
              : 'text-base-content/60 hover:text-base-content',
          )}
          onClick={() => onChange('monthly')}
        >
          {_('Monthly')}
        </button>
        <button
          type='button'
          data-active={value === 'annual'}
          className={cn(
            'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
            value === 'annual'
              ? 'bg-base-100 text-base-content shadow-sm'
              : 'text-base-content/60 hover:text-base-content',
          )}
          onClick={() => onChange('annual')}
        >
          {_('Annual')}
          <span className='bg-success/15 text-success rounded-full px-2 py-0.5 text-xs font-semibold'>
            {_('Save 17%')}
          </span>
        </button>
      </div>
    </div>
  );
}
