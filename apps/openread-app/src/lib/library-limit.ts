import { evaluateLibraryLimit, type LibraryLimitDecision } from '@openread/types';
import type { UserPlan } from '@/types/quota';
import { getTierConfig } from '@/lib/tier-config';
import { createSupabaseAdminClient } from '@/utils/supabase';

export type LibraryLimitErrorCode = 'LIBRARY_LIMIT_REACHED' | 'LIBRARY_LIMIT_CHECK_FAILED';

export class LibraryLimitError extends Error {
  constructor(
    public readonly code: LibraryLimitErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'LibraryLimitError';
  }
}

export function isLibraryLimitError(error: unknown): error is LibraryLimitError {
  return error instanceof LibraryLimitError;
}

async function hasActiveBook(userId: string, bookHash?: string | null): Promise<boolean> {
  if (!bookHash) return false;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from('books')
    .select('id')
    .eq('user_id', userId)
    .eq('book_hash', bookHash)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new LibraryLimitError(
      'LIBRARY_LIMIT_CHECK_FAILED',
      'Could not verify library capacity',
      500,
    );
  }

  return Boolean(data);
}

async function getActiveBookCount(userId: string): Promise<number> {
  const supabase = createSupabaseAdminClient();
  const { count, error } = await supabase
    .from('books')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('deleted_at', null);

  if (error) {
    throw new LibraryLimitError(
      'LIBRARY_LIMIT_CHECK_FAILED',
      'Could not verify library capacity',
      500,
    );
  }

  return count ?? 0;
}

export async function assertCanIncreaseLibrary(
  userId: string,
  plan: UserPlan,
  opts: { bookHash?: string | null; requestedIncrease?: number } = {},
): Promise<LibraryLimitDecision> {
  if (await hasActiveBook(userId, opts.bookHash)) {
    return {
      allowed: true,
      limit: null,
      activeCount: 0,
      remaining: null,
    };
  }

  const [config, activeCount] = await Promise.all([getTierConfig(), getActiveBookCount(userId)]);
  const decision = evaluateLibraryLimit(plan, config, activeCount, opts.requestedIncrease ?? 1);

  if (!decision.allowed) {
    throw new LibraryLimitError(
      'LIBRARY_LIMIT_REACHED',
      `Library limit reached. Your plan allows ${decision.limit} books.`,
      403,
      {
        limit: decision.limit,
        activeCount: decision.activeCount,
        remaining: decision.remaining,
        upgradeUrl: '/settings/billing#plans',
      },
    );
  }

  return decision;
}
