'use client';

import Link from 'next/link';
import { Button } from '@/components/primitives/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/primitives/card';
import { Progress } from '@/components/primitives/progress';
import { Skeleton } from '@/components/primitives/skeleton';
import { useTranslation } from '@/hooks/useTranslation';
import { useAIQuotaStore } from '@/store/aiQuotaStore';
import { RotateCcw } from 'lucide-react';

const UPGRADE_CTA_THRESHOLD_PERCENT = 98;

interface AIResetStatusProps {
  isLoading?: boolean;
}

interface UsageLimitRowProps {
  title: string;
  resetAt: string | null;
  used: number;
  limit: number;
}

function getPercentUsed(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(Math.round((used / limit) * 100), 100);
}

function getPercentLeft(used: number, limit: number): number {
  if (limit <= 0) return 100;
  return Math.max(100 - getPercentUsed(used, limit), 0);
}

function formatResetLabel(resetAt: string | null): string {
  if (!resetAt) return 'Available now';

  const date = new Date(resetAt);
  if (Number.isNaN(date.getTime())) return 'Available now';

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return `Resets ${date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    })}`;
  }

  return `Resets ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

function UsageLimitRow({ title, resetAt, used, limit }: UsageLimitRowProps) {
  const _ = useTranslation();
  const percentUsed = getPercentUsed(used, limit);
  const percentLeft = getPercentLeft(used, limit);

  return (
    <div className='grid gap-3 py-4 sm:grid-cols-[1fr_220px_84px] sm:items-center'>
      <div className='space-y-1'>
        <p className='text-base-content text-base font-medium'>{_(title)}</p>
        <p className='text-base-content/60 text-sm'>{_(formatResetLabel(resetAt))}</p>
      </div>
      <Progress value={percentUsed} className='h-2.5' />
      <p className='text-base-content/60 text-sm tabular-nums sm:text-right'>
        {_('{{percent}}% left', { percent: String(percentLeft) })}
      </p>
    </div>
  );
}

export function AIResetStatus({ isLoading }: AIResetStatusProps) {
  const _ = useTranslation();
  const plan = useAIQuotaStore((s) => s.plan);
  const used = useAIQuotaStore((s) => s.used);
  const limit = useAIQuotaStore((s) => s.limit);
  const resetAt = useAIQuotaStore((s) => s.resetAt);
  const rateLimit = useAIQuotaStore((s) => s.rateLimit);
  const rateWindowHours = useAIQuotaStore((s) => s.rateWindowHours);
  const rateUsed = useAIQuotaStore((s) => s.rateUsed);
  const rateResetAt = useAIQuotaStore((s) => s.rateResetAt);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className='pb-3'>
          <Skeleton className='h-5 w-32' />
        </CardHeader>
        <CardContent className='space-y-3'>
          <Skeleton className='h-12 w-full' />
          <Skeleton className='h-12 w-full' />
        </CardContent>
      </Card>
    );
  }

  const hasFiniteWeeklyLimit = limit > 0;
  const hasFiniteRateLimit = rateLimit !== null && rateLimit > 0;
  const rateTitle = rateWindowHours === 5 ? '5 hour usage limit' : 'Short usage limit';
  const highestPercentUsed = Math.max(
    hasFiniteRateLimit ? getPercentUsed(rateUsed, rateLimit) : 0,
    hasFiniteWeeklyLimit ? getPercentUsed(used, limit) : 0,
  );
  const showUpgradeCta =
    (plan === 'free' || plan === 'reader') && highestPercentUsed >= UPGRADE_CTA_THRESHOLD_PERCENT;
  const upgradeLabel = plan === 'reader' ? 'Upgrade to Pro' : 'Upgrade plan';

  return (
    <Card>
      <CardHeader className='pb-0'>
        <div className='flex items-center justify-between gap-3'>
          <div className='flex items-center gap-2'>
            <RotateCcw className='text-primary h-4 w-4' aria-hidden='true' />
            <CardTitle className='text-sm'>{_('AI usage limits')}</CardTitle>
          </div>
          {showUpgradeCta ? (
            <Button asChild variant='ghost' size='sm' className='text-primary px-2'>
              <Link href='/settings/billing'>{_(upgradeLabel)}</Link>
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className='divide-base-300 divide-y'>
        {hasFiniteRateLimit ? (
          <UsageLimitRow
            title={rateTitle}
            resetAt={rateResetAt}
            used={rateUsed}
            limit={rateLimit}
          />
        ) : null}
        {hasFiniteWeeklyLimit ? (
          <UsageLimitRow title='Weekly usage limit' resetAt={resetAt} used={used} limit={limit} />
        ) : (
          <div className='py-4'>
            <p className='text-base-content/60 text-sm'>{_('Unlimited AI allowance')}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
