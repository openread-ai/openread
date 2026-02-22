/**
 * @module services/sync/fieldLww
 * P9.29: Field-level last-write-wins merge for books and configs.
 *
 * Instead of record-level LWW (which can lose concurrent changes to different fields),
 * this module compares per-field timestamps from `field_versions` JSONB.
 *
 * Records with empty field_versions fall back to record-level LWW for backward compatibility.
 */

/** Fields tracked for field-level LWW on books */
export const BOOK_TRACKED_FIELDS = [
  'title',
  'author',
  'format',
  'reading_status',
  'tags',
  'progress',
] as const;

/** Fields tracked for field-level LWW on book_configs */
export const CONFIG_TRACKED_FIELDS = [
  'progress',
  'location',
  'view_settings',
  'search_config',
] as const;

/** Maps field names to ISO 8601 timestamps of their last update.
 * Timestamps MUST be in ISO 8601 format to ensure correct comparison. */
export type FieldVersions = Record<string, string>;

/**
 * Merge two records using field-level LWW.
 *
 * For each tracked field:
 * - If server has a newer timestamp in field_versions, server's value wins
 * - If local has a newer timestamp, local's value is kept
 * - If field_versions is empty, falls back to record-level updated_at comparison
 *
 * @param local - Local record with field values and versions
 * @param server - Server record with field values and versions
 * @param trackedFields - List of field names to merge individually
 * @returns Merged record with combined field_versions
 */
export function mergeWithFieldVersions<T extends Record<string, unknown>>(
  local: T & { updated_at?: string | number; field_versions?: FieldVersions },
  server: T & { updated_at?: string | number; field_versions?: FieldVersions },
  trackedFields: readonly string[],
): T & { field_versions: FieldVersions } {
  const localVersions = local.field_versions || {};
  const serverVersions = server.field_versions || {};

  // If both sides have empty field_versions, fall back to record-level LWW
  const hasFieldVersions =
    Object.keys(localVersions).length > 0 || Object.keys(serverVersions).length > 0;

  if (!hasFieldVersions) {
    // Record-level LWW fallback
    const localTime = toTimestamp(local.updated_at);
    const serverTime = toTimestamp(server.updated_at);
    if (serverTime > localTime) {
      return { ...server, field_versions: {} };
    }
    return { ...local, field_versions: {} };
  }

  // Field-level merge
  const merged = { ...local } as T & { field_versions: FieldVersions };
  const mergedVersions: FieldVersions = { ...localVersions };

  for (const field of trackedFields) {
    const localFieldTime =
      localVersions[field] || (local.updated_at ? String(local.updated_at) : '');
    const serverFieldTime =
      serverVersions[field] || (server.updated_at ? String(server.updated_at) : '');

    if (toTimestamp(serverFieldTime) > toTimestamp(localFieldTime)) {
      // Server wins for this field
      (merged as Record<string, unknown>)[field] = (server as Record<string, unknown>)[field];
      mergedVersions[field] = serverFieldTime;
    } else {
      // Local wins (or equal) — keep local value, keep local version
      if (localVersions[field]) {
        mergedVersions[field] = localVersions[field];
      }
    }
  }

  merged.field_versions = mergedVersions;
  return merged;
}

/**
 * Update field_versions when a single field is modified locally.
 * Returns the updated field_versions object.
 */
export function updateFieldVersion(
  currentVersions: FieldVersions | undefined,
  fieldName: string,
): FieldVersions {
  return {
    ...(currentVersions || {}),
    [fieldName]: new Date().toISOString(),
  };
}

/**
 * Convert various timestamp formats to milliseconds since epoch.
 */
function toTimestamp(value: string | number | undefined | null): number {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  return new Date(value).getTime();
}
