import { GEN3_V3_FALLBACK_TIER_CONFIG, getGen3V3FallbackTierConfig } from '@openread/types';
import type { TierConfig } from '@/lib/tier-types';

/**
 * Gen 3 v3 FINAL pricing/tier defaults.
 *
 * Launch scope excludes TTS, translation, storage add-ons, and boosts. The
 * underlying reader implementations may remain in code, but tier/runtime
 * surfaces must treat them as unavailable unless a later final config changes.
 *
 * Runtime source of truth: latest row in the `tier_config` Supabase table.
 * Static seed/test source: `@openread/types` so migrations, tests, and explicit
 * fixtures share the same launch contract without becoming runtime fallbacks.
 */
export const FALLBACK_CONFIG: TierConfig = GEN3_V3_FALLBACK_TIER_CONFIG;

export function getFallbackConfig(): TierConfig {
  return getGen3V3FallbackTierConfig();
}
