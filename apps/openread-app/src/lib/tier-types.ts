import type { UserPlan } from '@/types/quota';

export interface TierDefinition {
  /** Messages allowed per time window. null = unlimited. */
  ai_messages_per_window: number | null;
  /** Time window in hours for AI message limit reset. */
  ai_window_hours: number;
  /** Rate limit: max messages per rate window. null = no rate limit (use window only). */
  ai_rate_limit: number | null;
  /** Rate window in hours. Only applies when ai_rate_limit is set. */
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

export interface TierConfig {
  tiers: Record<UserPlan, TierDefinition>;
  regional_pricing: Record<string, RegionalPricingEntry>;
  storage_addons: StorageAddon[];
  boosts: BoostOption[];
  ai_budget_ceiling: number;
  max_agent_steps: number;
  cost_rates: CostRates;
}
