import { createLogger } from '@/utils/logger';
import { createSupabaseAdminClient } from '@/utils/supabase';
import type { UserPlan } from '@/types/quota';

const logger = createLogger('server-plan');

/** Normalize legacy persisted/token plan values to the current canonical plan ids. */
export function normalizeUserPlan(rawPlan: string | null | undefined): UserPlan {
  if (rawPlan === 'plus') return 'reader';
  if (rawPlan === 'purchase') return 'free';
  if (rawPlan === 'reader' || rawPlan === 'pro') return rawPlan;
  return 'free';
}

/**
 * Resolve the canonical server-side plan for entitlement checks.
 *
 * JWTs authenticate identity only; billing/entitlement state is owned by the
 * plans table so Stripe, IAP, and manual repair paths all converge here.
 */
export async function resolveServerUserPlan(
  userId: string,
  supabase = createSupabaseAdminClient(),
): Promise<UserPlan> {
  const { data, error } = await supabase
    .from('plans')
    .select('plan')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    logger.warn('Failed to resolve canonical user plan', error);
    return 'free';
  }

  return normalizeUserPlan((data as { plan?: string | null } | null)?.plan);
}
