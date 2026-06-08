import {
  BYTES_PER_GB,
  GEN3_V3_FALLBACK_TIER_CONFIG,
  getGen3V3FallbackTierConfig,
} from '@openread/types';
import type { TierConfig } from '@/lib/tier-types';

/**
 * Gen 3 v3 FINAL pricing/tier defaults.
 *
 * Launch scope excludes TTS, translation, storage add-ons, and boosts. The
 * underlying reader implementations may remain in code, but tier/runtime
 * surfaces must treat them as unavailable unless a later final config changes.
 *
 * Runtime source of truth: latest row in the `tier_config` Supabase table.
 * Shared code fallback source of truth: `@openread/types` so web/Tauri and Hono
 * API fallback paths use the same launch contract.
 */
export const FALLBACK_CONFIG: TierConfig = GEN3_V3_FALLBACK_TIER_CONFIG;

export { BYTES_PER_GB };

export function getFallbackConfig(): TierConfig {
  return getGen3V3FallbackTierConfig();
}
