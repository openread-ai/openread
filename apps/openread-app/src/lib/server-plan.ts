import { createLogger } from '@/utils/logger';
import { createSupabaseAdminClient } from '@/utils/supabase';
import { normalizeUserPlan } from '@/lib/user-plan';
import type { UserPlan } from '@/types/quota';

export { normalizeUserPlan } from '@/lib/user-plan';

const logger = createLogger('server-plan');

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
