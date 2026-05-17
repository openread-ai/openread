import type { TierConfig } from '@/lib/tier-types';

export const BYTES_PER_GB = 1024 * 1024 * 1024;

/**
 * Gen 3 v3 FINAL pricing/tier defaults.
 *
 * Runtime source of truth: latest row in the `tier_config` Supabase table.
 * Code fallback source of truth: this object. Client-safe modules should derive
 * limits and copy from this file instead of hardcoding tier values again.
 */
export const FALLBACK_CONFIG: TierConfig = {
  tiers: {
    free: {
      ai_messages_per_window: 25,
      ai_window_hours: 24,
      ai_rate_limit: 5,
      ai_rate_window_hours: 1,
      ai_fallback_model: null,
      storage_gb: 1,
      library_limit: 10,
      can_tts: false,
      can_sync: false,
      can_translate: false,
      can_byok: false,
      can_boost: false,
      early_access: false,
      ai_model_tier: 'basic',
      ai_models: ['openai/gpt-oss-20b'],
      display_price_cents: 0,
      display_annual_price_cents: 0,
      display_name: 'Free',
    },
    reader: {
      ai_messages_per_window: 50,
      ai_window_hours: 3,
      ai_rate_limit: null,
      ai_rate_window_hours: null,
      ai_fallback_model: 'openai/gpt-oss-20b',
      storage_gb: 10,
      library_limit: null,
      can_tts: true,
      can_sync: true,
      can_translate: false,
      can_byok: true,
      can_boost: false,
      early_access: false,
      ai_model_tier: 'standard',
      ai_models: ['openai/gpt-oss-120b', 'google/gemini-2.5-flash-lite'],
      display_price_cents: 999,
      display_annual_price_cents: 9999,
      display_name: 'Reader',
    },
    pro: {
      ai_messages_per_window: 100,
      ai_window_hours: 3,
      ai_rate_limit: null,
      ai_rate_window_hours: null,
      ai_fallback_model: 'openai/gpt-oss-120b',
      storage_gb: 50,
      library_limit: null,
      can_tts: true,
      can_sync: true,
      can_translate: true,
      can_byok: true,
      can_boost: false,
      early_access: true,
      ai_model_tier: 'premium',
      ai_models: ['anthropic/claude-haiku-4.5', 'openai/gpt-4.1-mini'],
      display_price_cents: 1999,
      display_annual_price_cents: 19999,
      display_name: 'Pro',
    },
  },
  regional_pricing: {
    IN: { currency: 'INR', symbol: '\u20B9', reader: 349, pro: 699 },
    BR: { currency: 'BRL', symbol: 'R$', reader: 29.99, pro: 59.99 },
  },
  storage_addons: [],
  boosts: [],
  ai_budget_ceiling: 12000,
  max_agent_steps: 12,
  cost_rates: {
    ai_per_message: { free: 0.001, reader: 0.002, pro: 0.004 },
    storage_per_gb_month: 0.015,
    infra_fixed_month: 30,
    payment_processing_rate: 0.1,
  },
};

export function getFallbackConfig(): TierConfig {
  return FALLBACK_CONFIG;
}
