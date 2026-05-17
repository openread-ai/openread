/**
 * Storage Quota Manager — cloud storage tracking for user accounts.
 *
 * Each tier has a standard storage allocation (from tier_config).
 * Storage usage is tracked atomically via DB RPCs to prevent race conditions.
 *
 * Available to all tiers; Free has 1 GB, Reader has 10 GB, and Pro has 50 GB by default.
 */

import { createSupabaseAdminClient } from '@/utils/supabase';
import { getTierDefinition } from '@/lib/tier-config';
import { createLogger } from '@/utils/logger';
import type { UserPlan } from '@/types/quota';

const log = createLogger('storage-quota');

// ─── Types ───────────────────────────────────────────────────────────

export interface StorageQuota {
  /** Base storage in GB from the user's tier */
  baseGb: number;
  /** Additional storage in GB from active add-ons. Kept for API compatibility; always 0. */
  addonGb: number;
  /** Total available storage in bytes from the user's plan tier */
  totalBytes: number;
  /** Storage currently used in bytes */
  usedBytes: number;
  /** Remaining available storage in bytes */
  availableBytes: number;
  /** Usage as a percentage (0-100+, can exceed 100 if over limit) */
  percentUsed: number;
  /** Whether the user has exceeded their total storage limit */
  isOverLimit: boolean;
}

export interface StorageAddonRecord {
  id: string;
  user_id: string;
  gb_amount: number;
  price_cents: number;
  source: string;
  source_subscription_id: string | null;
  status: string;
  created_at: string;
  canceled_at: string | null;
}

// ─── Constants ───────────────────────────────────────────────────────

const BYTES_PER_GB = 1024 * 1024 * 1024;

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Calculate the full storage quota for a user from their plan tier and current usage.
 */
export async function getStorageQuota(userId: string, plan: UserPlan): Promise<StorageQuota> {
  const supabase = createSupabaseAdminClient();
  const tierDef = await getTierDefinition(plan);

  const baseGb = tierDef.storage_gb;
  const addonGb = 0;
  const totalBytes = baseGb * BYTES_PER_GB;

  // Get used bytes from plans table
  const { data: planData, error: planError } = await supabase
    .from('plans')
    .select('storage_used_bytes')
    .eq('id', userId)
    .single();

  if (planError) {
    log.warn('Failed to fetch storage usage:', planError.message);
  }

  const usedBytes = planData?.storage_used_bytes || 0;

  return {
    baseGb,
    addonGb,
    totalBytes,
    usedBytes,
    availableBytes: Math.max(0, totalBytes - usedBytes),
    percentUsed: totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0,
    isOverLimit: usedBytes > totalBytes,
  };
}

/**
 * Storage add-ons are disabled. Kept for API compatibility.
 */
export async function getActiveAddons(userId: string): Promise<StorageAddonRecord[]> {
  void userId;
  return [];
}

/**
 * Storage add-ons are disabled. Kept for API compatibility.
 */
export async function getAddonStorageGb(userId: string): Promise<number> {
  void userId;
  return 0;
}

/**
 * Atomically increment storage_used_bytes in the plans table.
 * Called when a file is uploaded to cloud storage.
 *
 * Returns true on success, false on error.
 */
export async function incrementStorageUsed(userId: string, bytes: number): Promise<boolean> {
  const supabase = createSupabaseAdminClient();

  const { error } = await supabase.rpc('increment_storage_used', {
    p_user_id: userId,
    p_bytes: bytes,
  });

  if (error) {
    log.error('Failed to increment storage used:', error.message);
    return false;
  }

  return true;
}

/**
 * Atomically decrement storage_used_bytes in the plans table.
 * Called when a file is deleted from cloud storage.
 * The DB function clamps to 0 — it will never go negative.
 *
 * Returns true on success, false on error.
 */
export async function decrementStorageUsed(userId: string, bytes: number): Promise<boolean> {
  const supabase = createSupabaseAdminClient();

  const { error } = await supabase.rpc('decrement_storage_used', {
    p_user_id: userId,
    p_bytes: bytes,
  });

  if (error) {
    log.error('Failed to decrement storage used:', error.message);
    return false;
  }

  return true;
}

/**
 * Storage add-ons are disabled. Kept for legacy webhook compatibility.
 */
export async function createStorageAddon(
  userId: string,
  gbAmount: number,
  priceCents: number,
  sourceSubscriptionId: string,
  source = 'stripe',
): Promise<StorageAddonRecord | null> {
  void userId;
  void gbAmount;
  void priceCents;
  void sourceSubscriptionId;
  void source;
  log.warn('Storage add-ons are disabled; createStorageAddon was ignored.');
  return null;
}

/**
 * Storage add-ons are disabled. Kept for legacy webhook compatibility.
 */
export async function cancelStorageAddon(addonId: string): Promise<boolean> {
  void addonId;
  log.warn('Storage add-ons are disabled; cancelStorageAddon was ignored.');
  return false;
}
