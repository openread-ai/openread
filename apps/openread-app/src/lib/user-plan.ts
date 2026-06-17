import type { UserPlan } from '@/types/quota';

/** Normalize legacy persisted/token plan values to current canonical plan ids. */
export function normalizeUserPlan(rawPlan: string | null | undefined): UserPlan {
  if (rawPlan === 'plus') return 'reader';
  if (rawPlan === 'purchase') return 'free';
  if (rawPlan === 'reader' || rawPlan === 'pro') return rawPlan;
  return 'free';
}
