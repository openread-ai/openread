export type UserPlan = 'free' | 'reader' | 'pro';

export interface TierDefinition {
  /** Messages allowed in the primary rolling window. null = unlimited. */
  ai_messages_per_window: number | null;
  /** Primary rolling window duration in hours. Gen 3 v3 uses 168 for weekly caps. */
  ai_window_hours: number;
  /** Short-window burst cap. null = no short-window cap. */
  ai_rate_limit: number | null;
  /** Short rolling window duration in hours. Only applies when ai_rate_limit is set. */
  ai_rate_window_hours: number | null;
  /** Model to fall back to when window limit is hit. null = hard stop (free tier). */
  ai_fallback_model: string | null;
  storage_gb: number;
  library_limit: number | null;
  can_tts: boolean;
  can_sync: boolean;
  can_translate: boolean;
  can_byok: boolean;
  can_boost: boolean;
  early_access: boolean;
  ai_model_tier: 'basic' | 'standard' | 'premium';
  ai_models: string[];
  display_price_cents: number;
  display_annual_price_cents: number;
  display_name: string;
}

export interface RegionalPricingEntry {
  currency: string;
  symbol: string;
  reader: number;
  pro: number;
}

export interface PublicPricingResponse {
  country: string;
  pricing: RegionalPricingEntry;
}

export interface StorageAddon {
  gb: number;
  price_cents: number;
  mobile_price_cents: number;
}

export interface BoostOption {
  messages: number;
  price_cents: number;
  mobile_price_cents: number;
  label: string;
}

export interface CostRates {
  ai_per_message: Record<string, number>;
  storage_per_gb_month: number;
  infra_fixed_month: number;
  payment_processing_rate: number;
}

export interface PlanCardDisplayGroup {
  name: string;
  features: string[];
}

export interface TierConfig {
  tiers: Record<UserPlan, TierDefinition>;
  regional_pricing: Record<string, RegionalPricingEntry>;
  storage_addons: StorageAddon[];
  boosts: BoostOption[];
  featureAliases: Record<string, string>;
  planCardDisplayPolicy: Record<UserPlan, PlanCardDisplayGroup[]>;
  ai_budget_ceiling: number;
  max_agent_steps: number;
  cost_rates: CostRates;
}

/**
 * Gen 3 v3 FINAL pricing/tier defaults.
 *
 * Runtime source of truth: latest row in the `tier_config` Supabase table.
 * Code fallback source of truth: this shared object, consumed by web/Tauri and
 * API fallback paths so launch limits do not drift across platform surfaces.
 *
 * Launch scope excludes TTS, translation, storage add-ons, and boosts. The
 * underlying implementations may remain in code, but tier/runtime surfaces must
 * treat them as unavailable unless a later final config changes.
 */
export const GEN3_V3_FALLBACK_TIER_CONFIG: TierConfig = {
  tiers: {
    free: {
      ai_messages_per_window: 100,
      ai_window_hours: 168,
      ai_rate_limit: 5,
      ai_rate_window_hours: 5,
      ai_fallback_model: null,
      storage_gb: 1,
      library_limit: 10,
      can_tts: false,
      can_sync: true,
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
      ai_messages_per_window: 500,
      ai_window_hours: 168,
      ai_rate_limit: 50,
      ai_rate_window_hours: 5,
      ai_fallback_model: 'openai/gpt-oss-20b',
      storage_gb: 10,
      library_limit: null,
      can_tts: false,
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
      ai_messages_per_window: 1000,
      ai_window_hours: 168,
      ai_rate_limit: 100,
      ai_rate_window_hours: 5,
      ai_fallback_model: 'openai/gpt-oss-120b',
      storage_gb: 50,
      library_limit: null,
      can_tts: false,
      can_sync: true,
      can_translate: false,
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
  regional_pricing: {},
  storage_addons: [],
  boosts: [],
  featureAliases: {
    essential_ai: 'Essential AI',
    standard_ai: 'Standard AI',
    premium_ai: 'Premium AI',
    basic_ai_models: 'Basic AI models',
    standard_ai_models: 'Standard AI models',
    premium_ai_models: 'Premium AI models',
    starter_library: 'Starter library',
    unlimited_library: 'Unlimited library',
    sync_across_devices: 'Sync across devices',
    early_access: 'Early access',
    cloud_storage: '{{storage_gb}} GB cloud storage',
  },
  planCardDisplayPolicy: {
    free: [
      { name: 'AI Features', features: ['essential_ai', 'basic_ai_models'] },
      { name: 'Reading', features: ['starter_library', 'sync_across_devices'] },
    ],
    reader: [
      { name: 'AI Features', features: ['standard_ai', 'standard_ai_models'] },
      { name: 'Reading', features: ['unlimited_library', 'sync_across_devices'] },
      { name: 'Storage', features: ['cloud_storage'] },
    ],
    pro: [
      { name: 'AI Features', features: ['premium_ai', 'premium_ai_models'] },
      { name: 'Reading', features: ['unlimited_library', 'sync_across_devices', 'early_access'] },
      { name: 'Storage', features: ['cloud_storage'] },
    ],
  },
  ai_budget_ceiling: 12000,
  max_agent_steps: 12,
  cost_rates: {
    ai_per_message: { free: 0.001, reader: 0.002, pro: 0.004 },
    storage_per_gb_month: 0.015,
    infra_fixed_month: 30,
    payment_processing_rate: 0.1,
  },
};

export function getGen3V3FallbackTierConfig(): TierConfig {
  return GEN3_V3_FALLBACK_TIER_CONFIG;
}
