/**
 * Database-driven tier configuration.
 *
 * Reads from the `tier_config` Supabase table (append-only).
 * Latest row by created_at is the active config.
 * Caches in memory for 5 minutes.
 * Falls back to hardcoded defaults if DB is unreachable.
 */

import type { UserPlan } from '@/types/quota';
import type { TierConfig, TierDefinition, RegionalPricingEntry } from '@/lib/tier-types';
import { FALLBACK_CONFIG } from '@/lib/tier-defaults';
import { createSupabaseAdminClient } from '@/utils/supabase';
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

// ─── Cache ───────────────────────────────────────────────────────────

let cachedConfig: TierConfig | null = null;
let cachedAt = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Get the active tier configuration. Reads from DB with 5-minute cache.
 * Falls back to FALLBACK_CONFIG if DB is unreachable or table is empty.
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

    if (error || !data?.config) {
      log.warn('Failed to read tier_config from DB, using fallback:', error?.message);
      cachedConfig = FALLBACK_CONFIG;
    } else {
      cachedConfig = data.config as TierConfig;
    }
  } catch (err) {
    log.warn('Exception reading tier_config, using fallback:', err);
    cachedConfig = FALLBACK_CONFIG;
  }

  cachedAt = now;
  return cachedConfig!;
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
 * Get regional pricing for a country code (ISO 3166-1 alpha-2).
 * Falls back to USD defaults derived from tier display prices.
 */
export async function getRegionalPricing(countryCode: string): Promise<RegionalPricingEntry> {
  const config = await getTierConfig();
  return (
    config.regional_pricing[countryCode?.toUpperCase()] || {
      currency: 'USD',
      symbol: '$',
      reader: config.tiers.reader.display_price_cents / 100,
      pro: config.tiers.pro.display_price_cents / 100,
    }
  );
}

/**
 * Force-clear the cache. Useful after an INSERT into tier_config.
 */
export function invalidateTierConfigCache(): void {
  cachedConfig = null;
  cachedAt = 0;
}

/**
 * Get the fallback config (for testing or when DB is explicitly not available).
 */
export function getFallbackConfig(): TierConfig {
  return FALLBACK_CONFIG;
}
