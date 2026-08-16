/**
 * Database-driven tier configuration.
 *
 * Reads from the `tier_config` Supabase table (append-only).
 * Latest row by created_at is the active config.
 * Caches in memory for 5 minutes.
 * Throws if the runtime contract cannot be loaded; callers must not invent
 * plan/gate behavior from stale hardcoded config.
 */

import type { UserPlan } from '@/types/quota';
import type { TierConfig, TierDefinition, RegionalPricingEntry } from '@/lib/tier-types';
import { FALLBACK_CONFIG } from '@/lib/tier-defaults';
import { createSupabaseAdminClient } from '@/utils/supabase-admin.server';
import { createLogger } from '@/utils/logger';

export type {
  TierDefinition,
  RegionalPricingEntry,
  StorageAddon,
  BoostOption,
  CostRates,
  TierConfig,
} from '@/lib/tier-types';

const log = createLogger('tier-config');

export class TierConfigError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'TierConfigError';
  }
}

// ─── Cache ───────────────────────────────────────────────────────────

let cachedConfig: TierConfig | null = null;
let cachedAt = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Get the active tier configuration. Reads from DB with 5-minute cache.
 * Throws when the runtime tier contract is unavailable.
 */
export async function getTierConfig(): Promise<TierConfig> {
  const now = Date.now();
  if (cachedConfig && now - cachedAt < CACHE_TTL) {
    return cachedConfig;
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from('tier_config')
      .select('config')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      throw new TierConfigError(`Failed to read tier_config: ${error.message}`);
    }
    if (!data?.config) {
      throw new TierConfigError('No active tier_config row found');
    }

    cachedConfig = data.config as TierConfig;
    cachedAt = now;
    return cachedConfig;
  } catch (err) {
    if (err instanceof TierConfigError) {
      log.error(err.message);
      throw err;
    }
    const error = err instanceof Error ? err : new Error(String(err));
    log.error('Exception reading tier_config', error);
    throw new TierConfigError('Failed to load runtime tier_config', { cause: error });
  }
}

/**
 * Get the configuration for a specific tier.
 * Falls back to the 'free' tier definition if the plan is unknown.
 */
export async function getTierDefinition(plan: UserPlan): Promise<TierDefinition> {
  const config = await getTierConfig();
  return config.tiers[plan] || config.tiers.free;
}

/**
 * Get launch pricing for public display.
 *
 * Stripe web billing is USD-only at launch. The country argument is accepted
 * for backwards-compatible callers but must not select local rates.
 */
export async function getRegionalPricing(_countryCode: string): Promise<RegionalPricingEntry> {
  const config = await getTierConfig();
  return {
    currency: 'USD',
    symbol: '$',
    reader: config.tiers.reader.display_price_cents / 100,
    pro: config.tiers.pro.display_price_cents / 100,
  };
}

/**
 * Force-clear the cache. Useful after an INSERT into tier_config.
 */
export function invalidateTierConfigCache(): void {
  cachedConfig = null;
  cachedAt = 0;
}

/**
 * Get the static launch tier seed for tests/migrations only.
 * Runtime paths must use getTierConfig() and fail if tier_config is unavailable.
 */
export function getFallbackConfig(): TierConfig {
  return FALLBACK_CONFIG;
}
